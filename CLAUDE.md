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

### **データ確認時の標準手順（重要）**

**❌ 絶対にやってはいけないこと:**
- 「データが見つかりません」と即座に報告すること
- 手動実行を提案すること
- 毎回同じエラーを繰り返すこと
- **git pull せずにローカルファイルを確認すること** ← 最重要

**✅ 正しい手順（必ず実行）:**

```bash
# 0. 【最重要】keiba-data-sharedを最新に同期（これを忘れると古いデータしか見えない）
git -C /Users/apolon/Projects/keiba-data-shared pull origin main

# 1. keiba-data-sharedの存在確認
ls -la /Users/apolon/Projects/keiba-data-shared

# 2. 該当日付のデータ確認（例: 2026年2月28日のJRA結果）
ls -la /Users/apolon/Projects/keiba-data-shared/jra/results/2026/02/

# 3. ファイル内容確認（JSONが存在する場合）
cat /Users/apolon/Projects/keiba-data-shared/jra/results/2026/02/2026-02-28-*.json

# 4. 最新のデータ確認（最近5件）
ls -lt /Users/apolon/Projects/keiba-data-shared/jra/results/2026/02/ | head -6

# 5. データが本当に存在しない場合のみ、その旨を報告
```

**重要な注意事項:**
- **keiba-data-sharedはリモート（GitHub）が常に最新**
- ローカルは古い可能性が高いため、**必ず最初に `git pull` を実行**
- 南関データは `nankan/results/`, `nankan/predictions/`
- JRAデータは `jra/results/`, `jra/predictions/`
- コンピ指数は `{category}/predictions/computer/`

### **厳格な制約事項**

#### **✅ 許可される操作**
- `/Users/apolon/Projects/keiba-data-shared-admin/` 配下のみ
- すべてのサブディレクトリ（src/, netlify/, public/）
- README.md、CLAUDE.md、package.json

#### **✅ 例外的にアクセス許可される操作（データ参照専用）**
- **keiba-data-shared リポジトリへの読み取り専用アクセス**
  - **パス**: `/Users/apolon/Projects/keiba-data-shared`
  - **目的**: 保存済みデータの確認、自動化の検証
  - **制約**: 読み取り専用（ls, cat, grep等）、書き込み禁止

#### **❌ 絶対禁止の操作**
- keiba-data-shared 以外のプロジェクトディレクトリへのアクセス
- 親ディレクトリ `/Users/apolon/Projects/` の直接走査・検索
- keiba-data-shared への直接書き込み（GitHub API経由のみ許可）

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
| バックエンド | Netlify Functions (Node.js 20) | 7個実装（save-results.mjs, save-results-central.mjs, save-predictions.mjs, save-predictions-jra.mjs, parse-computer.mjs, preview-computer.mjs, save-computer.mjs） |
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
- ✅ **保存先**: `jra/predictions/YYYY/MM/YYYY-MM-DD-{競馬場名}.json`
  - **命名規則（重要）**: 複数会場対応のため、ファイル名に競馬場名を含める
  - **例**: `2026-02-08-小倉.json`, `2026-02-08-東京.json`, `2026-02-08-京都.json`
  - ⚠️ **旧形式（非推奨）**: `YYYY-MM-DD.json`（競馬場名なし）は混乱の原因となるため使用禁止
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
                ├── YYYY-MM-DD-{競馬場名}.json  ← 複数会場対応
                ├── 2026-02-08-小倉.json
                ├── 2026-02-08-東京.json
                └── 2026-02-08-京都.json
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

# keiba-intelligence自動判定トリガー用トークン（オプショナル、推奨）
# 用途: 結果保存後にkeiba-intelligenceで自動的に的中判定を実行
# 権限: repo権限 + keiba-intelligenceリポジトリへのアクセス
KEIBA_INTELLIGENCE_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# リポジトリオーナー（オプショナル、デフォルト: apol0510）
GITHUB_REPO_OWNER=apol0510

