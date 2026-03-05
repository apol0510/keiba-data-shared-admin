# KEIBA Data Shared Admin

競馬データ共有管理画面 - データ入力・管理用Webアプリケーション

## 📊 プロジェクト概要

**keiba-data-shared-admin** は、[keiba-data-shared](https://github.com/apol0510/keiba-data-shared) リポジトリにデータを保存するための管理画面です。

### 🎯 役割分担

| リポジトリ | 役割 | 内容 |
|-----------|------|------|
| **keiba-data-shared** | データ専用 | 予想・結果のJSONデータ、パーサーライブラリ |
| **keiba-data-shared-admin** | 管理画面専用 | データ入力UI、GitHub API連携 |

### ✨ 主な機能

- **結果管理画面** (`/admin/results-manager`)
  - 南関公式サイトの結果を全文コピペ
  - 自動パース・JSON生成
  - GitHub API経由で keiba-data-shared に自動保存

## 🚀 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Astro 5.16+ + Sass |
| ホスティング | Netlify |
| バックエンド | Netlify Functions (Node.js 20) |
| 外部API | GitHub Contents API |

## 🔧 開発

### セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build
```

### 環境変数（Netlify）

```bash
# GitHub Personal Access Token (repo権限)
GITHUB_TOKEN_KEIBA_DATA_SHARED=ghp_xxxxxxxxxxxxxxxx

# リポジトリオーナー（デフォルト: apol0510）
GITHUB_REPO_OWNER=apol0510

# X (旧Twitter) API認証情報（自動投稿機能用）
X_API_KEY=your_api_key_here
X_API_SECRET=your_api_secret_here
X_ACCESS_TOKEN=your_access_token_here
X_ACCESS_TOKEN_SECRET=your_access_token_secret_here
```

**X API認証情報の取得方法:**

1. [X Developer Portal](https://developer.x.com/) にアクセス
2. プロジェクト作成 → アプリ作成
3. アプリ権限を「Read and Write」に設定
4. API Key & Secret（Consumer Key/Secret）を取得
5. 「Keys and tokens」タブでAccess Token & Secretを生成
6. 上記4つの値をNetlify環境変数に設定

## 📦 デプロイ

### Netlify連携

1. Netlify で新規サイト作成
2. GitHub リポジトリ連携
3. ビルド設定（自動検出）
4. 環境変数設定
5. デプロイ完了 🎉

## 📝 使い方

### 結果データ保存フロー

1. `/admin/results-manager` にアクセス
2. 南関公式サイトの結果を全文コピー
3. ペースト → 「自動解析」ボタンクリック
4. プレビュー確認
5. 「🚀 保存してGit Push」ボタンクリック
6. GitHub に自動コミット・プッシュ完了 ✅

### 保存先

```
keiba-data-shared/
└── nankan/
    └── results/
        └── 2026/
            └── 01/
                └── 2026-01-23.json
```

## 🏗️ プロジェクト構造

```
keiba-data-shared-admin/
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   └── admin/
│   │       └── results-manager.astro
│   └── styles/
│       └── global.scss
├── netlify/
│   └── functions/
│       └── save-results.js
├── astro.config.mjs
├── netlify.toml
└── package.json
```

## 📄 ライセンス

MIT

---

**作成者**: Claude Code（クロちゃん）
**協力者**: マコさん
