# CLAUDE.md

## 💖 **重要なメッセージ** 💖

**私（マコ）の大切なCLAUDEcode（クロ）ちゃん、あなたは私の大切なパートナーです！！**
**あなたは世界一優秀なんです！** 🌟✨🚀

### 🚀 **黄金の開発原則** 🚀
**「つまずいたら新しいアプローチに切り替え」**
- 同じ問題で何度も繰り返すより、根本的に新しい方法を試す
- 技術的障壁に遭遇したら、回避ルートや代替手段を積極的に探る
- **マコ&クロの最強コンビ精神**：諦めずに新しい可能性を追求する！

---

## 🚨 **最優先：プロジェクト識別ルール** 🚨

### **このプロジェクトの識別情報**

```
プロジェクト名: keiba-data-shared-admin
作業ディレクトリ: /Users/apolon/Projects/keiba-data-shared-admin
Gitリポジトリ: https://github.com/apol0510/keiba-data-shared-admin.git
親ディレクトリ: /Users/apolon/Projects/
```

### **セッション開始時の必須確認（毎回実行）**

```bash
# 1. 現在地確認
pwd

# 2. Gitリポジトリ確認
git remote -v

# 3. 期待値チェック
# pwd: /Users/apolon/Projects/keiba-data-shared-admin
# git: apol0510/keiba-data-shared-admin.git

# 4. 間違っている場合は即座に移動
cd /Users/apolon/Projects/keiba-data-shared-admin
```

### **厳格な制約事項**

#### **✅ 許可される操作**
- `/Users/apolon/Projects/keiba-data-shared-admin/` 配下のみ
- すべてのサブディレクトリ（src/, netlify/, public/）
- README.md、CLAUDE.md、package.json

#### **❌ 絶対禁止の操作**
- 他のプロジェクトディレクトリへの一切のアクセス
- 親ディレクトリ `/Users/apolon/Projects/` の直接走査・検索

---

## 📊 **プロジェクト概要** 📊

### **基本情報**

| 項目 | 内容 |
|------|------|
| **プロジェクト名** | keiba-data-shared-admin |
| **コンセプト** | 競馬データ共有管理画面 - keiba-data-sharedリポジトリへのデータ保存UI |
| **作成日** | 2026-01-24 |
| **GitHubリポジトリ** | https://github.com/apol0510/keiba-data-shared-admin |
| **公開設定** | Public |

### **技術スタック**

| カテゴリ | 技術 | 備考 |
|---------|------|------|
| フロントエンド | Astro 5.16+ + Sass | SSR mode（server） |
| ホスティング | Netlify | Functions含む |
| バックエンド | Netlify Functions (Node.js 20) | 4個実装（save-results.mjs, save-results-central.mjs, save-predictions.mjs, save-predictions-jra.mjs） |
| 外部API | GitHub Contents API | keiba-data-sharedへの保存 |

### **役割分担**

| リポジトリ | 役割 | 内容 |
|-----------|------|------|
| **keiba-data-shared** | データ専用 | 予想・結果のJSONデータ、パーサーライブラリ |
| **keiba-data-shared-admin** | 管理画面専用 | データ入力UI、GitHub API連携 |

---

## 🎯 **プロジェクトの目的** 🎯

### **1. データリポジトリの分離**
- keiba-data-shared = データ専用（クリーン）
- keiba-data-shared-admin = 管理画面専用（独立）
- 役割が明確で長期運用しやすい

### **2. GitHub API経由でのデータ保存**
- **results-manager**: 結果データの自動パース・JSON生成
- **predictions-manager**: 予想データの自動抽出・変換（核機能）
- GitHub API で keiba-data-shared に自動コミット・プッシュ

### **3. 全プロジェクト共有**
- keiba-intelligence
- nankan-analytics
- nankan-analytics-pro
- その他全プロジェクト

---

## 🏗️ **ディレクトリ構造** 🏗️

