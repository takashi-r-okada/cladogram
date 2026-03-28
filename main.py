import os
import json
import shutil
import time
import hashlib
import secrets
import threading
from fastapi import FastAPI, Request, Form, Body, UploadFile, File, Cookie, Response, BackgroundTasks
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

from generate_sample import generate_rich_cladogram

app = FastAPI(title="分岐図鑑書架 (cladogram)")

DATA_DIR = "data"
TEMPLATES_DIR = "templates"
STATIC_DIR = "static"
USERS_FILE = os.path.join(DATA_DIR, "users.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

templates = Jinja2Templates(directory=TEMPLATES_DIR)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

GENERATION_JOBS = {}
GENERATION_JOBS_LOCK = threading.Lock()


def update_generation_job(job_id: str, **fields):
    with GENERATION_JOBS_LOCK:
        job = GENERATION_JOBS.setdefault(job_id, {})
        job.update(fields)
        job["updated_at"] = time.time()


def get_generation_job(job_id: str):
    with GENERATION_JOBS_LOCK:
        job = GENERATION_JOBS.get(job_id)
        return dict(job) if job else None


def run_generation_job(job_id: str, target_name: str, owner: str):
    def on_progress(event: str, detail: dict):
        update_generation_job(
            job_id,
            status="running",
            event=event,
            detail=detail,
        )

    try:
        on_progress("initializing", {"target_name": target_name})
        generate_rich_cladogram(target_name, owner=owner, progress_callback=on_progress)
        update_generation_job(
            job_id,
            status="success",
            event="completed",
            detail={"target_name": target_name},
            redirect_url=f"/editor/{target_name}",
        )
    except RuntimeError as exc:
        error_code = str(exc)
        if error_code.startswith("generation_failed:"):
            code = "generation_failed"
            raw_message = error_code.split(":", 1)[1]
        else:
            code = error_code
            raw_message = error_code

        update_generation_job(
            job_id,
            status="error",
            event="error",
            detail={"target_name": target_name, "code": code, "raw_message": raw_message},
        )

# ==========================================
# ユーザー＆認証管理
# ==========================================
def load_users():
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"users": {}, "sessions": {}}

def save_users(data):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def hash_password(password: str, salt: str = None):
    if salt is None: salt = secrets.token_hex(16)
    # 簡易的かつセキュアなハッシュ化
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return hashed, salt

def get_current_user(session_id: str = Cookie(None)):
    if not session_id: return None
    users_data = load_users()
    return users_data["sessions"].get(session_id)

# ==========================================
# 図鑑の権限(メタデータ)管理
# ==========================================
def get_meta(zukan_name: str):
    meta_file = os.path.join(DATA_DIR, zukan_name, "meta.json")
    if os.path.exists(meta_file):
        with open(meta_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"owner": None, "editors": []}

def save_meta(zukan_name: str, meta: dict):
    meta_file = os.path.join(DATA_DIR, zukan_name, "meta.json")
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

def can_edit(zukan_name: str, username: str):
    if not username: return False
    meta = get_meta(zukan_name)
    return username == meta.get("owner") or username in meta.get("editors", [])

def is_owner(zukan_name: str, username: str):
    if not username: return False
    meta = get_meta(zukan_name)
    return username == meta.get("owner")

# ==========================================
# アカウント系 ルーティング
# ==========================================
@app.get("/register")
async def register_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={"mode": "register"})

@app.post("/register")
async def do_register(username: str = Form(...), password: str = Form(...)):
    users_data = load_users()
    if username in users_data["users"]:
        return RedirectResponse(url="/register?error=exists", status_code=303)
    
    hashed, salt = hash_password(password)
    users_data["users"][username] = {"pass_hash": hashed, "salt": salt}
    save_users(users_data)
    return RedirectResponse(url="/login", status_code=303)

@app.get("/login")
async def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={"mode": "login"})