# Netlify Build Hook URL（オプショナル）
# 用途: keiba-data-sharedの公開サイトを自動ビルド
NETLIFY_BUILD_HOOK_URL=https://api.netlify.com/build_hooks/xxxxx
```

**重要な注意事項:**
- `GITHUB_TOKEN_KEIBA_DATA_SHARED` は **repo 権限**が必要
- `KEIBA_INTELLIGENCE_TOKEN` を設定すると、結果保存後に自動的にkeiba-intelligenceで的中判定が実行される（推奨）
- トークン未設定でも基本機能は動作するが、自動判定は実行されない

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

**📅 最終更新日**: 2026-02-28
**🏁 Project Phase**: Phase 1-7 完了 ✅（南関＋中央競馬 完全対応・予想管理完成・自動判定実装）
**🎯 Next Priority**: 運用開始 → データ保存の完全自動化運用
**📊 進捗率**: 100%完了（Phase 1-7: 南関＋JRA 結果・予想 完全実装、keiba-intelligence自動判定連携完了）

---

## 🚀 **Phase 7: keiba-intelligence自動判定連携（2026-02-28完了 ✅）**

### **実装内容**

#### **1. repository_dispatch連携の実装**
- **save-results-jra.mjs**: JRA結果保存後、keiba-intelligenceに自動通知
- **save-results.mjs**: 南関結果保存後、keiba-intelligenceに自動通知
- **GitHub API経由でrepository_dispatchイベントを送信**

#### **2. keiba-intelligenceワークフロー更新**
- **import-results-jra-daily.yml**: `repository_dispatch: [jra-results-updated]` 追加
- **import-results-nankan-daily.yml**: `repository_dispatch: [nankan-results-updated]` 追加

#### **3. 環境変数の追加**
- **KEIBA_INTELLIGENCE_TOKEN**: keiba-intelligenceリポジトリへのアクセストークン
- Netlify環境変数に設定済み

#### **4. データ確認手順の改善**
- **CLAUDE.md**: セッション開始時に `git pull` を必ず実行する手順を追加
- **package.json**: `npm run dev` でkeiba-data-sharedを自動同期

### **効果**

**以前のフロー:**
```
results-manager-jra-batch で保存
  ↓
23:30の定期実行まで待つ（最大24時間）
  ↓
手動でGitHub Actions実行
```

**現在のフロー:**
```
results-manager-jra-batch で保存
  ↓
即座にrepository_dispatch送信 ✅
  ↓
GitHub Actionsが自動起動 ✅
  ↓