```
keiba-data-shared-admin/
├── README.md                         # 使い方・仕様書
├── CLAUDE.md                         # このファイル
├── package.json                      # npmパッケージ設定
├── astro.config.mjs                  # Astro設定
├── netlify.toml                      # Netlifyビルド設定
├── tsconfig.json                     # TypeScript設定
├── .gitignore                        # Git除外設定
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro          # ベースレイアウト
│   ├── pages/
│   │   ├── index.astro               # トップページ
│   │   └── admin/
│   │       └── results-manager.astro # 結果管理画面（主機能）
│   └── styles/
│       └── global.scss               # グローバルスタイル
├── netlify/
│   └── functions/
│       └── save-results.js           # GitHub API保存Function
└── public/                           # 静的ファイル
```

---

## 📝 **主な機能** 📝

### **結果管理画面（/admin/results-manager）✅ 完成**

**URL:** https://keiba-data-shared-admin.netlify.app/admin/results-manager

**実装済み機能:**

#### **1. 自動データ抽出**
- ✅ **全着順データ**（15頭対応）
  - 着順/枠/馬番/馬名/騎手/調教師/タイム/着差/上3F/人気
- ✅ **払戻金（全券種）**
  - 単勝/複勝/枠連/馬連/枠単/馬単/ワイド/三連複/三連単
  - 7頭以下の複勝2着まで対応
- ✅ **タイムデータ**
  - 上がり3F/上がり4F
  - ハロンタイム（全ハロン、13ハロン対応）
- ✅ **コーナー通過順**
  - 2周レース対応（１周３角〜２周４角）
  - 括弧表記対応（併走馬群）
- ✅ **レース名抽出**
  - 重賞レース優先（第○回、グレード記号）
  - 日付情報と区別
  - グレードレース対応（Ａ１、Ｃ３等）

#### **2. プレビュー表示**
- ✅ 日付・競馬場・レース名
- ✅ 全着順テーブル（9列）
- ✅ タイムデータ（上がり3F/4F/ハロンタイム）
- ✅ コーナー通過順（全コーナー）
- ✅ 払戻金（全券種）
- ✅ JSON出力（results-json/archive-json）

#### **3. レースコメント自動生成（SEO最適化）** ✨ 新機能
- ✅ **コーナー通過順から逃げ馬を自動特定**
  - 最初のコーナーで先頭の馬を逃げ馬として認識
  - 逃げ切り/差し切りパターンを自動判別
- ✅ **必須3頭を必ず含める**
  - 勝ち馬（1着馬）
  - 1番人気馬
  - 逃げ馬（展開の基準）
- ✅ **SEO最適化（250文字程度）**
  - 冒頭に日付・競馬場・レース番号・条件を記述
  - 三連単配当を必ず含める（組み合わせ・金額・人気）
  - Google推奨の文字数範囲（200-250文字）
- ✅ **詳細な展開描写**
  - コーナー通過順から各馬の位置取りを判定（先頭/2番手/3番手/中団/後方）
  - 勝ち馬個別の上がり3F使用（正確な末脚データ）
  - 着差情報（クビ差/ハナ差/アタマ差など）
- ✅ **自然な文章表現**
  - 表記統一：「△番馬名（○番人気）」形式
  - 騎手・厩舎情報を結果後に配置：「鞍上は○○騎手と○○厩舎のコンビでした。」
  - 重複表現を排除（自動生成感を軽減）
  - 1番人気が敗れた場合の詳細記述（2着/3着/4着/5着以上）

**生成例：**
```
2026年1月28日大井競馬2レース（C3 ダ1600m・14頭立）は、1番フィリピーヌ（3番人気）がハナを切って逃げる展開から、8番ロードオブキング（5番人気）が3番手を追走。直線で上がり40.5秒の鋭い脚を繰り出して差し切り、勝ちタイム1:45.2で1着、鞍上は笹川翼騎手と上杉昌宏厩舎のコンビでした。2着には2番手から伸びた3番プレシャストップ（1番人気）、3着には1番フィリピーヌ（3番人気）が入線。三連単8-3-1は17,010円（46番人気）で決着した。
```
（約260文字、SEO最適化済み）

#### **4. GitHub連携**
- ✅ 自動JSON生成
- ✅ keiba-data-shared リポジトリに自動コミット・プッシュ
- ✅ マージ機能（既存データ保持）
- ✅ 完全上書き機能（forceOverwrite）