@app.post("/login")
async def do_login(response: Response, username: str = Form(...), password: str = Form(...)):
    users_data = load_users()
    user = users_data["users"].get(username)
    if user:
        hashed, _ = hash_password(password, user["salt"])
        if hashed == user["pass_hash"]:
            session_id = secrets.token_hex(32)
            users_data["sessions"][session_id] = username
            save_users(users_data)
            # ログイン成功でクッキー発行
            response = RedirectResponse(url="/", status_code=303)
            response.set_cookie(key="session_id", value=session_id, httponly=True)
            return response
    return RedirectResponse(url="/login?error=invalid", status_code=303)

@app.get("/logout")
async def logout(response: Response, session_id: str = Cookie(None)):
    if session_id:
        users_data = load_users()
        if session_id in users_data["sessions"]:
            del users_data["sessions"][session_id]
            save_users(users_data)
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie("session_id")
    return response

# ==========================================
# 図鑑・ページ系 ルーティング
# ==========================================
@app.get("/")
async def read_root(request: Request, session_id: str = Cookie(None)):
    current_user = get_current_user(session_id)
    zukans = []
    if os.path.exists(DATA_DIR):
        for d in os.listdir(DATA_DIR):
            target_dir = os.path.join(DATA_DIR, d)
            if os.path.isdir(target_dir):
                meta = get_meta(d)
                zukans.append({
                    "name": d,
                    "owner": meta.get("owner"),
                    "can_edit": can_edit(d, current_user),
                    "is_owner": is_owner(d, current_user)
                })
    return templates.TemplateResponse(request=request, name="index.html", context={
        "zukans": zukans, "current_user": current_user
    })

@app.post("/create")
async def create_zukan(zukan_name: str = Form(...), session_id: str = Cookie(None)):
    current_user = get_current_user(session_id)
    if not current_user:
        return RedirectResponse(url="/login", status_code=303)

    target_dir = os.path.join(DATA_DIR, zukan_name)
    images_dir = os.path.join(target_dir, "images")
    tree_file = os.path.join(target_dir, "tree.json")
    
    if not os.path.exists(target_dir):
        os.makedirs(images_dir, exist_ok=True)
        initial_data = {
            "id": "root", "name_ja": "共通祖先", "name_sci": "Common Ancestor",
            "status": "normal", "images": [], "groups": [], "children": []
        }
        with open(tree_file, "w", encoding="utf-8") as f:
            json.dump(initial_data, f, ensure_ascii=False, indent=2)
            
        # オーナーとして登録
        save_meta(zukan_name, {"owner": current_user, "editors": []})
        
    return RedirectResponse(url=f"/editor/{zukan_name}", status_code=303)


@app.post("/api/generate_sample")
async def start_generate_sample(
    background_tasks: BackgroundTasks,
    payload: dict = Body(...),
    session_id: str = Cookie(None),
):
    current_user = get_current_user(session_id)
    if not current_user:
        return {"status": "error", "code": "login_required"}

    target_name = (payload.get("target_name") or "").strip()
    if not target_name:
        return {"status": "error", "code": "target_required"}

    target_dir = os.path.join(DATA_DIR, target_name)
    if os.path.exists(target_dir):
        return {"status": "error", "code": "already_exists"}

    job_id = secrets.token_hex(16)
    update_generation_job(
        job_id,
        status="queued",
        event="queued",
        username=current_user,
        detail={"target_name": target_name},
    )
    background_tasks.add_task(run_generation_job, job_id, target_name, current_user)
    return {"status": "queued", "job_id": job_id}


@app.get("/api/generate_sample/{job_id}")
async def get_generate_sample_status(job_id: str, session_id: str = Cookie(None)):
    current_user = get_current_user(session_id)
    job = get_generation_job(job_id)
    if not job:
        return {"status": "error", "code": "job_not_found"}
    if job.get("username") != current_user:
        return {"status": "error", "code": "forbidden"}
    return job

@app.get("/editor/{zukan_name}")
async def edit_zukan(request: Request, zukan_name: str, session_id: str = Cookie(None)):
    target_dir = os.path.join(DATA_DIR, zukan_name)
    tree_file = os.path.join(target_dir, "tree.json")
    tree_data = {}
    if os.path.exists(tree_file):
        with open(tree_file, "r", encoding="utf-8") as f:
            tree_data = json.load(f)
            
    current_user = get_current_user(session_id)
    return templates.TemplateResponse(
        request=request, name="editor.html", 
        context={
            "zukan_name": zukan_name, "tree_data": tree_data,
            "can_edit": can_edit(zukan_name, current_user),
            "current_user": current_user
        }
    )

