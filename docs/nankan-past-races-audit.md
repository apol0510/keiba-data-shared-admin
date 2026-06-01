# 南関過去走データ監査レポート

**作成日**: 2026-06-01
**対象repo**: keiba-data-shared-admin / analytics-keiba / keiba-intelligence / keiba-data-shared
**ステータス**: 監査結果の記録（実装なし・設計提案のみ）
**関連**: [nankan-feature-importance-plan.md](nankan-feature-importance-plan.md) / [cross-project-safety-rules.md](cross-project-safety-rules.md) / [jra-horse-histories-operation.md](jra-horse-histories-operation.md)

> このドキュメントは「過去走データの正本化」を Feature Importance 改善より**先に**行うための前提整理である。
> 表示側だけの場当たり修正や、AK/KI 片寄せ修正を禁止する（[cross-project-safety-rules.md](cross-project-safety-rules.md) 準拠）。

---

## 1. 現在の南関データフロー

南関（大井 OOI / 川崎 KAW / 船橋 FUN / 浦和 URA）の過去走は、**JRA の horseHistories とは完全に別系統**である。

- 南関過去走は **紙面テキスト / importer 由来**であり、JRA horseHistories（公式 accessU.html から全戦績取得）とは取得経路・スキーマが異なる。
- **地方競馬公式からの自動取得は現状存在しない**（後述 §4 の robots.txt 制約あり）。

### フロー

```
[ユーザーが紙面テキストを貼付]
        │
        ▼
race-data-importer.astro  ── parseTextFormat()  ※<?xml/<pdf2xml でなければテキスト判定
  src/pages/admin/race-data-importer.astro
        │  pastRaces[] を抽出（MAX_PAST_RACES=6）
        ▼
save-keiba-book.mjs  ── normalize → enrich(results突合)
  netlify/functions/save-keiba-book.mjs
  保存先: nankan/racebook/YYYY/MM/YYYY-MM-DD-{CODE}.json
        │  pair-guard で racebook×computer 揃い確認 → prediction-updated dispatch
        ▼
entries-manager.astro  ── parseRecentRaces()（南関専用, 最大5走）
  保存先: nankan/entries/YYYY/MM/...
        │
        ▼
   keiba-data-shared（racebook / entries / predictions / computer）
        │
   ┌────┴───────────────────────────────┐
   ▼                                     ▼
analytics-keiba (AK)               keiba-intelligence (KI)
importPrediction.js                importPrediction.js
```

### 取込元 JSON の優先順位（AK / KI 共通）

1. `nankan/predictions/`（predictions-batch 等の正規形式・会場別）
2. `nankan/predictions/computer/`（コンピ指数）
3. legacy 統合ファイル（`nankan/predictions/YYYY/MM/YYYY-MM-DD.json`・非推奨）
4. `nankan/racebook/`（race-data-importer 保存データ）

### AK / KI で recentRaces の取得経路に違いがある

| | recentRaces の取得経路 |
|---|---|
| **AK** | racebook の `pastRaces` を `.slice(0, 5)` で付与（`fetchRacebookPastRaces`） |
| **KI** | **entries（最新3走）を優先**し、未取得時に racebook 内容ベース照合（最新5走）にフォールバック |

→ 同一 JSON 群を読むが、recentRaces の供給経路が AK / KI で異なる。**この差を放置したまま表示側だけ直すことを禁止**（共通正本化が先）。

---

## 2. 現在の過去走データの問題（実データ実測）

`keiba-data-shared/nankan/racebook/2026/06/2026-06-01-FUN.json` ほか複数ファイルの実測に基づく。

### 項目充足状況