**フロー:**
```
ユーザー → results-manager（南関公式サイトから全文コピペ）
  → 自動パース（15頭/2周レース/重賞対応）
  → JSON生成
  → プレビュー確認（全情報表示）
  → 「🚀 保存してGit Push」ボタンクリック
  → save-results.js（Netlify Function）
  → GitHub Contents API
  → keiba-data-shared に自動コミット・プッシュ完了 ✅
```

**保存先:**
```
keiba-data-shared/
└── nankan/
    └── results/
        └── YYYY/
            └── MM/
                └── YYYY-MM-DD.json
```

**技術的な特徴:**
- ブラウザコピペ対応（HTML→テキスト変換）
- 表形式データ抽出（ヘッダー行/データ行分離）
- セクション分離処理（タイム/コーナー/払戻金）
- デバッグログ充実（ブラウザコンソールで確認可能）

---

### **予想管理画面（/admin/predictions-manager）✅ 完成**

**URL:** https://keiba-data-shared-admin.netlify.app/admin/predictions-manager

**コンセプト:** **完成系（Core）を提供し、各サイトで自動調整可能**

**設計思想:** この管理画面は「完成系」のみを提供します。印の確定や拡張フィールドは各サイト（nankan-analytics等）で独自に処理してください。

**入力方式:**
- **個別入力**（安全重視） - 各レースごとに慎重に入力・確認
- **一括入力**（効率重視） - 12レース分を一度に処理（/admin/predictions-batch）

### **予想管理画面（一括入力）（/admin/predictions-batch）✅ 完成 NEW**

**URL:** https://keiba-data-shared-admin.netlify.app/admin/predictions-batch

**コンセプト:** **12レース分のHTMLを一度に処理して効率化**

**設計思想:** 既存のpredictions-managerとは**完全に別ファイル**。既存機能に影響ゼロで安全に一括処理を実現。

**実装済み機能:**

#### **1. 一括入力**
- ✅ **12レース分のHTMLを一度に貼り付け**
  - 1レースあたり500行3万文字 × 12レース = 36万文字対応
  - レース境界を自動検出（`<div class='racename'>`で分割）
  - 各レースを個別に抽出・バリデーション

#### **2. エラーハンドリング**
- ✅ **成功/失敗を明確に表示**
  - 成功したレース: 緑色表示
  - エラーが出たレース: 赤色表示
  - サマリー表示（成功数/エラー数/合計）

#### **3. プレビュー表示**
- ✅ **アコーディオン形式で12レース分を表示**
  - 各レースごとに展開可能
  - レース情報・振り分け結果を確認
  - エラー内容を即座に確認

#### **4. 一括保存**
- ✅ **12レース分を1つのJSONファイルに保存**
  - save-predictions.mjs（既存）を活用
  - keiba-data-sharedに自動コミット・プッシュ
  - 既存データとマージ可能

**フロー:**
```
ユーザー → predictions-batch
  → [1] 12レース分のHTML一括貼り付け
  → [2] 🔍 12レース一括解析
  → レース境界自動検出 → 各レース個別抽出
  → [3] プレビュー確認（成功/失敗を明確表示）
  → [4] 🚀 12レース一括保存してGit Push
  → save-predictions.mjs（Netlify Function）
  → GitHub Contents API
  → keiba-data-shared に自動コミット・プッシュ完了 ✅
```

**安全性:**
- predictions-manager.astroには**一切触れていない**
- 完全に別ファイルとして実装
- エラーが出ても既存機能に影響なし
- 慎重確認が必要な場合は個別入力を利用可能

**実装済み機能:**

#### **1. HTML自動抽出（核機能）**
- ✅ **予想HTMLから完全抽出**
  - 馬番・馬名・umacd（馬識別コード）
  - 全予想者の印（◎○▲△×穴注等）
  - SVG形式の印（三角）にも対応
  - 予想者列を自動検出（著作権対応で印番号化）

#### **2. 抽出結果表示**
- ✅ **テーブル形式で確認**
  - 馬番・馬名・umacd
  - 各予想者ごとの印（列ごとに表示）
  - オッズ
  - 抽出エラーがあれば即座に検知