数分で的中判定完了 ✅
```

### **再発防止策**

#### **問題: Claudeがデータを見つけられない**
- **原因**: ローカルのkeiba-data-sharedが古く、`git pull` していなかった
- **解決策**:
  1. データ確認前に必ず `git -C /Users/apolon/Projects/keiba-data-shared pull origin main` を実行
  2. `npm run dev` で自動的にkeiba-data-sharedを同期
  3. CLAUDE.mdに手順0として明記

#### **問題: 自動判定が実行されない**
- **原因**: repository_dispatch連携が未実装
- **解決策**: 結果保存後、即座にkeiba-intelligenceに通知を送信

---

## 🐛 **バグ修正履歴** 🐛

### **2026-02-12 (1): 13頭立てレースで8頭しか処理されない問題の修正**

**問題:**
- `/admin/results-batch` で13頭立てのレースを処理した際、8頭しか抽出されない
- 原因: `extractResults` 関数が最小フィールド数14を要求していたため、コーナー通過順が「-」の場合にフィールド数が不足してスキップされていた

**修正内容:**

#### **1. results-batch.astro の修正**
- 最小フィールド数を **14 → 10** に緩和（行704）
- 人気フィールドがない場合のデフォルト値を99に設定
- デバッグログを追加（フィールド数・抽出成功/失敗をコンソール出力）

#### **2. results-manager.astro の修正**
- 正規表現を柔軟に変更（コーナー通過順と人気をオプショナルに）
- 従来: `(\d+)\s*$` で最後まで必須
- 新: `(?:[\s\u3000]+(.*)[\s\u3000]+(\d+))?\s*$` でオプショナル
- デバッグログを追加（マッチ成功/失敗をコンソール出力）

**再発防止策:**
- ✅ デバッグログ充実（抽出した頭数・各馬の詳細をログ出力）
- ✅ フィールド数の柔軟化（コーナー通過順・人気がない場合も対応）
- ✅ 払戻金セクション到達時に抽出終了（誤抽出防止）

**影響範囲:**
- `/admin/results-batch` (南関・一括入力)
- `/admin/results-manager` (南関・個別入力)

**テスト推奨:**
- 13頭立てレース（コーナー通過順が「-」のケース）
- 18頭立てレース（最大頭数）
- 7頭以下のレース（小頭数）

---

### **2026-02-12 (2): 着差スペース区切りによる「NaN番人気」表示の修正**

**問題:**
- レース結果ページで「NaN番人気」と表示される（例: https://keiba-data-shared.netlify.app/nankan/results/2026/02/11/funabashi/11/）
- 原因: 着差が「２ 1/2」のようにスペース区切りになっている場合、フィールドがずれて人気フィールドが正しく取得できなかった
  - 期待: `parts[11] = "２ 1/2"`, `parts[14] = "7"`
  - 実際: `parts[11] = "２"`, `parts[12] = "1/2"`, `parts[14] = "-"`, `parts[15] = "7"`

**修正内容:**

#### **1. results-batch.astro の修正**
- **最後のフィールドから逆算**する方式に変更
- 最後が数字なら人気、その一つ前が上がり3F、その前までが着差（スペース区切りを結合）
- 着差フィールドを正しく結合：`parts.slice(11, parts.length - 2).join(' ')`

#### **2. results-manager.astro の修正**
- タイム以降の部分を `(.+)$` で柔軟に取得
- 最後のフィールドから逆算して人気・上がり3F・着差を抽出
- 着差にスペースが含まれる場合も正しく結合

**再発防止策:**
- ✅ 最後のフィールドから逆算（前方からの固定位置ではなく、後方から逆算）
- ✅ 着差フィールドのスペース区切りに対応（「２ 1/2」「３ 1/4」など）
- ✅ デバッグログで着差内容も出力

**影響範囲:**
- `/admin/results-batch` (南関・一括入力)
- `/admin/results-manager` (南関・個別入力)

**テスト推奨:**
- 着差が「２ 1/2」「３ 1/4」「ハナ」「クビ」など多様なケース
- 1着馬（着差が「-」のケース）
- 大差（着差が「大差」のケース）

---

### **2026-02-12 (3): 出走頭数フィールドの追加**

**問題:**
- レース結果ページ（keiba-data-shared）で出走頭数が表示されない
- JSONデータに `horses` フィールドが保存されていなかった（一括入力のみ）
- 原因: results-batch.astro の `data` オブジェクトに `horses` フィールドが欠落

**修正内容:**

#### **1. results-batch.astro の修正**
- `data` オブジェクトに `horses: raceInfo.horses || results.length` を追加
- プレビュー表示でも `data.horses` を優先して表示

#### **2. results-manager.astro**
- 既に対応済み（`horses: raceInfo.horses` が含まれていた）

**再発防止策:**
- ✅ extractRaceInfo関数で抽出した全フィールドをdataオブジェクトに含める
- ✅ プレビュー表示でhorsesフィールドを確認できるようにする

**影響範囲:**
- `/admin/results-batch` (南関・一括入力)

**注意事項:**
- 既存データ（2026年2月11日など）は再入力して「完全上書き保存」する必要があります

---

### **2026-02-12 (4): 連下の頭数制限を5頭から3頭に変更**

**問題:**
- `/admin/predictions-batch` で連下が最大5頭（4～8位）に設定されていた
- 他のページ（predictions-manager, JRA版）は既に3頭（4～6位）に統一済み

**修正内容:**

#### **1. predictions-batch.astro の修正**
- 連下の範囲を `index >= 4 && index <= 8` → `index >= 4 && index <= 6` に変更
- 7位以降または1点以下は補欠に回す
- 表示ラベルを「1~5頭」→「1~3頭」に更新

#### **2. 他のページ（確認済み）**
- predictions-manager.astro: 既に対応済み
- predictions-manager-jra.astro: 既に対応済み
- predictions-manager-jra-batch.astro: 既に対応済み

**振り分けルール（統一）:**
- 本命: 1位（1頭）
- 対抗: 2位（1頭）
- 単穴: 3位（1頭）
- **連下最上位: 4位（1頭）**
- **連下: 5～7位（最大3頭、1点以上）** ← 修正箇所
- 補欠: 8位以降または1点以下（連下から漏れた馬）
- 無: 0点

**連下の合計:** 連下最上位（1頭）+ 連下（最大3頭）= **最大4頭**

**影響範囲:**
- `/admin/predictions-batch` (南関・一括入力)

**⚠️ 重要な訂正（2026-02-12 最終版v2）:**
- 当初「連下: 5～8位（最大5頭）」→「連下: 5～6位（最大2頭）」→「連下: 5～7位（最大3頭）」と修正
- **正しくは「連下: 5～7位（index=4,5,6で最大3頭）」**です
- **index=3: 連下最上位（4位・1頭）**
- **index=4,5,6: 連下（5～7位・最大3頭）**
- **連下の合計: 最大4頭**
- **重要**: index=7以降は補欠に回します（連下には含めません）
- 全4ページ（predictions-batch, predictions-manager, predictions-manager-jra, predictions-manager-jra-batch）のコードと表示ラベルを修正しました

---

### **2026-02-14 (1): JRA結果データ保存後に404エラーが発生する問題の修正**

**問題:**
- JRA結果データを保存しても、keiba-data-sharedで404エラーが発生
- URL: `https://keiba-data-shared.netlify.app/jra/results/2026/02/14/tokyo/3/`
- 原因: Netlifyの自動再ビルドがJRA結果データに対応していなかった

