# 分岐図鑑書架 (Cladogram)

分岐図鑑書架は、系統分類ツリーをブラウザ上で作成・編集・共有できる Web アプリです。

通常は Web 上でそのまま利用できますが、この README は**コードをダウンロードしてローカルで起動する人**向けに書いています。

## 1. 動作環境

- Linux / macOS / Windows
- Python 3.10 以上
- `pip` が使えること

## 2. セットアップ

プロジェクトのルートディレクトリで実行してください。

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Windows (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 3. サーバー起動

以下のどちらかで起動できます。

```bash
python main.py
```

または

```bash
uvicorn main:app --host 0.0.0.0 --port 9200
```

起動後、ブラウザで以下へアクセスしてください。

- http://localhost:9200

## 4. 初回利用の流れ

1. `/register` でユーザー登録
2. `/login` でログイン
3. トップページから図鑑を新規作成
4. `/editor/{図鑑名}` で編集

補足:
- `data/users.json` にユーザー情報とセッション情報が保存されます。
- 図鑑データは `data/{図鑑名}/tree.json` に保存されます。

## 5. Gemini API キー (自動生成機能を使う場合)

「自動で生成する」機能は Gemini API を使用します。
この機能を使う場合のみ、環境変数 `GEMINI_API_KEY` を設定してください。

### Linux / macOS

```bash
export GEMINI_API_KEY="あなたのAPIキー"
```

### Windows (PowerShell)

```powershell
$env:GEMINI_API_KEY="あなたのAPIキー"
```

注意:
- API キー未設定でも、手動作成・手動編集の機能は利用できます。
- API キーを設定したら、サーバーを再起動してください。

## 6. 設定ファイル

`appConfig.yaml` を編集すると、樹形図エディタの初期フォントサイズを変更できます。

```yaml
editor:
  default_tree_font_size: 20
```

`default_tree_font_size` は 8 から 30 の範囲で指定されます。

## 7. よくあるトラブル

- `ModuleNotFoundError` が出る
  - 仮想環境を有効化してから `pip install -r requirements.txt` を再実行してください。
- `Address already in use` が出る
  - 9200 番ポートを使っている別プロセスを停止するか、別ポートで起動してください。
- 自動生成で `missing_api_key` が出る
  - `GEMINI_API_KEY` の設定漏れです。設定後にサーバーを再起動してください。

## 8. 開発メモ

- サーバー本体: `main.py`
- 自動生成ロジック: `generate_sample.py`
- テンプレート: `templates/`
- 静的ファイル: `static/`