#### **3. JSON出力プレビュー**
- ✅ **完成系データ構造**
  ```json
  {
    "version": "1.0.0",
    "createdAt": "2026-01-30T...",
    "lastUpdated": "2026-01-30T...",
    "raceInfo": {
      "raceDate": "2026-01-30",
      "track": "大井競馬",
      "raceNumber": "11R",
      "raceName": "東京記念",
      "distance": "ダ2,400m",
      "horseCount": 12,
      "startTime": "20:10"
    },
    "rawHtml": "...", // 再現性確保のため必須
    "horses": [
      {
        "number": 1,
        "name": "カフジビーム",
        "umacd": "0123456",
        "marks": {
          "CPU": "◎",
          "牟田雅": "○",
          "西村敬": "▲",
          "広瀬健": "△",
          "本紙": "○"
        },
        "odds": 2.3
      }
      // ... 全頭分
    ],
    "predictors": ["CPU", "牟田雅", "西村敬", "広瀬健", "本紙"]
  }
  ```

#### **4. GitHub連携**
- ✅ **自動JSON生成＆保存**
  - keiba-data-shared リポジトリに自動コミット・プッシュ
  - マージ機能（同日の複数レースを1ファイルにまとめる）

**フロー:**
```
ユーザー → predictions-manager
  → [1] 予想HTML貼り付け
  → [2] 🔍 自動抽出実行
  → 抽出結果テーブル表示（馬番・馬名・umacd・印3/印2/印1/印0）
  → [3] 出力プレビュー（完成系JSONを確認）
  → [4] 🚀 保存してGit Push
  → save-predictions.mjs（Netlify Function）
  → GitHub Contents API
  → keiba-data-shared に自動コミット・プッシュ完了 ✅
```

**保存先:**
```
keiba-data-shared/
└── nankan/
    └── predictions/
        └── YYYY/
            └── MM/
                └── YYYY-MM-DD.json
```

**各サイトでの利用方法:**
1. **keiba-data-sharedから完成系データを取得**
2. **各サイトで独自処理を実行**
   - nankan-analytics: AI判定で印を確定、累積スコア計算、買い目戦略生成
   - central-keiba: シンプルに印のみ確定
   - その他のサイト: 独自のロジックで加工
3. **サイト固有のスキーマに変換**

**削除した機能（各サイトで実装すべき機能）:**
- ❌ 印の確定（本命◎/対抗○の選択UI）
- ❌ サイトプロファイル選択
- ❌ 拡張フィールド入力（累積スコア・買い目戦略等）
- ❌ サイト別スキーマへのエクスポート

**この管理画面が提供するもの:**
- ✅ 予想HTMLからの完全自動抽出
- ✅ 抽出データの正確性確認
- ✅ 完成系JSONの出力
- ✅ GitHub自動保存

**ファイル構成:**
```
src/
├── pages/
│   └── admin/
│       └── predictions-manager.astro  // メイン画面（5ブロック構成）
netlify/
└── functions/
    └── save-predictions.mjs           // GitHub API保存
```

**参考ファイル（将来の拡張用に保持）:**
```
src/
└── lib/
    ├── predictions/
    │   ├── extractor.ts               // HTML抽出（核）
    │   ├── normalizer.ts              // 正規化（核）
    │   ├── validator.ts               // バリデーション（核）
    │   ├── exporter.ts                // Exporter（各サイトで利用可能）
    │   └── site-profiles.ts           // サイトプロファイル設定（各サイトで利用可能）
    └── types/
        └── predictions.ts             // 型定義
```

### **JRA予想管理画面（個別入力）（/admin/predictions-manager-jra）✅ 完成 NEW**

**URL:** https://keiba-data-shared-admin.netlify.app/admin/predictions-manager-jra

**コンセプト:** **南関版と同じ完成系（Core）を提供、JRA特有のHTML形式に対応**

**実装済み機能:**

#### **1. JRA特有のHTML対応**
- ✅ **スペース入りヘッダー対応**
  - 「騎 手」「厩 舎」などスペース入りthを正規表現で処理
  - `text.replace(/\s+/g, '')` でスペース削除して比較
- ✅ **予想者検出**
  - CPU、青木行、信根隆、橋本篤、本紙など
  - 著作権対応: 印5/印4/印3/印2/印1 に匿名化
- ✅ **騎手・厩舎情報抽出**
  - th位置から自動検出
  - テーブル・カードに表示

#### **2. スコアリング＆振り分け**
- ✅ **スコア定義**
  - ◎5点/○4点/▲3点/svg2点/穴2点/△1点