# ==========================================
# API系 (権限チェック追加)
# ==========================================
@app.post("/api/editor/{zukan_name}/save")
async def save_tree(zukan_name: str, tree_data: dict = Body(...), session_id: str = Cookie(None)):
    if not can_edit(zukan_name, get_current_user(session_id)):
        return {"status": "error", "message": "権限がありません"}
        
    target_dir = os.path.join(DATA_DIR, zukan_name)
    tree_file = os.path.join(target_dir, "tree.json")
    if os.path.exists(target_dir):
        with open(tree_file, "w", encoding="utf-8") as f:
            json.dump(tree_data, f, ensure_ascii=False, indent=2)
        return {"status": "success"}
    return {"status": "error"}

@app.post("/api/editor/{zukan_name}/upload_image")
async def upload_image(zukan_name: str, file: UploadFile = File(...), session_id: str = Cookie(None)):
    if not can_edit(zukan_name, get_current_user(session_id)):
        return {"status": "error"}
        
    target_dir = os.path.join(DATA_DIR, zukan_name)
    images_dir = os.path.join(target_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    filename = f"{int(time.time())}_{file.filename}"
    file_path = os.path.join(images_dir, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "image_url": f"/data/{zukan_name}/images/{filename}"}

@app.post("/api/zukan/{zukan_name}/rename")
async def rename_zukan(zukan_name: str, payload: dict = Body(...), session_id: str = Cookie(None)):
    if not is_owner(zukan_name, get_current_user(session_id)):
        return {"status": "error", "message": "オーナー権限が必要です"}
        
    new_name = payload.get("new_name")
    old_dir = os.path.join(DATA_DIR, zukan_name)
    new_dir = os.path.join(DATA_DIR, new_name)
    if os.path.exists(old_dir) and not os.path.exists(new_dir):
        os.rename(old_dir, new_dir)
        return {"status": "success"}
    return {"status": "error"}

@app.post("/api/zukan/{zukan_name}/delete")
async def delete_zukan(zukan_name: str, session_id: str = Cookie(None)):
    if not is_owner(zukan_name, get_current_user(session_id)):
        return {"status": "error", "message": "オーナー権限が必要です"}
        
    target_dir = os.path.join(DATA_DIR, zukan_name)
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
        return {"status": "success"}
    return {"status": "error"}

@app.post("/api/zukan/{zukan_name}/duplicate")
async def duplicate_zukan(zukan_name: str, payload: dict = Body(...), session_id: str = Cookie(None)):
    current_user = get_current_user(session_id)
    if not current_user: return {"status": "error", "message": "ログインが必要です"}
        
    new_name = payload.get("new_name")
    old_dir = os.path.join(DATA_DIR, zukan_name)
    new_dir = os.path.join(DATA_DIR, new_name)
    if os.path.exists(old_dir) and not os.path.exists(new_dir):
        shutil.copytree(old_dir, new_dir)
        # コピーした人が新たなオーナーになる
        save_meta(new_name, {"owner": current_user, "editors": []})
        return {"status": "success"}
    return {"status": "error"}

@app.post("/api/zukan/{zukan_name}/add_editor")
async def add_editor(zukan_name: str, payload: dict = Body(...), session_id: str = Cookie(None)):
    # 編集権限があれば誰でも他の人を招待できる
    if not can_edit(zukan_name, get_current_user(session_id)):
        return {"status": "error", "message": "権限がありません"}
    
    new_editor = payload.get("username")
    users_data = load_users()
    if new_editor not in users_data["users"]:
        return {"status": "error", "message": "ユーザーが存在しません"}
        
    meta = get_meta(zukan_name)
    if new_editor not in meta.get("editors", []) and new_editor != meta.get("owner"):
        if "editors" not in meta: meta["editors"] = []
        meta["editors"].append(new_editor)
        save_meta(zukan_name, meta)
        
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9200)