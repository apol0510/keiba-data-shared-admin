# 南関 horseHistories 詳細データ取得・保存契約 v0 ドラフト

**作成日**: 2026-06-10
**ステータス**: 契約ドラフト（**設計のみ・実装なし・取得なし・スクレイプなし**）
**対象repo**: keiba-data-shared-admin（中心） / keiba-data-shared（保存先） / analytics-keiba・keiba-intelligence（読み手）
**PR**: PR-D0（本ドラフト）
**前提docs**:
- [nankan-horse-detail-display-plan.md](nankan-horse-detail-display-plan.md)（Phase A/B、Phase B-0 §22）
- [nankan-recent-horse-histories-contract.md](nankan-recent-horse-histories-contract.md)（recentHorseHistories=最大5走 契約 v0）
- [jra-horse-histories-operation.md](jra-horse-histories-operation.md)（中央JRA horseHistories 運用）
- [cross-project-safety-rules.md](cross-project-safety-rules.md)

> 本ドキュメントは「南関版 horseHistories 詳細データ」の取得・保存契約の **v0 ドラフト**である。
> **実装・JSON生成・スクレイプ・実取得・shared保存・AK/KI変更は一切行わない。docs-only。**
> Phase B-0（プロフィール先行表示・§22）が**表示側の補助**であったのに対し、本契約は
> **「各馬の全競走履歴データを南関でも持つ」という admin/shared 側のデータ供給の設計**である。

---

## 1. 目的

南関でも中央JRA `horseHistories` と**同じ思想**で、各馬の詳細データを持ち、AK/KI で以下を表示できるようにする。

- **プロフィール**（性齢 / 父 / 騎手 / 斤量 / 調教師）
- **通算成績**（通算 / 勝率 / 連対率 / 3着内率）
- **条件別成績**（ダート / 同距離±200m / 同会場）
- **競走成績（直近10走）**（日付 / 会場 / 距離 / 着順 / 人気 / レース名 / 騎手 / 馬体重 / タイム / 勝ち馬）

ただし上記はすべて **表示用途**に限定し、`featureScores` / `generateAdvancedMetrics` / AI指数 / 印 / 買い目 / 穴馬抽出には**接続しない**（§8）。

### 1.1 なぜ表示側だけでは足りないか（現状認識）
- プロフィールは prediction horse（racebook 由来）に既に存在し、AK南関の本命/対抗/単穴では表示済み（§22）。
- **通算成績・条件別成績・直近10走は「各馬の全競走履歴」が必要**で、これは表示の問題ではなく**データ供給の問題**。
- 南関の現行 `recentHorseHistories` は racebook `pastRaces`（**1頭3〜4走**）+ results 由来で、**最大5走 cap**（`MAX_RECENT_RACES=5`）。
  全履歴・`totalRuns` を持たないため、**通算/条件別/直近10走は構造的に算出できない**。
- → JRA 同等を出すには、**南関でも全競走履歴を取得・保存する新パイプライン**が要る（本契約の対象）。

---

## 2. recentHorseHistories との責務分離（厳守）

| 区分 | 既存 `nankan/recentHorseHistories/` | 新設予定 `nankan/horseHistories/` |
|---|---|---|
| 役割 | **最大5走の過去走表示用** | **全履歴 / 詳細表示用**（通算/条件別/直近10走） |
| 履歴量 | 最大5走（`MAX_RECENT_RACES=5`） | 全競走履歴（`totalRuns` 分） |
| 生成 | `scripts/enrich-recent-horse-histories.mjs`（racebook+results 由来） | **未定**（取得元確定後に新規。本契約では作らない） |
| validator | `scripts/validate-recent-horse-histories.mjs` | 別途（本契約では作らない） |
| dispatch | `scripts/dispatch-recent-horse-histories-nankan.mjs`（event=`recent-horse-histories-nankan-updated`） | 別途（本契約では作らない） |
| AK/KI ローダー | `loadRecentHorseHistoriesNankan` / `injectRecentHorseHistoriesNankan` / `getDisplayRecentRacesForNankan` | 別途（JRA `loadHorseHistoriesJra` 相当を踏襲予定） |
| 表示注入フィールド | `recentRacesFromHistoriesNankan` | 別フィールド（例 `historyForDetailsNankan` 等。recentRaces 系と混同しない） |

**分離原則**:
- **両者を混同しない**（別ディレクトリ・別契約・別 generator/validator/dispatch・別ローダー・別注入フィールド）。
- **既存 `recentHorseHistories` の generator / validator / dispatch / whitelist（22項目）を壊さない**。
- 既存の **5走表示（Phase A 完了済）・included_files（KI PR #31 反映済）・byte一致 dispatch 運用**に影響を与えない。

