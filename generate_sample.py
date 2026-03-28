import os
import json
import time
import requests
from google import genai
from google.genai import types

# Wikimedia APIを使用するためのUser-Agent設定 (マナーとして自身のアプリ情報を入れる)
# あなたの連絡先メールアドレスなどに書き換えてください。
WIKI_HEADERS = {
    'User-Agent': 'CladogramApp/1.0 (Generic Biological Zukan App; contact_me@example.com)'
}

def get_wikimedia_image_url(sci_name):
    """学名をキーにWikimedia Commonsから代表画像のURLを取得する"""
    if not sci_name or sci_name == "Unknown":
        return None

    api_url = "https://commons.wikimedia.org/w/api.php"
    
    # 手順1: 学名でページを検索し、そのページに関連付けられている画像ファイル名を取得
    search_params = {
        "action": "query",
        "prop": "pageimages", # ページを代表する画像を取得
        "titles": sci_name,   # 学名で検索
        "piprop": "thumbnail", # サムネイル情報を取得
        "pithumbsize": 500,    # 画像の幅を500pxに指定 (図鑑用に適したサイズ)
        "format": "json",
        "redirects": 1         # リダイレクト（シノニム）があれば従う
    }

    try:
        print(f"      -> Wikimediaで画像を検索中: {sci_name}...", end="", flush=True)
        response = requests.get(api_url, params=search_params, headers=WIKI_HEADERS, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # JSONから画像URLを抽出
        pages = data.get("query", {}).get("pages", {})
        for page_id, page_info in pages.items():
            if "thumbnail" in page_info:
                img_url = page_info["thumbnail"]["source"]
                print("【発見】")
                return img_url # 最初に見つかった画像のURLを返す
                
        print("【なし】")
        return None # 画像が見つからなかった場合

    except Exception as e:
        print(f"\n      [!] Wikimedia APIエラー ({sci_name}): {e}")
        return None

def process_tree_node_recursive(node):
    """ツリーを再帰的に巡回し、各ノードに画像URLを追加する"""
    
    ja_name = node.get("name_ja", "不明")
    sci_name = node.get("name_sci")
    
    # このノードの画像を取得
    print(f"   ● {ja_name} ({sci_name}) の処理中")
    img_url = get_wikimedia_image_url(sci_name)
    
    if img_url:
        node["images"] = [img_url] # images配列に追加
    else:
        node["images"] = [] # 見つからなければ空配列

    # 少し待機してAPIへの負荷を軽減 (マナー)
    time.sleep(0.2)

    # 子ノードがあれば、再帰的に処理
    if "children" in node:
        for child in node["children"]:
            process_tree_node_recursive(child)

def generate_rich_cladogram(target_name: str):
    """Geminiで構造を作り、Wikimediaで画像を取得して図鑑フォルダを生成する"""
    
    # 1. クライアントの初期化
    try:
        client = genai.Client()
    except Exception:
        print("エラー: APIキーが設定されていないか、無効です。")
        print("export GEMINI_API_KEY='あなたのAPIキー' を実行してください。")
        return

    print(f"\n==================================================")
    print(f"📖 図鑑「{target_name}」の完全自動生成を開始します")
    print(f"==================================================\n")

    # --- Step 1: Geminiでツリー構造を生成 ---
    print(f"[Step 1] Geminiによる系統樹の構築（文献調査）...")

    prompt = f"""
    あなたは優秀な生物学者です。
    「{target_name}」の分岐分類（クラドグラム）を作成してください。
    Wikipediaなどの信頼できる分類情報を元に、代表的な下位分類を深く展開してください。
    最下位のノード（葉ノード）には、そのグループを代表する具体的な種の和名と学名を必ず含めてください。
    階層は3〜5階層程度を目安にしてください。
    
    出力は必ず以下のJSONスキーマに従ってください。JSON以外のテキストは一切含めないでください。
    
    【JSONスキーマ】
    {{
      "id": "root",
      "name_ja": "{target_name}",
      "name_sci": "学名（わかれば）",
      "images": [], /* ここは空のまま出力してください */
      "children": [
        {{
          "id": "node_1", /* 一意なID */
          "name_ja": "下位分類の和名",
          "name_sci": "下位分類の学名",
          "images": [], /* ここは空のまま出力してください */
          "children": [ /* さらに下位分類 */ ]
        }}
      ]
    }}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3
            )
        )
        tree_data = json.loads(response.text)
        print(" -> 構造の生成が完了しました。\n")
        
    except Exception as e:
        print(f"Gemini APIエラーまたはJSON解析エラー: {e}")
        return

    # --- Step 2: Wikimedia APIで画像URLを自動取得 ---
    print(f"[Step 2] Wikimedia Commons APIによる画像URLの自動取得...")
    print(f"        (全ノードを巡回するため、時間がかかります)\n")
    
    # ルートノードから開始してツリー全体を処理
    process_tree_node_recursive(tree_data)
    
    print(f"\n -> 画像URLの取得が完了しました。\n")

    # --- Step 3: ファイル保存 ---
    print(f"[Step 3] ファイルの保存...")
    
    data_dir = os.path.join("data", target_name)
    images_dir = os.path.join(data_dir, "images") # アップロード用フォルダも一応作る
    tree_file = os.path.join(data_dir, "tree.json")

    if os.path.exists(data_dir):
        print(f"エラー: 図鑑「{target_name}」は既に存在するため、上書きを避けます。")
        return

    os.makedirs(images_dir, exist_ok=True)
    
    with open(tree_file, "w", encoding="utf-8") as f:
        json.dump(tree_data, f, ensure_ascii=False, indent=2)
        
    print(f"\n✨ 【大成功】 画像付き図鑑「{target_name}」が生成されました！")
    print(f"ブラウザでWebアプリを開き、トップページをリロードして確認してください。")

if __name__ == "__main__":
    target = input("作成したい画像付き分類群の名前を入力してください (例: ジャコウネコ科, ネコ目): ")
    
    if target.strip():
        generate_rich_cladogram(target.strip())