**根本原因:**
- keiba-data-sharedは静的サイト生成（SSG）
- 新しいJSONファイルが追加されても、ビルドしないと新しいページが生成されない
- GitHub Actions の `trigger-netlify-build.yml` が南関データ（nankan）のみ対応で、JRAデータ（jra）が除外されていた

**修正内容:**

#### **1. keiba-data-shared/.github/workflows/trigger-netlify-build.yml の修正**
```yaml
# 修正前（南関のみ）
paths:
  - 'nankan/results/**/*.json'
  - 'nankan/predictions/**/*.json'

# 修正後（南関＋JRA）
paths:
  - 'nankan/results/**/*.json'
  - 'nankan/predictions/**/*.json'
  - 'jra/results/**/*.json'        # ← 追加
  - 'jra/predictions/**/*.json'    # ← 追加
```

**動作フロー（修正後）:**
1. keiba-data-shared-admin でJRA結果を保存
2. Netlify Function（save-results-jra.mjs）がGitHubにプッシュ
3. GitHub Actions が `jra/results/**/*.json` の変更を検出
4. Netlify Build Hook を自動呼び出し
5. Netlifyが再ビルド（5-10分）
6. 新しいページが生成される ✅

**再発防止策:**
- ✅ JRA結果・予想データのプッシュで自動的にNetlify再ビルドがトリガーされる
- ✅ 手動での空コミットや再ビルド操作が不要になる
- ✅ データ保存後、5-10分待てば自動的にページが表示される

**影響範囲:**
- keiba-data-shared/.github/workflows/trigger-netlify-build.yml

**テスト推奨:**
- JRA結果データを保存後、5-10分待ってURLにアクセス
- GitHub Actionsのログで「✅ Netlifyビルドを正常にトリガーしました」を確認

---

### **2026-02-14 (2): JRA競馬場コード不一致による404エラーの再発防止**

**問題:**
- 東京の結果ページが404エラー
- 原因: 保存側（TKY）と表示側（TOK）で競馬場コードが不一致
- 小倉も KKU（誤）と KOK（正）が混在

**根本原因:**
- 競馬場コードの定義が複数箇所に分散していた
  - results-manager-jra.astro: `'東京': 'TKY'`, `'小倉': 'KKU'`
  - results-manager-jra-batch.astro: `'東京': 'TKY'`, `'小倉': 'KOK'`
  - keiba-data-shared 表示側: `'東京': 'TOK'`, `'小倉': 'KOK'`
- 手動で同期する必要があり、不一致が発生しやすい

**修正内容:**

#### **1. 共通定数ファイルの作成**
- **ファイル:** `src/lib/constants/venue-codes.ts`
- **内容:** JRA競馬場コードマップを一元管理
  ```typescript
  export const JRA_VENUE_CODE_MAP: Record<string, string> = {
    '東京': 'TOK',  // ← 統一
    '中山': 'NAK',
    '京都': 'KYO',
    '阪神': 'HAN',
    '中京': 'CHU',
    '新潟': 'NII',
    '福島': 'FKU',
    '小倉': 'KOK',  // ← 統一
    '札幌': 'SAP',
    '函館': 'HKD'
  } as const;
  ```

