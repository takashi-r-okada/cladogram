import os
import json
import shutil # ファイル保存用に追加
import time   # ファイル名生成用に追加
from fastapi import FastAPI, Request, Form, Body, UploadFile, File # UploadFile, File を追加
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="分岐図鑑書架 (cladogram)")

# --- (既存のコード: DATA_DIR 等の設定と read_root, create_zukan, edit_zukan はそのまま) ---
# ディレクトリの設定
DATA_DIR = "data"
TEMPLATES_DIR = "templates"
STATIC_DIR = "static"

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

templates = Jinja2Templates(directory=TEMPLATES_DIR)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

@app.get("/")
async def read_root(request: Request):
    zukans = []
    if os.path.exists(DATA_DIR):
        zukans = [d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))]
    return templates.TemplateResponse(request=request, name="index.html", context={"zukans": zukans})

@app.post("/create")
async def create_zukan(zukan_name: str = Form(...)):
    target_dir = os.path.join(DATA_DIR, zukan_name)
    images_dir = os.path.join(target_dir, "images")
    tree_file = os.path.join(target_dir, "tree.json")
    if not os.path.exists(target_dir):
        os.makedirs(images_dir, exist_ok=True)
        initial_data = {
            "id": "root",
            "name_ja": "共通祖先",
            "name_sci": "Common Ancestor",
            "images": [],
            "children": []
        }
        with open(tree_file, "w", encoding="utf-8") as f:
            json.dump(initial_data, f, ensure_ascii=False, indent=2)
    return RedirectResponse(url=f"/editor/{zukan_name}", status_code=303)

@app.get("/editor/{zukan_name}")
async def edit_zukan(request: Request, zukan_name: str):
    target_dir = os.path.join(DATA_DIR, zukan_name)
    tree_file = os.path.join(target_dir, "tree.json")
    tree_data = {}
    if os.path.exists(tree_file):
        with open(tree_file, "r", encoding="utf-8") as f:
            tree_data = json.load(f)
    return templates.TemplateResponse(
        request=request,
        name="editor.html", 
        context={"zukan_name": zukan_name, "tree_data": tree_data}
    )

# --- ここから下を追記・追加します ---

@app.post("/api/editor/{zukan_name}/save")
async def save_tree(zukan_name: str, tree_data: dict = Body(...)):
    """フロントエンドから送信されたJSONデータを受け取り、ファイルを上書き保存するAPI"""
    target_dir = os.path.join(DATA_DIR, zukan_name)
    tree_file = os.path.join(target_dir, "tree.json")
    
    if os.path.exists(target_dir):
        with open(tree_file, "w", encoding="utf-8") as f:
            # 日本語が文字化けしないように ensure_ascii=False を指定
            json.dump(tree_data, f, ensure_ascii=False, indent=2)
        return {"status": "success", "message": "保存しました"}
    
    return {"status": "error", "message": "図鑑が見つかりません"}


@app.post("/api/editor/{zukan_name}/upload_image")
async def upload_image(zukan_name: str, file: UploadFile = File(...)):
    """送信された画像を保存し、そのURLパスを返すAPI"""
    target_dir = os.path.join(DATA_DIR, zukan_name)
    images_dir = os.path.join(target_dir, "images")
    
    # imagesフォルダがない場合は作成（念のため）
    os.makedirs(images_dir, exist_ok=True)
        
    # 同名ファイルの上書きを防ぐため、タイムスタンプをファイル名に付与
    filename = f"{int(time.time())}_{file.filename}"
    file_path = os.path.join(images_dir, filename)
    
    # ファイルを保存
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # フロントエンドからアクセスできる画像のURLパスを返す
    image_url = f"/data/{zukan_name}/images/{filename}"
    
    return {"status": "success", "image_url": image_url}



# --- 以下、main.pyの末尾に追記 ---

@app.post("/api/zukan/{zukan_name}/rename")
async def rename_zukan(zukan_name: str, payload: dict = Body(...)):
    """図鑑の名前を変更するAPI"""
    new_name = payload.get("new_name")
    old_dir = os.path.join(DATA_DIR, zukan_name)
    new_dir = os.path.join(DATA_DIR, new_name)
    
    if os.path.exists(old_dir) and not os.path.exists(new_dir):
        os.rename(old_dir, new_dir)
        return {"status": "success"}
    return {"status": "error", "message": "既に同じ名前の図鑑が存在するか、変更元の図鑑が見つかりません。"}

@app.post("/api/zukan/{zukan_name}/duplicate")
async def duplicate_zukan(zukan_name: str, payload: dict = Body(...)):
    """図鑑を複製するAPI"""
    new_name = payload.get("new_name")
    old_dir = os.path.join(DATA_DIR, zukan_name)
    new_dir = os.path.join(DATA_DIR, new_name)
    
    if os.path.exists(old_dir) and not os.path.exists(new_dir):
        shutil.copytree(old_dir, new_dir)
        return {"status": "success"}
    return {"status": "error", "message": "既に同じ名前の図鑑が存在します。"}

@app.post("/api/zukan/{zukan_name}/delete")
async def delete_zukan(zukan_name: str):
    """図鑑を削除するAPI"""
    target_dir = os.path.join(DATA_DIR, zukan_name)
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir) # フォルダごと中身も削除
        return {"status": "success"}
    return {"status": "error"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9200)