---

## 3. JRA horseHistories の参照モデル（踏襲対象）

JRA は shared に以下を保存している（`jra/horseHistories/YYYY/MM/YYYY-MM-DD-{CODE}.json`）。

### 3.1 top-level
`source` / `generatedAt` / `date` / `venue` / `venueCode` / `sourceR1Url` / `stats` / `horses` / `failures`

### 3.2 horse 単位
- `horseId`
- `horseName`
- `sourceUrl`
- `totalRuns`
- `recent5[]`（直近5走サマリー）
- `history[]`（全競走履歴）

### 3.3 history[] / recent5[] 要素の主項目
`date` / `venue` / `raceName` / `surface` / `distanceMeters` / `displayDistance` / `trackCondition` /
`entryCount` / `popularity` / `finish` / `jockey` / `carryWeight` / `bodyWeight` / `time` / `winnerName` / `source`

### 3.4 集計は保存しない（重要な責務設計）
- shared は **生の `history[]` + `totalRuns`** のみ保存する。
- **通算成績・条件別成績は保存せず、AK/KI が表示時に `history[]` から集計**する（実測確認済）。
  - 通算: `history[].finish`（数値）を `==1 / ==2 / ==3` で集計 → 勝率/連対率/3着内率。
  - 条件別: `surface('芝'/'ダ')` / `distanceMeters(±200m)` / `venue` でフィルタ集計。
  - 直近10走: `history.slice(0,10)` を表示（10超は「他N走あり」）。
- プロフィール（性齢/父/騎手/斤量/調教師）は **prediction horse 由来**で、horseHistories には**含めない**。
- AK ローダー `lib/loadHorseHistoriesJra.js` は `horse.historyForDetails`(最大20) / `horse.recentRacesFromHistories`(最大5) に注入。
  **南関版もこの集計境界を踏襲**し、AK/KI 既存集計ロジックを最大流用する。

### 3.5 取得（参照）
- JRA は `scripts/jra/auto-fetch-horse-histories.mjs` が **JRA公式 `accessU.html`（馬詳細ページ）の「出走レース」テーブル＝全履歴**を取得（fetch間隔 2500ms）。
- **このスクリプトは南関で改変・流用実行しない**（参照モデルとしてのみ扱う）。南関の取得元は §6 で別途確定する。

---

## 4. 南関で目指す保存パス案

```
nankan/horseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json
```

例:
- `nankan/horseHistories/2026/06/2026-06-11-OOI.json`
- `nankan/horseHistories/2026/05/2026-05-29-URA.json`

- 命名は既存 racebook / results / computer / recentHorseHistories と同一（`YYYY-MM-DD-{3文字VENUEコード}.json`）。
- **`recentHorseHistories/` とは別ディレクトリ**（§2）。VENUE は OOI / FUN / KAW / URA。

---

## 5. 南関 horseHistories v0 スキーマ案

JRA（§3）と AK/KI の既存集計ロジックを**最大限流用**できるよう、**history[] の生データ中心**にする。
**通算成績・条件別成績は保存しない**（JRA と同じく表示側で `history[]` から集計）。

### 5.1 top-level 案
```jsonc
{
  "schemaVersion": "nankan-horse-histories-v0",
  "category": "nankan",
  "date": "2026-06-11",          // この開催日（過去走の日付ではない）
  "venue": "OOI",                // 3文字コード
  "venueName": "大井",
  "source": {
    "base": "<取得元・§6で確定>",  // 取得元未確定のため v0 では placeholder
    "generatedAt": "...",
    "generator": "<未定・取得元確定後>"
  },
  "stats": { /* 生成統計（任意）。集計成績ではない */ },
  "horses": [ /* §5.2 */ ],
  "failures": [ /* 取得失敗の記録（任意） */ ]
}
```

### 5.2 horse 単位 案（JRA踏襲）
```jsonc
{
  "horseId": "<南関の馬ID。取得元依存・無ければ null+フラグ>",
  "horseName": "...",
  "horseNumber": 1,              // 今回出走の馬番（join用。JRAには無いが南関は馬番join前提）
  "sourceUrl": "<取得元の馬ページURL。無ければ null>",
  "totalRuns": 0,                // 全履歴件数
  "recent5": [ /* §5.3 要素・直近5走 */ ],
  "history": [ /* §5.3 要素・全履歴 */ ]
}
```

