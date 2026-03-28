import os
import json
import time
import requests
from google import genai
from google.genai import types

# Wikimedia API へのリクエスト時に送る User-Agent（マナーとして設定）
WIKI_HEADERS = {
    'User-Agent': 'CladogramApp/1.0 (Generic Biological Zukan App; contact_me@example.com)'
}

# 各 API リクエスト間の最小待機時間（秒）
API_DELAY = 0.3


# ==========================================
# 画像検索ヘルパー（複数手法）
# ==========================================

def _try_wiki_pageimage(api_base: str, title: str) -> str | None:
    """指定した Wiki API で、タイトルに対応するページの代表画像 URL を取得する"""
    if not title:
        return None
    params = {
        "action": "query",
        "prop": "pageimages",
        "titles": title,
        "piprop": "thumbnail",
        "pithumbsize": 500,
        "format": "json",
        "redirects": 1,
    }
    try:
        resp = requests.get(api_base, params=params, headers=WIKI_HEADERS, timeout=10)
        resp.raise_for_status()
        pages = resp.json().get("query", {}).get("pages", {})
        for _, page_info in pages.items():
            if "thumbnail" in page_info:
                return page_info["thumbnail"]["source"]
    except Exception:
        pass
    return None


def _try_wiki_search_then_image(api_base: str, query: str) -> str | None:
    """Wiki 全文検索でクエリに最もマッチするページを探し、その代表画像 URL を取得する"""
    if not query:
        return None
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srlimit": 3,
        "format": "json",
    }
    try:
        resp = requests.get(api_base, params=params, headers=WIKI_HEADERS, timeout=10)
        resp.raise_for_status()
        results = resp.json().get("query", {}).get("search", [])
        for result in results:
            title = result.get("title", "")
            if not title:
                continue
            time.sleep(API_DELAY)
            img_url = _try_wiki_pageimage(api_base, title)
            if img_url:
                return img_url
    except Exception:
        pass
    return None


def get_wikimedia_image_url(sci_name: str, ja_name: str = None) -> str | None:
    """
    学名・和名を使い、以下の順で貪欲に画像を探す:
      1. Wikimedia Commons（学名で直接）
      2. 英語 Wikipedia（学名で直接）
      3. 英語 Wikipedia（学名で全文検索）
      4. 英語 Wikipedia（属名のみで直接）
      5. Wikimedia Commons（属名のみで直接）
      6. 日本語 Wikipedia（和名で直接）
      7. 日本語 Wikipedia（和名で全文検索）
    """
    name_display = sci_name or ja_name or "不明"
    print(f"      -> [{name_display}] の画像を探索中...", end="", flush=True)

    strategies = []

    if sci_name and sci_name not in ("Unknown", ""):
        strategies.append(
            ("Commons/学名",
             lambda s=sci_name: _try_wiki_pageimage(
                 "https://commons.wikimedia.org/w/api.php", s))
        )
        strategies.append(
            ("en.Wiki/学名",
             lambda s=sci_name: _try_wiki_pageimage(
                 "https://en.wikipedia.org/w/api.php", s))
        )
        strategies.append(
            ("en.Wiki/学名検索",
             lambda s=sci_name: _try_wiki_search_then_image(
                 "https://en.wikipedia.org/w/api.php", s))
        )
        if " " in sci_name:
            genus = sci_name.split()[0]
            strategies.append(
                (f"en.Wiki/属名({genus})",
                 lambda g=genus: _try_wiki_pageimage(
                     "https://en.wikipedia.org/w/api.php", g))
            )
            strategies.append(
                (f"Commons/属名({genus})",
                 lambda g=genus: _try_wiki_pageimage(
                     "https://commons.wikimedia.org/w/api.php", g))
            )

    if ja_name:
        strategies.append(
            ("ja.Wiki/和名",
             lambda n=ja_name: _try_wiki_pageimage(
                 "https://ja.wikipedia.org/w/api.php", n))
        )
        strategies.append(
            ("ja.Wiki/和名検索",
             lambda n=ja_name: _try_wiki_search_then_image(
                 "https://ja.wikipedia.org/w/api.php", n))
        )

    for strategy_name, fn in strategies:
        try:
            time.sleep(API_DELAY)
            result = fn()
            if result:
                print(f"【発見: {strategy_name}】")
                return result
        except Exception:
            pass

    print("【未発見】")
    return None


def get_discoverer_image_url(discoverer_name: str) -> str | None:
    """記載者名で英語 Wikipedia から肖像画 URL を探す"""
    if not discoverer_name:
        return None
    time.sleep(API_DELAY)
    img = _try_wiki_pageimage("https://en.wikipedia.org/w/api.php", discoverer_name)
    if img:
        return img
    time.sleep(API_DELAY)
    img = _try_wiki_search_then_image("https://en.wikipedia.org/w/api.php", discoverer_name)
    return img


# ==========================================
# ツリー再帰処理
# ==========================================