| 要求項目 | 南関の保存キー | 状態 | 欠損 |
|---|---|---|---|
| 距離 | `distanceMeters` | ✅ ある程度揃う | ほぼ0% |
| 着順 | `finish` | ✅ ある程度揃う | 低 |
| タイム | `time`（"1.26.1"） | ✅ ある程度揃う | 低 |
| 上がり3F | `final3F` | ✅ ある程度揃う | 0〜数% |
| 馬体重 | `bodyWeight` | ✅ ある程度揃う | 0〜2% |
| 騎手 | `jockey` | ⚠️ 一部欠損 | **1.8〜9.8% null** |
| 斤量 | `weight` | ⚠️ 一部欠損 | **1.8〜9.8% null** |
| レース名 | `raceClass`（階級のみ "2歳" 等） | ◇ 部分 | 正式レース名なし |
| ペース | `paceType` / `paceRank` | ✅ | — |
| **馬場状態** | `cond` | ❌ 構造的欠落 | **100% null** |
| **通過順(コーナー)** | `courseNote` | ❌ 構造的欠落 | **100% null** |
| **人気** | （キーなし） | ❌ 構造的欠落 | 全欠損 |
| **着差(margin)** | （キーなし） | ❌ 構造的欠落 | 全欠損 |
| **surface(芝/ダ)** | （キーなし） | ❌ 構造的欠落 | 全欠損 |
| **頭数(fieldSize)** | （キーなし） | ❌ 構造的欠落 | 全欠損 |
| **sourceUrl** | （キーなし） | ❌ 構造的欠落 | 来歴トレース不能 |
| **fetchedAt** | （キーなし） | ❌ 構造的欠落 | 来歴トレース不能 |

### 問題サマリ

- **距離・着順・タイム・上がり・馬体重はある程度揃う。**
- **騎手・斤量に一部欠損がある（1.8〜9.8%）。**
- **馬場状態・通過順・人気・着差・surface・頭数・sourceUrl・fetchedAt が構造的に欠けている**（紙面テキストに記載がないため）。
- **venue に「船橋 5.8」のように日付が埋め込まれており、`raceDate` / `venue` の分離が不十分。**
- **過去走は4走中心**（実測: OOI 158頭中 119頭=75%が4走）。**新馬・少走馬は0〜3走**になる。

---

## 3. 現在の南関 Feature Importance の問題

> 詳細な再設計方針は [nankan-feature-importance-plan.md](nankan-feature-importance-plan.md) を参照。ここでは監査で判明した「問題」のみ記録する。

- **AK は `computeImportance` 由来の3項目**（安定性 / 能力上位性 / 展開利）。
  `analytics-keiba/astro-site/src/lib/horseEnrichment.js: computeImportance()`
- **KI は `generateAdvancedMetrics` 由来の6項目**（Speed Index / Stamina Rating / Form Trend / Track Compatibility / Distance Fitness / Jockey Factor）。
  `keiba-intelligence/astro-site/src/utils/featureScores.js: generateAdvancedMetrics()`
- **AK / KI は同じ値・同じ表示ではない**ため、差別化としては**正常**（[feature-scores-site-differentiation.md](feature-scores-site-differentiation.md) の方針と整合。統一してはいけない）。
- ただし **KI は recentRaces 欠損時に 50 baseline へ逃げるリスク**がある（`calcSpeedIndex` / `calcStaminaRating` / `calcTrackCompatibility` / `calcDistanceFitness` が空配列時に 50 を返す）。南関は0〜3走の少走馬が実在するため、**6項目バーが 50 で並ぶ馬が発生し得る**（事実上の仮値残留）。
- **現状のデータ欠損では、特に展開利の根拠が弱い**（通過順・馬場・人気が構造的に欠落しているため）。
- **特徴量重要度の改善前に、過去走データの正本化が必要。**

---

## 4. 地方競馬公式取得について

地方競馬公式 `keiba.go.jp` の robots.txt を実取得した結果（2026-06-01 時点）:

```
User-agent: Googlebot
Disallow:                               ← Google だけ全許可
User-agent: *
Crawl-delay: 10
Disallow: /KeibaWeb/TodayRaceInfo/      ← 出馬表・本日レース
Disallow: /KeibaWeb/DataRoom/           ← 競走成績・過去走データ検索
Disallow: /KeibaWeb/DataDownload/       ← データDL
Disallow: /KeibaWeb/MonthlyConveneInfo/
Disallow: /KeibaWeb_IPAT/
（SP版 /KeibaWebSP/... も同様に Disallow）
```

### 結論

- **`keiba.go.jp` の robots.txt 上、TodayRaceInfo / DataRoom / DataDownload は `User-agent: *` に対して Disallow** である（Googlebot のみ許可）。過去走正本化に必要な出馬表・競走成績・DL がまさに Disallow 対象。
- **したがって keiba.go.jp の直接スクレイピングを前提にしない。**
- 公式由来データを使う場合は、**規約確認・許可取得・低頻度・キャッシュ前提**が必要。
- **現実的には、現行テキスト / importer + `results` 突合 + `dataQualityFlags` による正本化を優先する。**

