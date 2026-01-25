# DATA FLOW - keiba-data-shared-admin

## このプロジェクトの役割

**結果入力ツール（管理画面）**
- 南関公式サイトから結果をコピペ
- パースして keiba-data-shared リポジトリに保存
- **的中判定は行わない**（keiba-intelligenceで実施）

---

## データフロー

```
南関公式サイト
  ↓ コピペ
results-manager.astro
  ↓ パース
JSON生成
  ↓ Netlify Function (save-results.js)
keiba-data-shared リポジトリ
  └── nankan/results/2026/01/2026-01-23.json （結果データのみ）
```

**重要**: keiba-data-sharedには結果データのみ保存。予想データは保存しない。

---

## 重要な制約

### ❌ やらないこと
- **的中判定を表示しない**
- **予想データの参照・取得**（keiba-intelligenceがローカル管理）
- **予想データの編集・作成**（keiba-intelligenceで管理）

### ✅ やること
- 結果データのパース
- keiba-data-shared への保存
- GitHub への自動コミット・プッシュ
- レースごとの個別保存（マージロジック）

---

## ファイル構造

```
keiba-data-shared-admin/
├── src/pages/admin/
│   └── results-manager.astro  【結果入力画面】
└── netlify/functions/
    └── save-results.js  【GitHub保存処理】
```

---

## save-results.js の動作

1. 既存ファイルを取得（GitHub API）
2. 新規レースとマージ（raceNumberで重複排除）
3. raceNumber順にソート
4. GitHub にコミット・プッシュ

**重要**: 既存レースは上書きされない（追加のみ）

---

## 結果データ構造（keiba-data-shared）

```json
{
  "date": "2026-01-23",
  "venue": "船橋",
  "venueCode": "FU",
  "races": [
    {
      "raceNumber": 5,
      "raceName": "ガーネット２２００",
      "distance": 2200,
      "surface": "ダート",
      "results": [...],
      "payouts": {
        "umatan": {
          "combination": "7-9",
          "payout": 8760
        }
      }
    }
  ]
}
```

---

## 予想データについて

**重要**: keiba-data-sharedには予想データは保存されません。

### 予想データの管理場所
- **保存場所**: `keiba-intelligence/astro-site/src/data/predictions/*.json`
- **管理方法**: keiba-intelligenceプロジェクト内でローカル管理
- **的中判定**: keiba-intelligenceが自身のローカル予想と結果を照合

### 予想データ構造（参考：keiba-intelligence）

```json
{
  "eventInfo": {
    "date": "2026-01-23",
    "venue": "船橋"
  },
  "predictions": [
    {
      "raceInfo": {
        "raceNumber": 11,
        "raceName": "鯛ノ浦特別 Ａ２Ｂ１(一)"
      },
      "bettingLines": {
        "umatan": [
          "7-9.3.5.6",  // PRIMARY AXIS（本線）
          "9-7.3.5.6"   // SECONDARY AXIS（抑え）
        ]
      }
    }
  ]
}
```

**用途**: keiba-intelligenceがローカルファイルから読み込み、keiba-data-sharedの結果と照合して的中判定を実施

---

## 環境変数（Netlify）

```bash
GITHUB_TOKEN_KEIBA_DATA_SHARED  # GitHub Personal Access Token
GITHUB_REPO_OWNER=apol0510
```

---

## ローカル開発

```bash
# 開発サーバー起動
npx netlify dev

# アクセス
http://localhost:4322/admin/results-manager
```

---

## 他プロジェクトとの関係

### keiba-data-shared（データストレージ）
- このプロジェクトが**結果データのみ**を保存
- **予想データは保存されない**（keiba-intelligenceがローカル管理）

### keiba-intelligence（表示サイト）
- **予想データ**: ローカルファイル（src/data/predictions/*.json）から読み込み
- **結果データ**: keiba-data-shared から取得
- 予想と結果を照合して的中判定を実施
- ユーザーに表示

---

**最終更新**: 2026-01-26