def process_tree_node_recursive(node):
    """
    ツリーを再帰的に巡回し、各ノードに
    ・生物の画像 URL（まだ空の場合のみ）
    ・発見者の肖像画 URL（discoverer_name がある場合のみ）
    を付与する。
    """
    ja_name = node.get("name_ja", "不明")
    sci_name = node.get("name_sci") or ""

    print(f"   ● {ja_name} ({sci_name})")

    # --- 生物画像 ---
    if not node.get("images"):
        img_url = get_wikimedia_image_url(
            sci_name if sci_name else None,
            ja_name if ja_name else None,
        )
        node["images"] = [img_url] if img_url else []

    # --- 発見者の肖像画 ---
    disc_name = node.get("discoverer_name", "")
    if disc_name and not node.get("discoverer_image"):
        print(f"      -> [{disc_name}] の肖像を探索中...", end="", flush=True)
        disc_img = get_discoverer_image_url(disc_name)
        node["discoverer_image"] = disc_img or ""
        print("【発見】" if disc_img else "【未発見】")
    elif "discoverer_image" not in node:
        node["discoverer_image"] = ""

    # 子ノードを再帰処理
    for child in node.get("children", []):
        process_tree_node_recursive(child)


# ==========================================
# メイン生成関数
# ==========================================

def generate_rich_cladogram(target_name: str, owner: str = None):
    """Gemini で分類構造を生成し、Wikimedia で画像を取得して図鑑フォルダを作る"""

    # --- クライアント初期化 ---
    try:
        client = genai.Client()
    except Exception:
        print("エラー: GEMINI_API_KEY が設定されていないか、無効です。")
        print("  export GEMINI_API_KEY='あなたの API キー' を実行してください。")
        return

    print(f"\n{'=' * 52}")
    print(f"  図鑑「{target_name}」の自動生成を開始します")
    print(f"{'=' * 52}\n")

    # ==========================================================
    # Step 1: Gemini で分類構造（ツリー）を生成
    # ==========================================================
    print("[Step 1] Gemini による分類構造の構築...\n")

    prompt = f"""
あなたは優秀な分類学者です。
「{target_name}」の分岐分類（クラドグラム）を、Wikipedia などの信頼できる分類情報を元に作成してください。

要件:
- 代表的な下位分類を 3〜5 階層程度展開してください。
- 葉ノード（最下位）には、そのグループを代表する具体的な種の和名と学名を必ず入れてください。
- 各ノードに以下の情報を可能な限り付与してください:
    - status: 現存なら "normal"、絶滅危惧なら "endangered"、絶滅（†）なら "extinct"
    - description: そのタクソンの簡潔な説明（日本語、1〜3 文）
    - discoverer_name: そのタクソンを最初に学術記載した分類学者名（英語表記。不明なら空文字）
- もしこのグループ内に「多系統群」または「側系統群」として有名な例があれば、
  1〜2 個を polyphyletic_groups に定義し、該当するノードの groups 配列にそのグループ ID を入れてください。
  特に知られていない場合は polyphyletic_groups を空配列にしてください。

出力は下記の JSON スキーマに厳密に従ってください。JSON 以外のテキストは一切出力しないでください。

{{
  "id": "root",
  "name_ja": "{target_name}",
  "name_sci": "学名（わかれば）",
  "status": "normal",
  "description": "このグループ全体の簡潔な説明（日本語）",
  "discoverer_name": "記載者名（英語表記。不明なら空文字）",
  "discoverer_image": "",
  "images": [],
  "polyphyletic_groups": [
    {{
      "id": "group_A",
      "name": "多系統群の名前",
      "color": "#e57373"
    }}
  ],
  "children": [
    {{
      "id": "node_1",
      "name_ja": "下位分類の和名",
      "name_sci": "下位分類の学名",
      "status": "normal",
      "description": "このノードの簡潔な説明（日本語）",
      "discoverer_name": "記載者名（英語表記。不明なら空文字）",
      "discoverer_image": "",
      "images": [],
      "groups": [],
      "children": []
    }}
  ]
}}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )
        tree_data = json.loads(response.text)
        print("  -> 構造の生成が完了しました。\n")
    except Exception as e:
        print(f"Gemini API エラーまたは JSON 解析エラー: {e}")
        return

    # ==========================================================
    # Step 2: Wikimedia で各ノードの画像・発見者肖像を取得
    # ==========================================================
    print("[Step 2] Wikimedia による画像の探索（全ノードを巡回）...\n")
    process_tree_node_recursive(tree_data)
    print("\n  -> 画像 URL の取得が完了しました。\n")

    # ==========================================================
    # Step 3: ファイルを保存
    # ==========================================================
    print("[Step 3] ファイルの保存...")

    data_dir = os.path.join("data", target_name)
    images_dir = os.path.join(data_dir, "images")
    tree_file = os.path.join(data_dir, "tree.json")
    meta_file = os.path.join(data_dir, "meta.json")

    if os.path.exists(data_dir):
        print(f"エラー: 図鑑「{target_name}」は既に存在します。上書きを避けるため中断します。")
        return

    os.makedirs(images_dir, exist_ok=True)

    with open(tree_file, "w", encoding="utf-8") as f:
        json.dump(tree_data, f, ensure_ascii=False, indent=2)

    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump({"owner": owner, "editors": []}, f, ensure_ascii=False, indent=2)

    print(f"\n  【完了】 図鑑「{target_name}」が生成されました！")
    if owner:
        print(f"  オーナー: {owner}")
    else:
        print("  オーナー: なし（閲覧専用）")
    print("  ブラウザで Web アプリを開き、トップページをリロードして確認してください。\n")


if __name__ == "__main__":
    target = input("作成する図鑑の名前を入力してください (例: ネコ目, 始祖鳥類, 甲虫目): ").strip()
    if not target:
        print("名前が入力されませんでした。終了します。")
        exit()

    owner_input = input(
        "オーナーとなるユーザー名を入力してください（未入力なら閲覧専用として作成）: "
    ).strip()

    generate_rich_cladogram(target, owner=owner_input if owner_input else None)