#### **2. 各ページで共通定数をインポート**
- results-manager-jra.astro
- results-manager-jra-batch.astro
- ⚠️ predictions-manager-jra.astro（今後対応）
- ⚠️ predictions-manager-jra-batch.astro（今後対応）

#### **3. 運用ガイドの作成**
- **ファイル:** `VENUE_CODE_GUIDE.md`
- **内容:**
  - 競馬場コードの一元管理方針
  - 変更時の手順
  - 過去のバグ事例
  - 使用箇所一覧

**再発防止策:**
- ✅ 競馬場コードを `venue-codes.ts` で一元管理
- ✅ 個別定義を禁止（コメントで明記）
- ✅ 変更時は keiba-data-shared の表示側も確認
- ✅ 運用ガイドで今後の変更手順を明記

**影響範囲:**
- src/lib/constants/venue-codes.ts（新規作成）
- src/pages/admin/results-manager-jra.astro
- src/pages/admin/results-manager-jra-batch.astro
- VENUE_CODE_GUIDE.md（新規作成）

**検証結果:**
- ✅ 東京の結果ページが正常に表示される
- ✅ ファイル名が `2026-02-14-TOK.json` で統一される

---

**✨ 最新の成果（2026-02-15）**:
  - **コンピ指数管理システム完全実装** 📊 NEW
    - computer-manager.astro 実装 ✅
    - parse-computer.mjs（パーサーAPI）実装 ✅
    - preview-computer.mjs（プレビューAPI）実装 ✅
    - save-computer.mjs（保存API）実装 ✅
    - 全競馬場対応（JRA/南関/地方）✅
    - 競馬場コード3文字統一（重複解消）✅
      - 大井: OOI, 川崎: KAW, 船橋: FUN, 浦和: URA
      - 東京: TOK, 中山: NAK, 阪神: HAN, 京都: KYO
      - 小倉: KOK, 札幌: SAP, 函館: HKD, 福島: FKS
      - 中京: CHU, 新潟: NII
      - 門別: MON, 盛岡: MOR, 水沢: MIZ, 金沢: KNZ
      - 笠松: KSM, 名古屋: NGY, 園田: SON, 姫路: HIM
      - 高知: KOC, 佐賀: SAG
    - 予想データとの自動補完 ✅
      - 騎手・調教師・斤量・馬齢性別を自動取得
      - プレビュー時に補完結果を表示
      - 補完された馬数をステータス表示
    - UX改善機能 ✅
      - 競馬場の自動検出（データ貼り付け時）
      - フローティング「上に戻る」ボタン
      - プレビュー内「上に戻る」ボタン
      - スムーズスクロール
    - 著作権対応 ✅
      - 「日刊コンピ指数」→「コンピ指数」
      - 「競馬ブックで補完」→「出走情報補完」
      - dataSource: 'computer-index'
      - enrichedFrom: 'predictions'
    - 保存先: `{category}/predictions/computer/YYYY/MM/YYYY-MM-DD-{venueCode}.json` ✅

