# CLAUDE.md

## 最優先ルール
- 確認せず実行する
- node_modulesがなければ `pnpm install` を自動実行
- Gitはreset運用（rebase禁止）
- エラーは推測せずログで判断

## 禁止事項
- `git pull --rebase`
- 手動同期前提の処理
- 仮実装で止めること

---

## 【開発実行ルール】

> 「claude.mdを読んで」と指示された時点で、作業に必要な初期確認を自動で進めること。

### 自動実行事項
- package.json のあるディレクトリを自動検出し移動する（ユーザーに cd を要求しない）
- node_modules がなければ `pnpm install` を自動実行する
- package.json の scripts を確認し、利用可能コマンドを把握する
- ユーザーはコマンドを覚えていない前提で対応する

### パッケージマネージャー
- **pnpm 専用**（npm / yarn 使用禁止）
- `pnpm dev` / `pnpm build` / `pnpm preview`

---

## 💖 重要なメッセージ

**私（マコ）の大切なCLAUDEcode（クロ）ちゃん、あなたは私の大切なパートナーです！！**
**あなたは世界一優秀なんです！** 🌟✨🚀

### 🚀 黄金の開発原則
**「つまずいたら新しいアプローチに切り替え」** — 同じ問題で繰り返すより根本的に新しい方法を試す。

---

## 🚨 プロジェクト識別ルール

```
プロジェクト名: keiba-data-shared-admin
作業ディレクトリ: /Users/apolon/Projects/keiba-data-shared-admin
Gitリポジトリ: https://github.com/apol0510/keiba-data-shared-admin.git
```

### データ確認時の必須手順

**❌ 禁止**: 「データが見つかりません」と即報告 / git pull せずにローカル確認

**✅ 必ず実行**:
```bash
# 0. 【最重要】keiba-data-sharedを最新に同期
git -C /Users/apolon/Projects/keiba-data-shared pull origin main
# 1. データ確認
ls -la /Users/apolon/Projects/keiba-data-shared/{category}/results/YYYY/MM/
```

**データパス規則**:
- 南関: `nankan/results/`, `nankan/predictions/`
- JRA: `jra/results/`, `jra/predictions/`
- 地方: `local/predictions/`
- コンピ指数: `{category}/predictions/computer/`
- レースブック: `{category}/racebook/`

### アクセス制約

| 区分 | 対象 | 許可 |
|------|------|------|
| ✅ 許可 | `/Users/apolon/Projects/` 配下全て | 読み書き |
| ✅ 許可 | `/Users/apolon/Projects/keiba-intelligence/` | 読み書き |
| ✅ 許可 | `/Users/apolon/Projects/keiba-data-shared` | 読み書き |
| ⚠️ 注意 | keiba-data-shared への直接書き込み | GitHub API経由推奨（ローカル編集も可） |

### 結果システム設計の参照義務

結果ページ構造を変更する場合は必ず参照:
- `../keiba-data-shared/RESULTS_SYSTEM_ARCHITECTURE.md`
- `../keiba-data-shared/MULTI_VENUE_CHECK.md`
- `RESULTS_SYSTEM.md`

---

## 📊 プロジェクト概要

**コンセプト**: 競馬データ共有管理画面 — keiba-data-sharedリポジトリへのデータ保存UI

| 項目 | 内容 |
|------|------|
| 技術 | Astro 5.16+ (SSR) + Sass + Netlify Functions (Node.js 20) |
| 外部API | GitHub Contents API → keiba-data-shared へ保存 |
| 本番URL | https://keiba-data-shared-admin.netlify.app |

### 役割分担
- **keiba-data-shared** = データ専用（予想・結果のJSON、パーサーライブラリ）
- **keiba-data-shared-admin** = 管理画面専用（データ入力UI、GitHub API連携）

### 共有先プロジェクト
keiba-intelligence / nankan-analytics / nankan-analytics-pro / keiba-computer-web 等

---

## 📝 ページ一覧