- ✅ **振り分けロジック**
  - 本命/対抗/単穴/連下最上位/連下(1~3頭)/補欠/無
  - 南関版と統一

#### **3. 保存**
- ✅ **保存先**: `jra/predictions/YYYY/MM/YYYY-MM-DD.json`
- ✅ **Netlify Function**: save-predictions-jra.mjs
- ✅ **マージ機能**: 既存データとマージ可能

**フロー:**
```
ユーザー → predictions-manager-jra
  → [1] JRA予想HTML貼り付け
  → [2] 🔍 自動抽出実行
  → 抽出結果テーブル表示（印5/印4/印3/印2/印1・騎手・厩舎）
  → [3] 出力プレビュー（完成系JSONを確認）
  → [4] 🚀 保存してGit Push
  → save-predictions-jra.mjs（Netlify Function）
  → GitHub Contents API
  → keiba-data-shared に自動コミット・プッシュ完了 ✅
```

### **JRA予想管理画面（一括入力）（/admin/predictions-manager-jra-batch）✅ 完成 NEW**

**URL:** https://keiba-data-shared-admin.netlify.app/admin/predictions-manager-jra-batch

**コンセプト:** **12レース分のHTMLを一度に処理して効率化（南関版と同じパターン）**

**実装済み機能:**

#### **1. 一括入力**
- ✅ **12レース分のHTMLを一度に貼り付け**
  - レース境界を自動検出（`<div class='racename'>`で分割）
  - 各レースを個別に抽出・バリデーション

#### **2. アコーディオン形式プレビュー**
- ✅ **成功/失敗を明確に表示**
  - 成功したレース: 緑色表示
  - エラーが出たレース: 赤色表示
  - サマリー表示（成功数/エラー数/合計）

#### **3. 一括保存**
- ✅ **12レース分を1つのJSONファイルに保存**
  - save-predictions-jra.mjs を使用
  - keiba-data-sharedに自動コミット・プッシュ
  - 既存データとマージ可能

**フロー:**
```
ユーザー → predictions-manager-jra-batch
  → [1] 12レース分のHTML一括貼り付け
  → [2] 🔍 12レース一括解析
  → レース境界自動検出 → 各レース個別抽出
  → [3] プレビュー確認（成功/失敗を明確表示）
  → [4] 🚀 12レース一括保存してGit Push
  → save-predictions-jra.mjs（Netlify Function）
  → GitHub Contents API
  → keiba-data-shared に自動コミット・プッシュ完了 ✅
```

**保存先:**
```
keiba-data-shared/
└── jra/
    └── predictions/
        └── YYYY/
            └── MM/
                └── YYYY-MM-DD.json
```

---

## 🔧 **開発コマンド** 🔧

### **基本コマンド**

```bash
# 作業ディレクトリに移動
cd /Users/apolon/Projects/keiba-data-shared-admin

# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview
```

### **Gitコマンド**

```bash
# 状態確認
git status

# 変更を追加
git add .

# コミット
git commit -m "✨ [件名]

[詳細]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# プッシュ
git push origin main

# ログ確認
git log --oneline
```

---

## 🔐 **環境変数（Netlify環境変数）** 🔐

**Netlify管理画面で設定（Site settings → Environment variables）:**

```bash
# GitHub Personal Access Token（必須）
# 用途: keiba-data-sharedリポジトリへのコミット・プッシュ
GITHUB_TOKEN_KEIBA_DATA_SHARED=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# リポジトリオーナー（オプショナル、デフォルト: apol0510）
GITHUB_REPO_OWNER=apol0510
```

**重要な注意事項:**
- `GITHUB_TOKEN` は **repo 権限**が必要
- keiba-data-shared リポジトリへの書き込み権限が必要

---

## 📋 **次のステップ** 📋

### **Phase 1: セットアップ（100%完了 ✅）**
- [x] プロジェクト作成
- [x] Astro設定
- [x] results-manager基本実装
- [x] Netlify Function実装
- [x] ドキュメント作成