### 5.3 history[] / recent5[] 要素 案（JRA §3.3 と同名・同義を優先）
| フィールド | 必須度 | 用途 | 備考（南関固有） |
|---|---|---|---|
| `date` | 必須 | 当日除外・日付表示・年補完 | **年補完が要る**（南関 racebook の "場名 M.D" は年なし。[recentHorseHistories §6] の年推定知見を流用） |
| `venue` | 必須 | 同会場成績・表示 | 表示名 "大井" |
| `venueCode` | 推奨 | 正規化・join | OOI/FUN/KAW/URA or null（南関外） |
| `raceName` | 推奨 | 競走成績表示 | |
| `surface` | 必須 | 条件別（芝/ダ） | 南関はダート主。"芝"/"ダ" 表記を JRA に揃える |
| `distanceMeters` | 必須 | 条件別（±200m） | 数値 |
| `displayDistance` | 推奨 | 表示 | "ダ1400" |
| `trackCondition` | 任意 | 表示 | 良/稍重/重/不良 |
| `entryCount` | 任意 | 表示 | 出走頭数 |
| `popularity` | 推奨 | 表示 | |
| `finish` | 必須 | 通算/条件別集計・表示 | 数値。非数値状態（中止等）は `finishStatus` で別持ち候補 |
| `jockey` | 推奨 | 表示 | |
| `carryWeight` | 任意 | 表示 | 斤量 |
| `bodyWeight` | 推奨 | 表示 | 馬体重 |
| `time` | 推奨 | 表示 | 表記正規化（"1.24.9"↔"1:24.9"）要 |
| `winnerName` | 推奨 | 表示 | 勝ち馬。南関 racebook の winner は6文字切れの可能性（[recentHorseHistories §9.1 B]）→ 取得元次第 |
| `source` | 必須 | 来歴 | 取得元・突合状態 |

### 5.4 データ品質（流用方針）
- recentHorseHistories で確立した **年推定（同月日=前年）・results突合・`RESULT_MISMATCH` 除外・dataQualityFlags** の知見を、**全履歴前提で再設計**する。
- ただし**本契約 v0 では実装しない**。取得元（§6）が確定し、生データの実形が分かってから validator/generator を設計する。
- **AK/KI に内部キーを漏らさない whitelist 方針**（[recentHorseHistories §21.5/21.6]）を踏襲し、horseHistories 版の表示 whitelist を別途定義する。

---

## 6. 取得元候補と制約（**最重要・未解決**）

JRA同等の全履歴を南関で得る取得元を確定するまで、**generator/スクレイプは作らない**。

| 取得元 | 状態 | 制約・所見 |
|---|---|---|
| **keiba.go.jp**（地方競馬全国協会/NAR 公式） | **自動取得対象にしない** | robots.txt で非Googlebot `Crawl-delay: 10`、`/KeibaWeb/`・`/KeibaWebSP/` の DataRoom / DataDownload / TodayRaceInfo 等**動的データページを Disallow**。馬の競走成績はこの動的ページ群に属する公算大。本プロジェクト契約（[recentHorseHistories §12]）でも「keiba.go.jp の robots Disallow パスを自動取得しない」と明記済。**不可方針を維持**。 |
| **nankankeiba.com**（南関4場 公式） | **規約要確認**（robots不在だけで許可と判断しない） | robots.txt が **404**。だが**「robots が無い＝許可」ではない**。**利用規約（Terms）・著作権・取得負荷・アクセス間隔**を別途精査するまで取得しない。馬ページ/出走表に過去成績・通算が載る可能性はあるが未確認。 |
| **既存 `entries` ソース** | **復活可否を候補として残す** | [recentHorseHistories §5] の `entries` は理想スキーマに近かったが **2026/03〜04 で停止**。再稼働できれば外部スクレイプ無しで履歴を厚くできる候補。停止原因・再稼働可否は未調査。 |
| **その他（results 蓄積からの自前集約）** | 候補 | `nankan/results`（2026のみ）を date 横断で集約すれば部分的な履歴を自前構築できる可能性。ただし 2025以前・南関外は欠落（[recentHorseHistories §5/§6]）。母数不足リスク。 |

### 6.1 取得元確定の前提条件（PR-D1 で確認）
- robots.txt / 利用規約 / 著作権表記 / アクセス間隔（礼儀的 delay）/ 取得負荷 を**取得元ごとに精査**する。
- **robots.txt 不在は許可ではない**。規約・法務観点で「取得してよい」と確認できた取得元のみ採用。
- 確認結果は PR-D1（read-only 調査記録）に docs 化する。**この段階でも実取得・スクレイプはしない**。

