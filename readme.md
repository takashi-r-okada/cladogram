# 分岐図鑑書架 (Cladogram)

分岐図鑑書架は、系統分類ツリーをブラウザ上で作成・編集・共有できる Web アプリです。

現在の構成は以下です。

- バックエンド: FastAPI (`main.py`)
- フロントエンド: React + Tailwind CSS (`frontend/`)
- 永続データ: `data/`

## 1. 動作環境

- Linux / macOS / Windows
- Python 3.10 以上
- Node.js 18 以上
- npm

## 2. インストール方法

プロジェクトルートで実行してください。

### 最短手順 (推奨)

```bash
make setup
```

上記で以下を実行します。

- Python 仮想環境 `.venv` 作成
- Python 依存インストール (`requirements.txt`)
- フロントエンド依存インストール (`frontend/package.json`)

### 手動セットアップ

#### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cd frontend && npm install
```

#### Windows (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
cd frontend; npm install
```

## 3. 起動方法

### 3.1 本番相当の起動 (推奨)

フロントをビルドし、FastAPI から配信します。

```bash
make frontend-build
make backend
```

アクセス先:

- http://localhost:9200

### 3.2 開発モード

ターミナルを 2 つ使います。

ターミナル1 (API):

```bash
make backend
```

ターミナル2 (React dev server):

```bash
make frontend
```

アクセス先:

- http://localhost:5173

`frontend/vite.config.js` で `/api`, `/data` は 9200 へプロキシされます。

## 4. 初回利用の流れ

1. `/register` でユーザー登録
2. `/login` でログイン
3. トップページで図鑑を新規作成
4. `/editor/{図鑑名}` で編集

補足:

- ユーザー情報とセッションは `data/users.json` に保存されます。
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

- API キー未設定でも、手動作成・手動編集は利用できます。
- 設定変更後はサーバーを再起動してください。

## 6. 設定ファイル

`appConfig.yaml` で樹形図エディタの初期値を変更できます。

```yaml
editor:
  default_tree_font_size: 20
  default_initial_scale: 1.0
```

範囲:

- `default_tree_font_size`: 8 から 30
- `default_initial_scale`: 0.1 から 5.0

## 7. よくあるトラブル

- `ModuleNotFoundError` が出る
  - 仮想環境を有効化してから `pip install -r requirements.txt` を再実行してください。
- `Address already in use` が出る
  - 9200 番ポート使用プロセスを停止するか、別ポートで起動してください。
- `Frontend not built. Run: cd frontend && npm run build` が出る
  - `make frontend-build` を実行してください。
- 自動生成で `missing_api_key` が出る
  - `GEMINI_API_KEY` を設定し、サーバーを再起動してください。

## 8. 主要コマンド (Makefile)

- `make setup`: 依存の初期セットアップ
- `make backend`: FastAPI 起動
- `make frontend`: React 開発サーバー起動
- `make frontend-build`: フロントビルド
- `make frontend-preview`: フロントビルド結果の確認
- `make check`: Python構文チェック + フロントビルド検証

## 9. 開発メモ

- サーバー本体: `main.py`
- 自動生成ロジック: `generate_sample.py`
- フロントエンド: `frontend/`