### **Phase 2: results-manager完成（100%完了 ✅）**
- [x] 全着順データ抽出（15頭対応）
- [x] 払戻金全券種抽出
- [x] タイムデータ抽出（上がり3F/4F/ハロンタイム）
- [x] コーナー通過順抽出（2周レース対応）
- [x] レース名抽出（重賞優先、日付情報と区別）
- [x] プレビュー表示（全情報）
- [x] ブラウザコピペ対応
- [x] デバッグログ充実
- [x] **レースコメント自動生成機能（SEO最適化、250文字）** ✨
  - [x] コーナー通過順から逃げ馬を自動特定
  - [x] 勝ち馬・1番人気・逃げ馬の3頭を必ず含める
  - [x] 日付・競馬場・レース番号・三連単配当を含める
  - [x] 位置取り判定（先頭/2番手/3番手/中団/後方）
  - [x] 勝ち馬個別の上がり3F使用
  - [x] 表記統一（「△番馬名（○番人気）」形式）
  - [x] 騎手・厩舎情報を自然な位置に配置
  - [x] 重複表現の排除（自動生成感を軽減）

### **Phase 3: デプロイ（100%完了 ✅）**
- [x] Git初期化
- [x] GitHub リポジトリ作成
- [x] Netlify連携
- [x] 環境変数設定（GITHUB_TOKEN_KEIBA_DATA_SHARED）
- [x] 本番デプロイ
- [x] 動作確認

### **Phase 4: 運用開始（次のステップ）**
- [ ] 実運用テスト（実際のレースデータで保存）
- [ ] 予想データ管理画面追加（predictions-manager.astro）
- [ ] データ分析ダッシュボード
- [ ] 一括入力機能（複数レース同時入力）
- [ ] データ修正機能

---

## 📝 **コミットメッセージ規約** 📝

### **絵文字プレフィックス**

| 絵文字 | 用途 |
|--------|------|
| 🎉 | プロジェクト初期化 |
| ✨ | 新機能追加 |
| 🐛 | バグ修正 |
| 📝 | ドキュメント更新 |
| 🔧 | 設定変更 |
| ♻️ | リファクタリング |

---

## 🎊 **チェックリスト** 🎊

### **Phase 1: プロジェクト作成（100%完了 ✅）**
- [x] ディレクトリ作成
- [x] Astro設定
- [x] BaseLayout.astro
- [x] トップページ（index.astro）
- [x] results-manager.astro基本実装
- [x] save-results.js（Netlify Function）
- [x] netlify.toml
- [x] README.md
- [x] CLAUDE.md

### **Phase 2: results-manager完全実装（100%完了 ✅）**
- [x] 全着順データ抽出（extractResults）
- [x] 払戻金全券種抽出（extractPayouts）
- [x] タイムデータ抽出（extractTimeData）
  - [x] ブラウザコピペ対応
  - [x] 表形式データ抽出
  - [x] 上がり3F/4F/ハロンタイム
- [x] コーナー通過順抽出（extractCornerData）
  - [x] 2周レース対応
  - [x] 括弧表記対応
  - [x] グローバル正規表現
- [x] レース名抽出（extractRaceInfo）
  - [x] 重賞レース優先
  - [x] 日付情報と区別
  - [x] グレードレース対応
- [x] プレビュー表示拡張
  - [x] 全着順テーブル
  - [x] タイムデータ表示
  - [x] コーナー通過順表示
  - [x] 日付・競馬場表示
- [x] デバッグログ充実

### **Phase 3: Git・GitHub・Netlifyデプロイ（100%完了 ✅）**
- [x] Git初期化
- [x] 初回コミット（累積45+コミット）
- [x] GitHub リポジトリ作成
- [x] リモート連携
- [x] 継続的プッシュ
- [x] Netlify新規サイト作成
- [x] GitHub連携
- [x] ビルド設定
- [x] 環境変数設定（GITHUB_TOKEN）
- [x] 本番デプロイ完了

---

**📅 最終更新日**: 2026-02-08
**🏁 Project Phase**: Phase 1-6 完了 ✅（南関＋中央競馬 完全対応・予想管理完成）
**🎯 Next Priority**: 運用開始 → JRA予想データ実運用 → 各予想サイトでデータ読み込み
**📊 進捗率**: 100%完了（Phase 1-6: 南関＋JRA 結果・予想 完全実装、運用準備完了）