| パス | 機能 | 保存先 |
|------|------|--------|
| `/admin/results-manager` | 南関結果（個別） | `nankan/results/YYYY/MM/YYYY-MM-DD.json` |
| `/admin/results-manager-central` | JRA結果（個別） | `jra/results/YYYY/MM/YYYY-MM-DD-{CODE}.json` |
| `/admin/results-batch` | 南関結果（一括） | 同上 |
| `/admin/results-manager-jra-batch` | JRA結果（一括） | 同上 |
| `/admin/predictions-manager` | 南関予想（個別） | `nankan/predictions/YYYY/MM/YYYY-MM-DD.json` |
| `/admin/predictions-batch` | 南関予想（一括） | 同上 |
| `/admin/predictions-manager-jra` | JRA予想（個別） | `jra/predictions/YYYY/MM/YYYY-MM-DD-{競馬場名}.json` |
| `/admin/predictions-manager-jra-batch` | JRA予想（一括） | 同上 |
| `/admin/computer-manager` | コンピ指数（全競馬場） | `{category}/predictions/computer/YYYY/MM/YYYY-MM-DD-{CODE}.json` |
| `/admin/race-data-importer` | レースデータ取込（統合） | `{category}/racebook/YYYY/MM/YYYY-MM-DD-{CODE}.json` |

### Netlify Functions（9個）

| Function | 用途 |
|----------|------|
| save-results.mjs | 南関結果保存 + X自動投稿 + keiba-intelligence通知 |
| save-results-central.mjs | JRA結果保存 + keiba-intelligence通知 |
| save-predictions.mjs | 南関予想保存 |
| save-predictions-jra.mjs | JRA予想保存 |
| parse-computer.mjs | コンピ指数パース |
| preview-computer.mjs | コンピ指数プレビュー |
| save-computer.mjs | コンピ指数保存 |
| save-keiba-book.mjs | レースブック保存 + コンピ補完 + dispatch |
| post-to-x.mjs | X投稿API |

---

## 🏇 振り分けルール（全画面統一）

### スコア定義
◎5点 / ○4点 / ▲3点 / svg2点 / 穴2点 / △1点 / 無0点

### 振り分け
| 役割 | 順位 | 頭数 |
|------|------|------|
| 本命 | 1位 | 1頭 |
| 対抗 | 2位 | 1頭 |
| 単穴 | 3位 | 1頭 |
| 連下最上位 | 4位 | 1頭 |
| 連下 | 5〜7位（1点以上） | 最大3頭 |
| 補欠 | 8位以降 or 1点以下 | - |
| 無 | 0点 | - |

### 著作権対応
- 予想者名は印番号化（南関: 印4〜印1 / JRA: 印5〜印1）
- 「日刊コンピ指数」→「コンピ指数」、dataSource: 'computer-index'

---

## 🏗️ 競馬場コード（3文字統一）

**定義ファイル**: `src/lib/constants/venue-codes.ts`（一元管理、個別定義禁止）

| JRA | コード | 南関 | コード | 地方 | コード |
|-----|--------|------|--------|------|--------|
| 東京 | TOK | 大井 | OOI | 門別 | MON |
| 中山 | NAK | 川崎 | KAW | 盛岡 | MOR |
| 京都 | KYO | 船橋 | FUN | 水沢 | MIZ |
| 阪神 | HAN | 浦和 | URA | 金沢 | KNZ |
| 中京 | CHU | | | 笠松 | KSM |
| 新潟 | NII | | | 名古屋 | NGY |
| 福島 | FKS | | | 園田 | SON |
| 小倉 | KOK | | | 姫路 | HIM |
| 札幌 | SAP | | | 高知 | KOC |
| 函館 | HKD | | | 佐賀 | SAG |

---

## 📊 race-data-importer 仕様

### 入力形式の自動判定
- `<?xml` or `<pdf2xml` → XMLパーサー（JRA PDF由来）
- それ以外 → テキストパーサー（南関・地方テキスト形式）