参照URL:
- robots.txt: `https://www.keiba.go.jp/robots.txt`
- 本日のレース情報: `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/TodayRaceInfoTop`
- 南関東4競馬場公式 成績・払戻金: `https://www.nankankeiba.com/repay/00000000000000.do`

---

## 5. 南関専用データ契約案

> JRA horseHistories を**流用せず**、南関専用の独立契約として設計する。
> 「全戦績」ではなく「直近数走の補完」が実体のため、JRA の `horseHistories` とは別名にして混線を防ぐ。

### 保存先案

```
nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json
```

### 必要項目

| フィールド | 型 | 現状 | 備考 |
|---|---|---|---|
| `raceDate` | string(YYYY-MM-DD) | ❌新規 | venue 埋込から分離 |
| `venue` | string(3文字コード) | ⚠️ | OOI/KAW/FUN/URA に正規化 |
| `raceNo` | number | ❌ | |
| `raceName` | string | ◇ | 階級→正式名 |
| `distance` | string | ✅ | "ダ1400" 等 |
| `distanceMeters` | number | ✅ | |
| `surface` | "ダ"\|"芝" | ❌ | 南関ほぼダート、明示化 |
| `trackCondition` | string | ❌(cond 100%null) | 良/稍/重/不良 |
| `finishPosition` | number\|"取消"等 | ✅ | 除外・中止・取消を許容 |
| `horseNumber` | number | △ | |
| `jockey` | string | ⚠️(欠損) | |
| `carriedWeight` | number | ⚠️(欠損) | |
| `bodyWeight` | number | ✅ | |
| `popularity` | number | ❌ | |
| `time` | string | ✅ | |
| `margin` | string | ❌ | |
| `cornerOrder` | string | ❌(courseNote 100%null) | |
| `last3F` | number | ✅ | |
| `fieldSize` | number | ❌ | |
| `sourceUrl` | string | ❌ | 来歴 |
| `fetchedAt` | string(ISO) | ❌ | 来歴 |
| `dataQualityFlags` | string[] | ❌新規(**必須**) | 欠損判定を契約化 |

### `dataQualityFlags` を必須にする

表示側・特徴量側が「この項目は欠損だから使わない／フォールバックする」を**データ契約として判定可能**にし、50固定の暗黙退避を排除する。

例:
- `no-corner` — 通過順なし
- `no-popularity` — 人気なし
- `no-track-condition` — 馬場状態なし
- `jockey-missing` — 騎手欠損
- `weight-missing` — 斤量欠損
- `source-unknown` — 取得元不明

---

## 6. 今後の推奨ロードマップ

| Phase | 内容 |
|---|---|
| **Phase 0** | `nankan/results` の実データ監査（通過順・人気・着差・馬場が results 側に存在するか確認） |
| **Phase 1** | racebook / computer / predictions / results の突合可能性確認 |
| **Phase 2** | `nankan/recentHorseHistories` の契約設計（§5、`dataQualityFlags` 必須） |
| **Phase 3** | results 突合による欠損補完のドライラン |
| **Phase 4** | AK / KI が共通の南関正本を読む設計（表示は KI=6 / AK=3 のまま） |
| **Phase 5** | KI の 50 baseline 退避を `dataQualityFlags` ベースに見直す |
| **Phase 6** | 南関 Feature Importance を再設計 |
| **Phase 7** | AK / KI 差別化表示へ展開 |

各 Phase はマコさんの明示許可後に着手する。

---

## 7. 禁止事項

- **`keiba.go.jp` の robots Disallow パス（TodayRaceInfo / DataRoom / DataDownload 等）を自動取得しない。**
- **JRA horseHistories を南関にそのまま流用しない**（南関は南関専用設計）。
- **表示側だけで場当たり修正しない。**
- **AK だけ、または KI だけに寄せた修正をしない。**
- **`featureScores.js` / `computeImportance` / `HorseMainCard` / `RaceHorseSection` を場当たり的に変更しない。**
- **AI総合指数・印・買い目・予想本文・過去走表示を巻き込まない。**
- **既存 JSON を手作業で補完しない。**
- **workflow_dispatch / shared への PUT は明示許可なしに実行しない。**

詳細は [cross-project-safety-rules.md](cross-project-safety-rules.md) を参照。