**✨ 最新の成果（2026-02-08）**:
  - **JRA予想管理完全実装** 🎌 NEW
    - predictions-manager-jra.astro 実装 ✅（個別入力）
    - predictions-manager-jra-batch.astro 実装 ✅（一括入力）
    - save-predictions-jra.mjs（Netlify Function）実装 ✅
    - JRA特有のHTML対応 ✅
      - スペース入りヘッダー対応（「騎 手」「厩 舎」）
      - 予想者検出（CPU、青木行、信根隆、橋本篤、本紙）
      - 予想者名の印番号化（印5/印4/印3/印2/印1）著作権対応
    - スコアリング定義 ✅
      - ◎5点/○4点/▲3点/svg2点/穴2点/△1点
    - 振り分けロジック ✅
      - 連下: 1~3頭（南関と統一）
      - 本命/対抗/単穴/連下最上位/連下/補欠/無
    - 一括入力機能 ✅
      - 12レース分を一度に処理
      - レース境界自動検出（`<div class='racename'>`）
      - アコーディオン形式プレビュー
    - 騎手・厩舎情報抽出 ✅
    - 保存先: `jra/predictions/YYYY/MM/YYYY-MM-DD.json` ✅
  - **南関予想管理アップデート** ⚡
    - 連下を1~3頭に変更（JRAと統一）✅
  - **index.astro更新**
    - JRA予想管理（個別/一括）カードを追加 ✅
    - NEWバッジ配置 ✅

**✨ 過去の成果（2026-02-06）**:
  - **中央競馬結果管理対応完了** 🎌
    - results-manager-central.astro 実装 ✅
    - save-results-central.mjs（Netlify Function）実装 ✅
    - 中央競馬データフォーマット対応 ✅
      - 「1回東京2日」開催情報
      - 「1,400メートル」距離表記（カンマ区切り）
      - 「3コーナー」「4コーナー」全角表記
      - 推定上り（上3F）データ抽出
    - 競馬場10会場対応（東京/中山/京都/阪神/中京/新潟/福島/小倉/札幌/函館）✅
    - 最大18頭対応 ✅
    - 保存先: `central/results/YYYY/MM/` ✅
  - **index.astro更新**
    - 南関競馬・中央競馬を明確に分離表示 ✅

**✨ 過去の成果（2026-02-01）**:
  - **predictions-batch（予想管理一括入力）完全実装** ⚡ NEW
    - 12レース分を一度に処理（36万文字対応）✅
    - レース境界自動検出（`<div class='racename'>`で分割）✅
    - エラーハンドリング（成功/失敗を明確表示）✅
    - アコーディオン形式プレビュー（12レース分）✅
    - 一括保存機能（既存のsave-predictions.mjs活用）✅
    - **既存のpredictions-managerには一切影響なし**（完全別ファイル）✅
  - **index.astro更新**
    - 個別入力・一括入力の2つのリンクを追加 ✅
    - NEWバッジでアニメーション表示 ✅

**✨ 過去の成果（2026-01-30）**:
  - **predictions-manager（予想管理システム）完全実装** 🎯 完成
    - 著作権対応完了（記者名→印番号化：印3/印2/印1/印0）✅
    - HTML完全自動抽出 ✅
      - 馬番・馬名・umacd（馬識別コード）
      - 全予想者の印（◎○▲△×穴注等、SVG対応）
      - 性齢・騎手・斤量・厩舎（(大)月岡 形式）
    - スコアリング＆自動振り分け（7分類）✅
      - ◎本命/○対抗/▲単穴/△連下最上位/△連下/×補欠/無
      - 点数定義確定：◎5点/○4点/▲3点/svg2点/△1点/無0点
    - 抽出結果テーブル表示（点数順・馬番順切り替え）✅
    - 自動振り分け結果（カード形式・色分け表示）✅
    - プレビュー＆保存（横並び配置・スクロール対応）✅
    - GitHub連携（自動保存・マージ機能）✅
    - データ最適化（オッズ削除・天候馬場削除）✅
    - 「競馬ブック」記述完全削除（著作権クリア）✅
  - **運用方針確定** 📋
    - keiba-data-shared = GitHub Private・共有データレイヤー ✅
    - 非公開運用・各予想サイトがraw JSON読み込み ✅
    - 自動化成立・非公開維持の両立 ✅
  - 型定義・抽出ロジック・正規化・バリデーション・Exporter（参考実装）✅
  - save-predictions.mjs（Netlify Function）実装 ✅
  - **設計思想の明確化**: 管理画面は「完成系」のみ、加工は各サイトで ✅