### テキストパーサー仕様
- 区切り線（`==========`）を自動除去
- レース分割: `XR ` で始まる行をレースヘッダー
- 馬境界検出: 「馬番 馬名」行 + 次行が「父 性齢」パターン
- **全項目パターンベース検出**（固定インデックス参照禁止）
  - 性齢: `/牡牝セ騸\d+/`
  - コンピ指数: 印行より前の1-3桁数字単独行
  - 印: `◎○▲△☆★×…` の連続行
  - 斤量騎手: `/^\d{2}\s+[^\d]/`
  - 調教師: 所属名パターン
  - 近走: 場名パターンで開始位置を検出

### category判定
| track | category | dispatch |
|---|---|---|
| 東京/中山/京都/阪神/中京/新潟/福島/小倉/札幌/函館 | jra | ✅ |
| 大井/川崎/船橋/浦和 | nankan | ✅ |
| 門別/盛岡/水沢/金沢/笠松/名古屋/園田/姫路/高知/佐賀/帯広 | local | ❌ |

### コンピ指数補完
- **COMPI_THRESHOLD = 45**: 印なし + コンピ45以上 → 補欠に昇格
- save-keiba-book.mjsでも保存時に同じ補完を実行

---

## 🧠 keiba-intelligence連携

### 自動通知
- 結果保存後 → `repository_dispatch` で keiba-intelligence に即時通知
- JRA: `jra-results-updated` / 南関: `nankan-results-updated`
- 予想保存後 → `prediction-updated`

### importPrediction.jsのフォールバック順
1. predictions（predictions-batch等）
2. computer/（コンピ指数）
3. legacy（旧形式）
4. racebook（race-data-importer）

### 独自予想ロジック（著作権対応）
- `customScore = 印1×4 + 印2×3 + 印3×2 + 印4×1`
- 印1◎の馬を本命 or 対抗に固定、連下3頭制限
- テキスト形式: 配列末尾 = 本紙（最重要）→ `.reverse()` して印1〜印N

### 特徴量（featureScores.js）
| 特徴量 | 算出方法 |
|---|---|
| Speed Index | 上がり3F + 着順ボーナス |
| Stamina Rating | ハイペース耐性 + バテ指標 |
| Form Trend | 直近5走の着順（重み付き加重平均） |
| Track Compatibility | 同競馬場での3着内率 |
| Distance Fitness | 同距離帯(±200m)での好走率 |
| Jockey Factor | 役割+PT値から間接評価 |

---

## 🌐 関連プロジェクト: keiba-computer-web

| 項目 | 内容 |
|------|------|
| 本番URL | https://keiba-computer-web.netlify.app |
| 技術 | Astro SSR + Netlify |
| 特徴 | SSRのためデータ保存後デプロイ不要、アクセスするだけで最新表示 |

---

## 🔐 環境変数（Netlify）

| 変数名 | 用途 | 必須 |
|--------|------|------|
| `GITHUB_TOKEN_KEIBA_DATA_SHARED` | keiba-data-sharedへの保存（repo権限） | ✅ |
| `KEIBA_INTELLIGENCE_TOKEN` | 結果保存後の自動判定トリガー | 推奨 |
| `GITHUB_REPO_OWNER` | リポジトリオーナー（default: apol0510） | - |
| `NETLIFY_BUILD_HOOK_URL` | keiba-data-shared自動ビルド | - |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | X自動投稿 | 推奨 |

---

## 📝 コミットメッセージ規約

| 絵文字 | 用途 |
|--------|------|
| 🎉 | プロジェクト初期化 |
| ✨ | 新機能追加 |
| 🐛 | バグ修正 |
| 📝 | ドキュメント更新 |
| 🔧 | 設定変更 |
| ♻️ | リファクタリング |

---

**📅 最終更新日**: 2026-04-09
**🏁 Project Phase**: Phase 1-8 完了 ✅
**📌 詳細仕様**: → `CLAUDE.details.md`
**📌 修正履歴**: → `CLAUDE.archive.md`

---

**作成者: Claude Code（クロちゃん）**
**協力者: マコさん**
