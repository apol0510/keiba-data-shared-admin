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
| バックエンド | Netlify Functions (Node.js 20) | 2個実装（save-results.mjs, save-predictions.mjs） |
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

**コンセプト:** **複数サイトで自動調整可能な予想変換システム（核）**

**実装済み機能:**

#### **1. 核（Core）- 複数サイト共通**
- ✅ **HTML自動抽出**
  - 競馬ブック出馬表HTMLから予想印・馬名・馬番・オッズを自動抽出
  - SVG形式の印（三角）にも対応
  - 予想者列を自動検出（CPU・牟田雅・西村敬・広瀬健・本紙）
- ✅ **印の自動提案＋手動確定**
  - 予想印を集計して本命・対抗・単穴を自動提案
  - 最終的には人が確定（ワンクリックでOK）
- ✅ **強力なバリデーション**
  - 馬番・馬名の整合性チェック
  - 印の重複チェック（本命◎は1頭のみ等）
  - 必須項目の抜け検知
  - raw HTMLの保存（再現性のため絶対必要）
- ✅ **核データ生成**
  - レース情報・馬データ・確定印を正規化
  - バージョン管理（version: "1.0.0"）

#### **2. 拡張（Extension）- サイト別カスタマイズ**
- ✅ **サイトプロファイル**
  - nankan-analytics（フル装備）
  - central-keiba（シンプル）
  - minimal（印のみ）
- ✅ **拡張パネル**
  - 累積スコア・特徴量重要度（安定性・能力上位性・展開利）
  - 買い目戦略（少点数的中型・バランス型・高配当追求型）
  - サイトごとに表示フィールドが変わる
- ✅ **Exporter**
  - nankan-v1スキーマへの自動変換
  - 複数ターゲット対応（将来拡張可能）

#### **3. プレビュー＆保存**
- ✅ **リアルタイムプレビュー**
  - 核データ（Core）
  - 出力JSON（サイト別スキーマ）
- ✅ **GitHub連携**
  - 自動JSON生成
  - keiba-data-shared リポジトリに自動コミット・プッシュ
  - マージ機能（同日の複数レースを1ファイルにまとめる）

**フロー:**
```
ユーザー → predictions-manager（競馬ブックHTMLを貼り付け）
  → 自動抽出（予想印・馬名・馬番・オッズ）
  → 印の自動提案＋手動確定
  → サイトプロファイル選択（nankan-analytics/central-keiba/minimal）
  → 拡張フィールド入力（累積スコア・買い目戦略等）
  → プレビュー確認（核データ & 出力JSON）
  → 「🚀 保存してGit Push」ボタンクリック
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

**設計思想:**
- **核＋差し替えアーキテクチャ**
  - 核（Extract/Normalize/Validate/Export）は全サイト共通
  - 拡張（特徴量重要度・買い目戦略）はサイトごとに差し替え可能
  - 1画面完結（nankan-analyticsの3ステップ変換を1ステップに統合）
- **壊れにくい設計**
  - 馬識別キー（umacd or 馬番+馬名）
  - raw HTMLの保存（再現性のため）
  - エラー分類（ParseError/MissingField/DuplicateMark/OutOfRange...）
- **長期運用可能**
  - サイトプロファイル設定で容易に拡張
  - 複数リポジトリへの出力対応
  - バージョン管理

**ファイル構成:**
```
src/
├── pages/
│   └── admin/
│       └── predictions-manager.astro  // メイン画面（7ブロック構成）
├── lib/
│   ├── predictions/
│   │   ├── extractor.ts               // HTML抽出（核）
│   │   ├── normalizer.ts              // 正規化（核）
│   │   ├── validator.ts               // バリデーション（核）
│   │   ├── exporter.ts                // Exporter（差し替え）
│   │   └── site-profiles.ts           // サイトプロファイル設定
│   └── types/
│       └── predictions.ts             // 型定義
netlify/
└── functions/
    └── save-predictions.mjs           // GitHub API保存
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

**📅 最終更新日**: 2026-01-30
**🏁 Project Phase**: Phase 1-4 完了 ✅（結果管理＋予想管理の核）
**🎯 Next Priority**: 実運用テスト → 他サイトへの展開
**📊 進捗率**: 100%完了（Phase 1-4: 完了）

**✨ 最新の成果（2026-01-30）**:
  - **predictions-manager（予想管理システム）完成** ✨ 核機能
    - 複数サイトで自動調整可能な予想変換システム（核）✅
    - HTML自動抽出（競馬ブック）✅
    - 印の自動提案＋手動確定 ✅
    - サイトプロファイル（nankan-analytics/central-keiba/minimal）✅
    - 拡張パネル（累積スコア・買い目戦略）✅
    - Exporter（nankan-v1スキーマ）✅
    - GitHub連携（自動保存・マージ機能）✅
    - 核＋差し替えアーキテクチャ ✅
    - 1画面完結（3ステップ→1ステップに統合）✅
  - 型定義・サイトプロファイル・抽出ロジック・正規化・バリデーション・Exporter実装 ✅
  - save-predictions.mjs（Netlify Function）実装 ✅

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
  - **Netlify Functions**: 2個実装（save-results.mjs, save-predictions.mjs）
  - **ページ**: 3個実装（index.astro, results-manager.astro, predictions-manager.astro）
  - **核ライブラリ**: 6個実装（extractor/normalizer/validator/exporter/site-profiles/types）
  - **結果管理**: 6種類抽出機能（レース情報/着順/払戻金/タイム/コーナー/コメンタリー）
  - **予想管理**: 核＋差し替えアーキテクチャ（複数サイト対応）
  - **対応レース**: 南関競馬全競馬場（大井/船橋/川崎/浦和）+ 中央競馬
  - **対応頭数**: 最大18頭
  - **対応距離**: 2周レース対応（13ハロン）
  - **対応券種**: 全9券種（単勝/複勝/枠連/馬連/枠単/馬単/ワイド/三連複/三連単）
  - **サイトプロファイル**: 3種類（nankan-analytics/central-keiba/minimal）
  - **ドキュメント**: README.md、CLAUDE.md
  - **本番URL**: https://keiba-data-shared-admin.netlify.app

---

**作成者: Claude Code（クロちゃん）**
**協力者: マコさん**