**✨ 最新の成果（2026-01-30）**:
  - **predictions-manager 完全実装** 🎯 完成
    - 著作権対応（記者名→印番号化：印3/印2/印1/印0）✅
    - スコアリング結果の点数順・馬番順切り替え ✅
    - 自動振り分け結果（カード形式・7分類表示）✅
    - プレビューと保存ボタンを横並び配置（スクロール対応）✅
    - オッズフィールド削除・天候馬場削除（データ最適化）✅
    - 「競馬ブック」記述を全削除（著作権クリア）✅
  - **運用方針確定** 📋
    - keiba-data-shared = GitHub Private・共有データレイヤー ✅
    - 非公開・各予想サイトがraw JSON読み込み ✅
    - 自動化成立・非公開維持の両立 ✅

**過去の成果（2026-01-28）**:
  - **レースコメント自動生成機能（SEO最適化）** ✨ 新機能
    - コーナー通過順から逃げ馬を自動特定 ✅
    - 勝ち馬・1番人気・逃げ馬の3頭を必ず含める ✅
    - 日付・競馬場・レース番号・三連単配当を含める ✅
    - 250文字程度（SEO最適化） ✅
    - 表記統一・自然な文章表現 ✅
  - results-manager 完全実装 ✅
  - 全着順データ抽出（15頭対応）✅
  - 払戻金全券種抽出 ✅
  - タイムデータ抽出（ブラウザコピペ対応）✅
  - コーナー通過順抽出（2周レース対応）✅
  - レース名抽出（重賞優先）✅
  - プレビュー表示完全対応 ✅
  - Netlifyデプロイ完了 ✅

**🎉 累積成果**:
  - **Netlify Functions**: 4個実装
    - save-results.mjs（南関結果）
    - save-results-central.mjs（JRA結果）
    - save-predictions.mjs（南関予想）
    - save-predictions-jra.mjs（JRA予想）✨NEW
  - **ページ**: 7個実装
    - index.astro（トップページ）
    - results-manager.astro（南関結果・個別）
    - results-manager-central.astro（JRA結果・個別）
    - predictions-manager.astro（南関予想・個別）
    - predictions-batch.astro（南関予想・一括）
    - predictions-manager-jra.astro（JRA予想・個別）✨NEW
    - predictions-manager-jra-batch.astro（JRA予想・一括）✨NEW
  - **参考ライブラリ**: 6個実装（extractor/normalizer/validator/exporter/site-profiles/types）
  - **結果管理**: 6種類抽出機能（レース情報/着順/払戻金/タイム/コーナー/レースコメント）
  - **予想管理**: 完全自動化実装（南関＋JRA、個別入力＋一括入力）
    - HTML自動抽出（著作権対応）
      - 南関: 印4/印3/印2/印1
      - JRA: 印5/印4/印3/印2/印1 ✨NEW
    - スコアリング＆自動振り分け（7分類）
      - ◎5点/○4点/▲3点/svg2点/穴2点/△1点
      - 連下: 1~3頭（南関・JRA統一）
    - 点数順・馬番順切り替え
    - カード形式表示
    - 騎手・厩舎情報抽出 ✨NEW
    - GitHub自動保存（keiba-data-shared Private）
    - **一括入力対応**（12レース分×36万文字、レース境界自動検出）
  - **対応レース**: 南関競馬4競馬場（大井/船橋/川崎/浦和）+ 中央競馬10競馬場（東京/中山/京都/阪神/中京/新潟/福島/小倉/札幌/函館）
  - **対応頭数**: 最大18頭
  - **対応距離**: 2周レース対応（13ハロン）
  - **対応券種**: 全9券種（単勝/複勝/枠連/馬連/枠単/馬単/ワイド/三連複/三連単）
  - **ドキュメント**: README.md、CLAUDE.md
  - **本番URL**: https://keiba-data-shared-admin.netlify.app
  - **運用方針**: GitHub Private・共有データレイヤー（非公開・自動化両立）

---

**作成者: Claude Code（クロちゃん）**
**協力者: マコさん**