---

## 7. 段階分割（PR ロードマップ）

| PR | 内容 | 取得・実装 | 対象 |
|---|---|---|---|
| **PR-D0** | **docs 契約ドラフト（本書）** | なし | admin docs |
| PR-D1 | 取得元可否の **read-only 調査記録**（robots/規約/著作権/負荷/間隔・取得元ごと） | **実取得なし** | admin docs |
| PR-D2 | dry-run 設計（取得元確定後・取得項目→スキーマ写像・年補完/突合方針） | なし | admin docs |
| PR-D3 | 取得スクリプト **dry-run**（**保存なし**・件数/欠損レポートのみ） | 取得は許可済み取得元のみ・push/PUTなし | admin scripts（新規） |
| PR-D4 | local JSON 出力（tmp/・shared保存なし） | 取得あり・**shared PUTなし** | admin scripts |
| PR-D5 | shared 保存（`nankan/horseHistories/`・二段確認 PUT） | shared PUTあり | admin → shared |
| PR-D6 | AK 表示接続（JRA `historyForDetails` 相当を南関に） | — | analytics-keiba 単独 |
| PR-D7 | KI 表示接続（同上） | — | keiba-intelligence 単独 |

- **PR-D3 以降は取得元が §6.1 で「取得してよい」と確定してから**着手する。確定前は PR-D0〜D2（docs）に留める。
- AK（PR-D6）/ KI（PR-D7）は**別 repo・別 PR**。片寄せ共通化しない（[recentHorseHistories §21.7] と同方針）。

---

## 8. 禁止事項

- `featureScores` / `generateAdvancedMetrics` に**接続しない**。
- AI指数 に**接続しない**。
- 印・買い目 に**接続しない**。
- 穴馬抽出ロジック に**接続しない** / `dark-horse.mjs` に**触らない**。
- JRA `horseHistories`（取得スクリプト・ローダー・保存データ）を**壊さない／改変しない**（参照のみ）。
- 既存 `nankan/recentHorseHistories/` を**上書きしない**（別ディレクトリ・別契約）。
- `horse.recentRaces` を**上書きしない**。
- **AK/KI 片側だけで独自集計・独自取得しない**（admin/shared 中心。集計は表示側だが、生履歴の正本化は admin/shared）。
- **shared JSON 手編集禁止**（GitHub Web UI 手動追加も不採用）。
- **取得元未確定のままスクレイプ実装しない**（§6.1 の確認前に PR-D3 以降へ進まない）。
- keiba.go.jp の robots Disallow パスを**自動取得しない**。
- 通算成績・条件別成績を **shared に保存しない**（表示側集計を維持）。

---

## 9. 回帰確認項目（各 PR で確認）

- JRA `horseHistories`（生成/保存/表示）が**不変**。
- 南関 `recentHorseHistories` の **5走表示が不変**（generator/validator/dispatch/whitelist/included_files 含む）。
- `featureScores` / `generateAdvancedMetrics` が**不変**。
- AI指数 / 印 / 買い目 / 穴馬抽出 が**不変**。
- `horse.recentRaces` が**不変**。
- AK / KI 表示が**未変更**（PR-D6/D7 まで）。
- 本書 PR-D0 は **docs-only**（実装ファイル / scripts / shared データ / AK / KI に変更なし）。

---

## 10. 次の一手（PR-D0 完了後）

- **PR-D1（取得元可否の read-only 調査記録）**へ進む。nankankeiba.com の利用規約・著作権・取得間隔、`entries` 停止原因・再稼働可否、results 自前集約の母数を**読み取り調査**し docs 化する。**実取得・スクレイプは行わない**。
- 取得元が「取得してよい」と確定するまでは PR-D2（dry-run 設計）止まりとし、PR-D3 以降には進まない。

---

## 11. 更新履歴

- 2026-06-10: 初版作成（PR-D0）。南関版 horseHistories 詳細データの取得・保存契約 v0 ドラフト。目的（プロフィール/通算/条件別/直近10走）、recentHorseHistories との責務分離、JRA 参照モデル（生 history[] 保存・集計は表示側）、保存パス案 `nankan/horseHistories/`、v0 スキーマ案、取得元候補と制約（keiba.go.jp 不可方針 / nankankeiba.com 規約要確認 / entries 復活候補 / results 自前集約候補）、段階分割（PR-D0〜D7）、禁止事項、回帰確認を記録。**docs-only・取得なし・スクレイプなし・実装なし**。