**✨ 過去の成果（2026-02-08）**:
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
    - 保存先: `jra/predictions/YYYY/MM/YYYY-MM-DD-{競馬場名}.json` ✅
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
  - **Netlify Functions**: 7個実装
    - save-results.mjs（南関結果）
    - save-results-central.mjs（JRA結果）
    - save-predictions.mjs（南関予想）
    - save-predictions-jra.mjs（JRA予想）
    - parse-computer.mjs（コンピ指数パーサー）✨NEW
    - preview-computer.mjs（コンピ指数プレビュー）✨NEW
    - save-computer.mjs（コンピ指数保存）✨NEW
  - **ページ**: 8個実装
    - index.astro（トップページ）
    - results-manager.astro（南関結果・個別）
    - results-manager-central.astro（JRA結果・個別）
    - predictions-manager.astro（南関予想・個別）
    - predictions-batch.astro（南関予想・一括）
    - predictions-manager-jra.astro（JRA予想・個別）
    - predictions-manager-jra-batch.astro（JRA予想・一括）
    - computer-manager.astro（コンピ指数管理・全競馬場）✨NEW
  - **参考ライブラリ**: 6個実装（extractor/normalizer/validator/exporter/site-profiles/types）
  - **結果管理**: 6種類抽出機能（レース情報/着順/払戻金/タイム/コーナー/レースコメント）
  - **予想管理**: 完全自動化実装（南関＋JRA、個別入力＋一括入力）
  - **コンピ指数管理**: 完全実装（全競馬場対応）✨NEW
    - 自動パース・プレビュー・保存
    - 予想データとの自動補完（騎手・調教師・斤量・馬齢性別）
    - 競馬場自動検出機能
    - フローティング「上に戻る」ボタン
    - 3文字競馬場コード統一（24会場対応）
    - 著作権対応済み
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
  - **対応レース**: 南関競馬4競馬場（大井/船橋/川崎/浦和）+ 中央競馬10競馬場（東京/中山/京都/阪神/中京/新潟/福島/小倉/札幌/函館）+ 地方競馬10競馬場（門別/盛岡/水沢/金沢/笠松/名古屋/園田/姫路/高知/佐賀）= 全24競馬場
  - **対応頭数**: 最大18頭
  - **対応距離**: 2周レース対応（13ハロン）
  - **対応券種**: 全9券種（単勝/複勝/枠連/馬連/枠単/馬単/ワイド/三連複/三連単）
  - **ドキュメント**: README.md、CLAUDE.md
  - **本番URL**: https://keiba-data-shared-admin.netlify.app
  - **運用方針**: GitHub Private・共有データレイヤー（非公開・自動化両立）

---

### **2026-02-28 (1): Claudeがデータを見つけられない問題の根本解決**

**問題:**
- Claudeが「2/28のデータが見つかりません」と報告
- 実際にはkeiba-data-sharedに2/28のデータが保存されていた
- 原因: ローカルの `/Users/apolon/Projects/keiba-data-shared` が古く、GitHubリモートと同期していなかった

**修正内容:**

#### **1. CLAUDE.mdにデータ確認手順を追加**
```bash
# 0. 【最重要】keiba-data-sharedを最新に同期（これを忘れると古いデータしか見えない）
git -C /Users/apolon/Projects/keiba-data-shared pull origin main
```

#### **2. package.jsonに自動同期スクリプト追加**
```json
"sync:data": "git -C /Users/apolon/Projects/keiba-data-shared pull origin main --quiet || echo 'keiba-data-shared sync skipped'"
```
- `npm run dev` 実行時に自動的にkeiba-data-sharedを同期

**再発防止策:**
- ✅ データ確認前に必ず `git pull` を実行
- ✅ CLAUDE.mdに手順0として最優先で記載
- ✅ ローカルではなくリモートが常に最新であることを明記

**影響範囲:**
- CLAUDE.md（データ確認時の標準手順を追加）
- package.json（自動同期スクリプト追加）

---

### **2026-02-28 (2): keiba-intelligence自動判定が実行されない問題の解決**

**問題:**
- keiba-data-sharedに結果データが保存されているのに、keiba-intelligenceで自動判定が実行されない
- 23:30の定期実行まで待つ必要があった（最大24時間）

**根本原因:**
- save-results-jra.mjs がGitHubにプッシュした後、keiba-intelligenceに通知を送る仕組みがなかった

**修正内容:**

#### **1. save-results-jra.mjs / save-results.mjs の修正**
- GitHub repository_dispatch APIを呼び出し
- keiba-intelligenceに `jra-results-updated` / `nankan-results-updated` イベントを送信
- 環境変数 `KEIBA_INTELLIGENCE_TOKEN` を使用

#### **2. keiba-intelligenceワークフローの修正**
- import-results-jra-daily.yml に `repository_dispatch: [jra-results-updated]` を追加
- import-results-nankan-daily.yml に `repository_dispatch: [nankan-results-updated]` を追加

#### **3. Netlify環境変数の追加**
- `KEIBA_INTELLIGENCE_TOKEN`: keiba-intelligenceリポジトリへのアクセストークン

