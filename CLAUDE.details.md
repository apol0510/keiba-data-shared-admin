# CLAUDE.details.md — 詳細仕様

> 各画面の詳細仕様・JSON構造例・フロー図など。
> 起動時に毎回読む必要はない。必要な時に参照する。

---

## 結果管理画面（results-manager）

### 自動データ抽出
- 全着順データ（最大18頭）: 着順/枠/馬番/馬名/騎手/調教師/タイム/着差/上3F/人気
- 払戻金（全9券種）: 単勝/複勝/枠連/馬連/枠単/馬単/ワイド/三連複/三連単
  - 7頭以下の複勝2着まで対応
- タイムデータ: 上がり3F/4F、ハロンタイム（13ハロン対応）
- コーナー通過順: 2周レース対応、括弧表記対応
- レース名抽出優先順位:
  1. 重賞レース名（第○回、グレード記号）
  2. 地方競馬グレード（Ａ１、Ｂ２など）
  3. 「特別」「賞」「杯」を含むレース名
  4. カタカナ主体レース名（5文字以上）
  5. クラス名（３歳など）

### レースコメント自動生成（SEO最適化）
- コーナー通過順から逃げ馬を自動特定
- 必須3頭: 勝ち馬・1番人気・逃げ馬
- 250文字程度、三連単配当を必ず含める
- 表記統一:「△番馬名（○番人気）」形式
- 騎手・厩舎情報を結果後に配置

### フロー
```
ユーザー → results-manager（公式サイトからコピペ）
  → 自動パース → JSON生成 → プレビュー確認
  → 「🚀 保存してGit Push」
  → save-results.mjs → GitHub Contents API
  → keiba-data-shared に自動コミット完了
```

---

## 予想管理画面（predictions-manager）

### 設計思想
この管理画面は「完成系」のみを提供。印の確定や拡張フィールドは各サイトで独自処理。

### HTML自動抽出
- 馬番・馬名・umacd・全予想者の印（SVG対応）
- 予想者列を自動検出（著作権対応で印番号化）

### JSON出力構造
```json
{
  "version": "1.0.0",
  "createdAt": "2026-01-30T...",
  "raceInfo": {
    "raceDate": "2026-01-30",
    "track": "大井競馬",
    "raceNumber": "11R",
    "raceName": "東京記念",
    "distance": "ダ2,400m",
    "horseCount": 12,
    "startTime": "20:10"
  },
  "rawHtml": "...",
  "horses": [
    {
      "number": 1, "name": "カフジビーム", "umacd": "0123456",
      "marks": { "CPU": "◎", "印3": "○", "印2": "▲", "印1": "△", "印0": "○" },
      "odds": 2.3
    }
  ],
  "predictors": ["CPU", "印3", "印2", "印1", "印0"]
}
```

### 各サイトでの利用方法
1. keiba-data-sharedから完成系データを取得
2. 各サイトで独自処理（nankan-analytics: AI判定、central-keiba: 印確定 等）
3. サイト固有のスキーマに変換

---

## JRA予想管理画面

### JRA特有のHTML対応
- スペース入りヘッダー対応（「騎 手」「厩 舎」）
- 予想者: 印5/印4/印3/印2/印1 に匿名化
- 騎手・厩舎情報抽出

### JRA保存先の命名規則
- **複数会場対応**: `YYYY-MM-DD-{競馬場名}.json`
- 例: `2026-02-08-小倉.json`, `2026-02-08-東京.json`
- 旧形式 `YYYY-MM-DD.json`（競馬場名なし）は使用禁止

---

## 一括入力（batch）共通仕様

- 12レース分のHTMLを一度に貼り付け（36万文字対応）
- レース境界を自動検出（`<div class='racename'>`で分割）
- 成功: 緑色 / エラー: 赤色 のアコーディオン形式プレビュー
- 12レース分を1つのJSONファイルに保存
- 既存データとマージ可能

---

## コンピ指数管理（computer-manager）

### 対応競馬場
JRA10場 + 南関4場 + 地方10場 = 全24競馬場

### 保存先
```
{category}/predictions/computer/YYYY/MM/YYYY-MM-DD-{venueCode}.json
```

### 機能
- 予想データとの自動補完（騎手・調教師・斤量・馬齢性別）
- 競馬場自動検出（データ貼り付け時）
- 著作権対応: dataSource: 'computer-index', enrichedFrom: 'predictions'

---

## 区切り線自動除去

スタッフ運用で入力前にメモ帳に入れる区切り線を自動除去。
- 正規表現: `/^[\s\u3000]*={3,}.*={3,}[\s\u3000]*$/`
- 適用先: predictions-batch, predictions-manager-jra-batch, results-batch, results-manager-jra-batch, computer-manager, race-data-importer
- 共通ライブラリ: `src/lib/utils/input-cleaner.ts`

---

## ディレクトリ構造

```
keiba-data-shared-admin/
├── src/
│   ├── layouts/BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   └── admin/
│   │       ├── results-manager.astro          # 南関結果（個別）
│   │       ├── results-manager-central.astro   # JRA結果（個別）
│   │       ├── results-batch.astro             # 南関結果（一括）
│   │       ├── results-manager-jra-batch.astro # JRA結果（一括）
│   │       ├── predictions-manager.astro       # 南関予想（個別）
│   │       ├── predictions-batch.astro         # 南関予想（一括）
│   │       ├── predictions-manager-jra.astro   # JRA予想（個別）
│   │       ├── predictions-manager-jra-batch.astro # JRA予想（一括）
│   │       ├── computer-manager.astro          # コンピ指数
│   │       └── race-data-importer.astro        # レースデータ取込
│   ├── styles/global.scss
│   └── lib/
│       ├── constants/venue-codes.ts            # 競馬場コード（一元管理）
│       ├── utils/input-cleaner.ts              # 区切り線除去
│       ├── predictions/                        # 参考ライブラリ
│       └── types/predictions.ts
├── netlify/functions/
│   ├── save-results.mjs
│   ├── save-results-central.mjs
│   ├── save-predictions.mjs
│   ├── save-predictions-jra.mjs
│   ├── parse-computer.mjs
│   ├── preview-computer.mjs
│   ├── save-computer.mjs
│   ├── save-keiba-book.mjs
│   └── post-to-x.mjs
└── public/
```

---

## keiba-computer-web デプロイ整理

| 操作 | keiba-data-shared デプロイ | keiba-computer-web デプロイ |
|------|---|---|
| 南関/JRA 結果・予想を保存 | ✅ 自動トリガー | 不要（SSR） |
| コンピ指数を保存 | 不要 | 不要（SSR） |
| keiba-computer-web のコードを変更 | 不要 | ✅ git push で自動 |

---

## 期待値算出
- predictedOddsあり: 実オッズ × 勝率 - 1
- predictedOddsなし: 控除率25%の理論オッズ（EV≈-25%）