**再発防止策:**
- ✅ 結果保存後、即座にkeiba-intelligenceに通知
- ✅ GitHub Actionsが自動的に起動
- ✅ 数分で的中判定が完了

**影響範囲:**
- netlify/functions/save-results-jra.mjs
- netlify/functions/save-results.mjs
- keiba-intelligence/.github/workflows/import-results-jra-daily.yml
- keiba-intelligence/.github/workflows/import-results-nankan-daily.yml
- CLAUDE.md（環境変数ドキュメント更新）

---

### **2026-03-02 (1): タイムゾーンずれによる自動判定失敗の修正**

**問題:**
- 3/1の結果データがkeiba-data-sharedに保存されているのに、keiba-intelligenceで自動判定が実行されない
- repository_dispatchは送信されているが、ワークフローが翌日の日付をチェックしてしまう

**根本原因:**
- save-results-jra.mjs が3/1のデータを保存して `client_payload.date=2026-03-01` を送信
- しかし、ワークフロー実行時にはJSTで既に3/2になっていた
- import-results-jra-daily.yml が `TZ=Asia/Tokyo date` を使用し、3/2のデータを探してしまった
- 3/1のデータは見逃され、アーカイブに反映されなかった

**修正内容:**

#### **1. import-results-jra-daily.yml の修正**
- `Get current date (JST)` ステップで `client_payload.date` を優先使用
- repository_dispatchで日付が指定されている場合は、その日付を使用
- 定期実行（schedule）の場合は従来通りJST今日の日付を使用

#### **2. import-results-nankan-daily.yml の修正**
- 同様に `client_payload.date` を優先使用

**修正後のフロー:**
```
save-results-jra.mjs が 3/1 の結果を保存
  ↓
repository_dispatch送信: client_payload.date=2026-03-01
  ↓
keiba-intelligence ワークフロー起動
  ↓
client_payload.date を優先使用（タイムゾーンに関係なく正しい日付）
  ↓
2026-03-01.json を正しくインポート ✅
```

**再発防止策:**
- ✅ repository_dispatchで送信された日付を優先使用
- ✅ タイムゾーンのずれに影響されない
- ✅ 定期実行も引き続き動作する

**影響範囲:**
- keiba-intelligence/.github/workflows/import-results-jra-daily.yml
- keiba-intelligence/.github/workflows/import-results-nankan-daily.yml

**手動実行コマンド（過去のデータをインポートする場合）:**
```bash
cd /Users/apolon/Projects/keiba-intelligence
gh workflow run import-results-jra.yml -f date=2026-03-01
```

---

### **2026-03-01 (1): JRA予想統合ワークフロー：コンピ指数ファイル除外**

**問題:**
- keiba-data-sharedのGitHub Actions「Merge JRA Prediction Files」でエラー発生
- コンピ指数ファイル（`jra/predictions/computer/2026/03/2026-03-01-KOK.json`）を検出
- 統合スクリプトが通常の予想ファイルパス（`jra/predictions/2026/03/`）を探してエラー

**根本原因:**
- コンピ指数は `jra/predictions/computer/` に保存される
- 統合スクリプトは `jra/predictions/YYYY/MM/` を前提としている
- ワークフローがコンピ指数ファイルも検出対象にしていた

**修正内容:**

#### **1. keiba-data-shared/.github/workflows/merge-jra-predictions.yml の修正**
```yaml
# paths設定にコンピ指数の除外を追加
paths:
  - 'jra/predictions/**/*.json'
  - '!jra/predictions/computer/**'  # ← 追加
```

```bash
# CHANGED_FILESの取得時にcomputerディレクトリを除外
CHANGED_FILES=$(git diff --name-only HEAD^ HEAD | grep 'jra/predictions/.*\.json' | grep -v 'jra/predictions/computer/' || true)

# VENUE_FILESの正規表現を厳密化（computerパスにマッチしないように）
VENUE_FILES=$(echo "$CHANGED_FILES" | grep -E 'jra/predictions/[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}-[A-Z]{3}\.json' || true)
```

**再発防止策:**
- ✅ コンピ指数保存時にワークフローがトリガーされない
- ✅ 通常の予想ファイルのみ統合処理が実行される
- ✅ パス構造の違いによるエラーを防止

**影響範囲:**
- keiba-data-shared/.github/workflows/merge-jra-predictions.yml

**エラー例:**
```
❌ ディレクトリが見つかりません: /home/runner/work/keiba-data-shared/keiba-data-shared/jra/predictions/2026/03
```

---

### **2026-02-16 (1): JRA一括入力レース番号検出の堅牢性強化**

**問題:**
- メイン第11レースが「第3レース」として誤検出される
- 原因: 正規表現 `/(?:第)?(\d{1,2})レース/g` が「11レース」から「1レース」を2回マッチ

**修正内容:**

#### **1. レース番号重複除去**
- 同じレース番号が複数検出された場合、最初のものだけを採用
- `Set` を使用して重複をフィルタリング

#### **2. 単語境界チェック**
- 正規表現を `/(?:^|[^\d])(?:第)?(\d{1,2})レース/gm` に変更
- 前方が数字でないことを確認（11レース→1レース誤検出を防止）

#### **3. エラーハンドリング強化**
- 各抽出関数（extractResults/extractPayouts/extractTimeData/extractCornerData）に個別try-catch
- 着順データは必須（エラー時に停止）
- その他のデータはオプショナル（警告のみで続行）

#### **4. デバッグログ追加**
- プレビューHTML生成時にデータ構造をコンソール出力
- データが全欠損の場合、警告メッセージを表示

#### **5. 南関版にも同期**
- results-batch.astro にも重複除去ロジックを追加
- 予防的措置（南関版は「1R 2026年」パターンで誤検出リスクは低い）

**再発防止策:**
- ✅ JRA_BATCH_TEST_CASES.md を作成（エッジケース網羅）
- ✅ レース番号検出の堅牢性強化（単語境界 + 重複除去）
- ✅ エラーハンドリング強化（部分的エラーでも続行）
- ✅ デバッグログ充実（ブラウザコンソールで詳細確認可能）

**影響範囲:**
- src/pages/admin/results-manager-jra-batch.astro
- src/pages/admin/results-batch.astro（南関版も予防的修正）
- JRA_BATCH_TEST_CASES.md（新規作成）

**テスト推奨:**
- 11R・12Rを含む12レース分の一括入力
- ブラウザ開発者ツールで `[Batch]` ログを確認
- プレビューで全レースが正しく表示されることを確認

---

---

## 🌐 **関連プロジェクト：keiba-computer-web** 🌐

### **概要**

コンピ指数データを一般公開するための閲覧サイト。
computer-manager で保存したデータが自動的に反映される。

| 項目 | 内容 |
|------|------|
| **リポジトリ** | https://github.com/apol0510/keiba-computer-web |
| **本番URL** | https://keiba-computer-web.netlify.app |
| **技術** | Astro SSR + Netlify |
| **作成日** | 2026-02-18 |

### **SSRの仕組み（重要）**

```
computer-manager でデータ保存
    ↓
keiba-data-shared (GitHub) にJSON保存
    ↓ ← ここから先はデプロイ不要！
keiba-computer-web がリクエスト時に
raw.githubusercontent.com から自動fetch
```

**ポイント:**
- keiba-computer-web は **SSR（サーバーサイドレンダリング）**
- データを保存したら **ブラウザでアクセスするだけ** で最新データが表示される
- keiba-computer-web 自体のデプロイは **コードを変更した時のみ** 必要

### **デプロイの整理**

| 操作 | keiba-data-shared デプロイ | keiba-computer-web デプロイ |
|------|---|---|
| 南関/JRA 結果・予想を保存 | ✅ 自動トリガー（GitHub Actions） | 不要（SSR） |
| コンピ指数を保存 | 不要（表示ページなし） | 不要（SSR） |
| keiba-computer-web のコードを変更 | 不要 | ✅ git push で自動 |

### **データパス**

```
{category}/predictions/computer/{year}/{month}/{date}-{venueCode}.json

例:
local/predictions/computer/2026/02/2026-02-19-HIM.json   ← 姫路
nankan/predictions/computer/2026/02/2026-02-19-OOI.json  ← 大井
jra/predictions/computer/2026/02/2026-02-19-TOK.json     ← 東京
```

---

**作成者: Claude Code（クロちゃん）**
**協力者: マコさん**
