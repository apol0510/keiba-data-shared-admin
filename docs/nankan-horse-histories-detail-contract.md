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
| **nankankeiba.com**（南関4場 公式） | **利用条件・運用方針を確認しながら進める**（robots不在だけで許可と判断しない） | robots.txt が **404**。**「robots が無い＝許可」ではない**ため、外部サイト由来データの扱いには注意する。**利用規約（Terms）・著作権・取得負荷・アクセス間隔**を確認しながら、小規模・低負荷・停止可能な設計で進める。馬ページ/出走表に過去成績・通算が載る可能性はあるが未確認。なお **entries 相当の出馬表データ供給は「自動取得 first / 手作業 fallback」で別途進める**（[nankan-horse-detail-display-plan.md §27]）。本表が扱う**全履歴 `history[]`（uma_info 由来）は当面スコープ外**。 |
| **既存 `entries` ソース** | **復活可否を候補として残す** | [recentHorseHistories §5] の `entries` は理想スキーマに近かったが **2026/03〜04 で停止**。再稼働できれば外部スクレイプ無しで履歴を厚くできる候補。停止原因・再稼働可否は未調査。 |
| **その他（results 蓄積からの自前集約）** | 候補 | `nankan/results`（2026のみ）を date 横断で集約すれば部分的な履歴を自前構築できる可能性。ただし 2025以前・南関外は欠落（[recentHorseHistories §5/§6]）。母数不足リスク。 |

### 6.1 取得元確定の前提条件（PR-D1 で確認）
- robots.txt / 利用規約 / 著作権表記 / アクセス間隔（礼儀的 delay）/ 取得負荷 を**取得元ごとに確認しながら進める**。
- **robots.txt 不在は許可ではない**。外部サイト由来データの扱いには注意し、小規模・低負荷・停止可能な設計で進める。
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

## 12. PR-D1: 取得元可否 read-only 調査結果 (2026-06-10)

§6 の取得元候補について read-only 調査（shared 既存データの精査＋公式サイトの公開ページ最小確認のみ）を実施した記録。
**実取得・スクレイプ・generator/dry-run スクリプト作成・shared 変更・AK/KI 変更は一切行っていない。**

### 12.1 取得元候補 分類（結論・2026-06-11 全履歴目的で再整理）

> **重要な再整理（§12.9）**: 本契約の目的は JRA horseHistories と同じく **全履歴 `history[]` が基本**。
> その観点で取得元を見直した結果、**`nankan/entries`（出馬表）は全履歴の正本にならない**（`recentRaces` 最大5走のため）。
> 全履歴の正本候補は **馬単体ページ系（nankankeiba.com `uma_info`）** に切り替える。下表はこの再整理を反映する。

| # | 取得元 | 全履歴 history[] | 分類 | 要点 |
|---|---|---|---|---|
| **A** | **`nankan/entries`（出馬表）** | **✕（最大5走）** | **補完源（全履歴の正本ではない）** | profile / `record`（通算+左右/場/距離別）/ `recentRaces` 最大5走を持つ。出自判明（`entries-manager.astro`＋`save-entries.mjs`・手作業コピペ）。§12.2 参照。**全履歴は作れない** |
| **B** | **nankankeiba.com `uma_info`（馬単体ページ）** | **○（全履歴+通算+条件別）** | **全履歴の現実的な本命候補・要確認** | 馬単体ページにデビューからの全出走履歴＋通算＋条件別が揃う（§12.9.2）。**規約クリア＋馬ID対応が前提**。robots不在を許可扱いしない |
| **C** | **keiba.go.jp `HorseMarkInfo`（DataRoom）** | ○（全履歴に近い） | **不可（自動取得対象外を維持）** | 全履歴一覧を持つが URL は `/KeibaWeb/DataRoom/` ＝ **robots Disallow に該当**（§12.9.3 で再確認）。方針・robots 両面で不可 |
| **D** | **shared results/archive 自前集約** | △（母数不足） | **母数不足で正本不可** | 2026のみ・南関外/2025以前欠落。補助どまり |

### 12.2 A: `nankan/entries`（最有力・出自判明）

shared `nankan/entries/` に、**JRA 詳細表示にほぼ十分なデータ**が既に存在することを確認した。

- **`record` が通算成績＋条件別成績を構造化済**:
  `total` / `left`(左回り) / `right`(右回り) / `venue`(同場) / `distance`(同距離) × `{wins, seconds, thirds, unplaced}`。
  → 勝率/連対率/3着内率、左右・場・距離別成績が**そのまま算出可能**。
- **profile が豊富**: `sire`(父) / `bms`(母父) / `owner`(馬主) / `breeder`(生産者) / `coat`(毛色) / `gender` / `age` /
  `weight` / `jockey` / `trainer` ＋各 affiliation / `bestTime`。
- **`recentRaces` も保持**（5走・リッチ: order/finish/date/trackCondition/headCount/venue/distance/popularity/
  bodyWeight/jockey/time/passingOrder/last3f/margin/opponentName）。
- **ただし 2026-04-07 で停止**（全 7 ファイル・2026-03-30〜04-07・FUN/KAW のみ）。

#### 12.2.1 出自の特定（2026-06-11 訂正・PR-D1 追補）

> **訂正**: PR-D1 初稿（§12.2 旧記述）の「生成元コードが現環境に無く出自不明／外部ツール・別環境で生成」は**誤り**。
> 追加の read-only 調査で出自が**判明**したため訂正する。

- **生成元は admin repo 内に現存**: `src/pages/admin/entries-manager.astro`（入力UI・1,631行）＋
  `netlify/functions/save-entries.mjs`（保存 Function）。**外部ツールではない／コードは喪失していない**。
- **生成方法は「手作業コピペ＋ブラウザ内パース」**: `entries-manager.astro` は
  **地方競馬公式・南関競馬公式・中央競馬公式の出走表テキストを textarea に手作業で貼り付け → クライアント側パーサ
  （南関/地方 `parseOneRace/parseHorses/parseOneHorse/parseRecentRaces`、JRA `*JRA`）で自動解析**し、
  record / owner / breeder / bms / recentRaces 等を抽出する。
- **自動スクレイプではない**: `entries-manager.astro` に外部データ取得 `fetch` は無く（唯一の通信は保存API
  `/.netlify/functions/save-entries`）、**nankankeiba.com からの自動取得でもない**。`save-entries.mjs` は
  受け取った `data` を `{category}/entries/YYYY/MM/` に保存するだけで、取得・スクレイプは一切しない。
- **ID/URL 非保持の理由**: 表示テキストの転記パースのため、JSON に `sourceUrl` / `horseId` / `raceId` /
  `syousai ID` が残らない（§12.5 で確認した「ID/URL 非保持」と整合）。
- **停止理由**: コード喪失ではなく、**2026-04-07 以降に手作業コピペ運用をしていないだけ**。
- **commit 痕跡**: 全 entries commit は author=apol0510・「🤖 Generated with Claude Code」署名・
  メッセージ `📋 出走表データ追加: {会場} {N}レース {日付}`。手動 UI 操作と整合（GitHub Actions/cron による自動生成なし）。

#### 12.2.2 外部サイト由来テキストの扱い（運用上の注意）

- entries は **公式表示テキストの転記・保存・再利用**であるため、**手作業運用でも外部サイト由来テキストの
  扱いには注意する**（保存・表示・再利用の扱いは必要に応じて確認）。
- これは entries 運用を止める理由ではなく、**運用上の注意**として整理する。

#### 12.2.3 供給方針（自動取得 first / 手作業 fallback）

- entries の供給は **自動取得 first / 手作業 fallback** の両対応で進める（[nankan-horse-detail-display-plan.md §27]）。
- **手作業コピペ運用（`entries-manager.astro` 現存）は fallback として維持する**。自動取得に問題が出たら手作業へ戻せる。
- **自動取得は、出馬表ページ系を対象に、小規模・低負荷・停止可能な設計で進める**（保存なし dry-run first・初回1会場単位／設計は1日複数会場対応・§27.3）。
  uma_info の全履歴取得・keiba.go.jp DataRoom 取得には進まない。
- 自動取得でも手作業でも **出力 JSON schema は同一**にし、保存先 `nankan/entries/...` も同一にする。AK/KI は取得方法を意識しない。

### 12.3 B: nankankeiba.com 直接取得（技術的可能・採用は要確認）

公開トップ／総合案内ページの**最小確認のみ**（データページのスクレイプはしていない）で次を確認:

- **馬データ詳細ページが実在**: データバンク `/uma_search/search.do`・`/uma_detail_search/search.do`、
  出馬表 `/syousai/{id}.do`、過去競走検索 `/race_detail_search/search.do`。
- **著作権表記 "copyright(C)nankankeiba.com all rights reserved." が明示**。
- **robots.txt は 404**（不在）。利用規約は `/info/` 配下に存在するが、転載・複製・データ利用・自動取得・商用利用の
  可否の**明示文言は未抽出**（規約本文の精査が未了）。
- **判断**: **robots.txt 不在を「許可」と扱わない**。著作権・利用規約・取得負荷（礼儀的アクセス間隔）を確認しながら、
  外部サイト由来データの扱いには注意し、小規模・低負荷・停止可能な設計で進める。
  - **entries 相当の出馬表ページ系**（`/syousai/` 等）は、**「自動取得 first / 手作業 fallback」の自動取得対象**になりうる
    （[nankan-horse-detail-display-plan.md §27]・保存なし dry-run first・初回1会場単位／設計は1日複数会場対応・venue ごとに1JSON）。
  - 一方、**馬単体ページ `uma_info` の全履歴 `history[]` 取得には進まない**（当面スコープ外・§12.10）。

### 12.4 C: keiba.go.jp（不可・方針維持）

robots.txt で非 Googlebot に `Crawl-delay: 10`、`/KeibaWeb/`・`/KeibaWebSP/` の DataRoom / DataDownload /
TodayRaceInfo 等の動的データページを **Disallow**。馬の競走成績はこの動的ページ群に属する公算が大。
契約 §12（[nankan-recent-horse-histories-contract.md]）の「keiba.go.jp の robots Disallow パスを自動取得しない」を維持。
→ **自動取得対象外**。

### 12.5 D: shared results/archive 自前集約（母数不足）

- `nankan/results/`（2026 のみ）＋ `nankan/archive/archiveResults.json`（集約 1 ファイル）を date 横断集約すれば、
  各馬の 2026 内出走を時系列に再構成は可能。
- だが **2025 以前・南関外・取消等で母数が欠落**し、**生涯通算成績の正確性を担保できない**。直近10走も2026開始以降に出走が偏る馬で不足。
- → **単独の正本にはできない**（補助どまり）。

### 12.6 スキーマ判断事項（PR-D2 以降で確定）

南関 horseHistories の保存形を二択として残す（§5.4 の延長）:
- **(a) JRA 式**: 生 `history[]` を保存し、通算/条件別は**表示側集計**（AK/KI 既存ロジック流用）。ただし全履歴の取得元が要る。
- **(b) entries 式**: 集約済 `record`（通算+左右/場/距離別）を保存。直接的だが JRA 表示集計と形が異なり、条件別カテゴリも
  JRA(芝/ダ) と entries(左右/場/距離) で差がある（南関はダート主で芝/ダ分割は実質不要）。
- どちらを採るかは **取得元確定後（PR-D2 以降）に判断**。本 PR では確定しない。

### 12.7 PR-D2 へ進む条件（前提を訂正・2026-06-11）

> **訂正**: §12.2.1 で entries の出自が判明したため、PR-D2 進行条件を「entries 生成元の再確認（出自不明前提）」から
> 「**どちらの運用方針を採るかの決定**」へ更新する。

> **再訂正（2026-06-11・§12.9）**: 目的は**全履歴 `history[]`**。entries は全履歴を持たない（補完源）ため、
> PR-D2 進行条件を「全履歴の本命候補＝**nankankeiba.com `uma_info`** のクリアランス＋**馬ID対応方式の決定**」へ更新する。

> **再々訂正（2026-06-11・§27 / §12.10.9）**: entries 供給は **自動取得 first / 手作業 fallback** 方針へ更新。
> PR-D2（uma_info 全履歴の取得部分）は **自動取得 first / 手作業 fallback 方針で再設計**する（最新条件は §12.10.9）。

PR-D2（dry-run 設計）の**取得部分**に進むには、次を**確認・整理**する:
1. **nankankeiba.com `uma_info`（馬単体ページ）の利用条件・取得負荷・アクセス間隔の確認**
   （著作権 "all rights reserved" 明示・robots.txt 不在を許可扱いしない。利用規約本文の精査と外部データ利用方針の確認・礼儀的 delay の設計）。
2. **馬ID→URL の対応付け方式の決定**（§12.9.4）。entries には `horseId` / `uma_info` ID が無いため、
   馬名検索・出馬表リンク・その他の安全な対応付け方法を設計する。
3. **entries を全履歴の正本にしない**こと（entries は profile / record / recent5 の補完源に留める）。

- 現状はいずれも**未整理**。C（keiba.go.jp `HorseMarkInfo`）は robots Disallow で**対象外**、D（自前集約）は母数不足で正本にできない。
- → **上記が決まるまで generator / dry-run スクリプトには進まない**。進めてよいのは docs 設計
  （スキーマ二択 a/b の検討・§12.6、馬ID対応方式の設計検討）まで。
  **手作業 UI（entries-manager.astro / save-entries.mjs）の改変もしない**。

### 12.8 本 PR（PR-D1）で実施していないこと
- 実取得 / スクレイプ / generator 作成 / dry-run スクリプト作成 / scripts 変更 / shared データ変更 / AK・KI 変更はなし。
- featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目 / 穴馬抽出 / `dark-horse.mjs` 非接触。
- JRA `horseHistories` 非変更。`nankan/recentHorseHistories`（5走）非変更。`nankan/entries`（既存 shared データ）非変更（read-only 参照のみ）。

---

## 12.9 全履歴 history[] の取得元 再整理 (2026-06-11・PR-D1 追補2)

追加の read-only 調査（馬単体ページ 1 件の最小確認＋ keiba.go.jp robots.txt 再確認のみ）を踏まえ、
**「全履歴 `history[]` を基本とする」観点で取得元を再整理**する。
**実取得・スクレイプ・自動巡回・generator/dry-run 作成は一切行っていない。**

### 12.9.1 大前提：目的は全履歴 history[]
- 本契約の目的は「直近10走」ではなく、**JRA horseHistories と同じく全履歴 `history[]` が基本**。
- 通算成績・条件別成績は、JRA 式なら全履歴 `history[]` から表示側で集計する（§3.4）。
  全履歴があれば「直近10走」も「通算」も「条件別」も派生できる。

### 12.9.2 entries（出馬表 / entries-manager）は全履歴の正本にならない
- entries は **profile / `record`（通算+左右/場/距離別）/ `recentRaces` 最大5走**を持つ（§12.2）。
- だが **`recentRaces` は最大5走**（出馬表＝直近数走表示が原本）であり、**全履歴 `history[]` は作れない**。
- → entries は **全履歴の正本ではなく、profile / record / recent5 の補完源**として位置づける。
  全履歴の正本は**馬単体ページ系**に切り替える。

### 12.9.3 全履歴の正本候補（馬単体ページ系）

**(本命) nankankeiba.com `uma_info`（馬単体ページ）— 例 `/uma_info/{id}.do`**
- **馬単体ページ 1 件の最小確認**で、次が揃うことを確認した（スクレイプはしていない）:
  - **戦績（通算成績）**: 出走/勝利/連対/3着内 ＋ 勝率/連対率/3着内率 ＋ 総賞金。
  - **条件別実績**: 競馬場別 / 距離別 / 馬場別 / 月別 / 順位別。
  - **出走履歴（出走成績）**: **デビューからの全履歴（40件以上）** ＝ JRA `history[]` 相当。
    各行＝年月日 / 競馬場 / R / 競走名 / 距離 / 馬場 / 頭数 / 着順 / タイム / 着差 / 上り3F / 馬体重 / 騎手 / 斤量。
  - 血統 / 生年月日 / 性別 / 馬ID（URL の `{id}`）。
- → **全履歴・通算・条件別を 1 ページで満たす現実的な本命候補**。
- **ただし運用上の前提**:
  - **robots.txt 不在（404）を「許可」と扱わない**。外部サイト由来データの扱いには注意する。
  - 著作権 "copyright(C)nankankeiba.com all rights reserved." が明示。
  - **利用規約・著作権・取得負荷・アクセス間隔（礼儀的 delay）は確認しながら進める**。
  - **全履歴 `history[]`（uma_info 由来）は当面スコープ外**。今回の「自動取得 first」の対象は entries 相当の出馬表データであり、uma_info 全履歴取得には進まない（§12.10）。

**(不可) keiba.go.jp `HorseMarkInfo`（DataRoom）— 例 `/KeibaWeb/DataRoom/HorseMarkInfo?...`**
- 項目的には全履歴一覧（年月日/競馬場/R/競走名/格組/距離/天候馬場/頭数/枠/馬番/人気/着順/タイム/差/上3F/体重/騎手/重量/調教師/収得賞金/1着馬or2着馬）に近く、全履歴 `history[]` を最もよく満たし得る。
- **だが URL は `/KeibaWeb/DataRoom/` 配下**。keiba.go.jp robots.txt を再確認したところ
  **`Disallow: /KeibaWeb/DataRoom/`（および `/KeibaWebSP/DataRoom/`）が明示**（非 Googlebot は `Crawl-delay: 10`）。
- → **robots Disallow に該当。契約 §12（[nankan-recent-horse-histories-contract.md] §12）の方針どおり自動取得対象外を維持**（本体ページは fetch していない）。

### 12.9.4 馬ID→URL の対応付けが必要（設計課題）
- `uma_info` を引くには **馬ID（URL の `{id}`）が必要**だが、**entries / 出走表テキストには `horseId` / `uma_info` ID が無い**（転記パースのため・§12.2.1）。
- → 全履歴ページに辿るには **馬ID対応方式の設計**が要る:
  - 馬名検索（`/uma_search/` 等）で馬名→ID を引く、
  - 出馬表ページ（`/syousai/`）内の馬名リンクから ID を辿る、
  - またはその他の安全な対応付け方法。
- いずれも **nankankeiba.com への追加アクセスを伴う**ため、§12.9.3 の規約クリアランスと一体で判断する。

### 12.9.5 PR-D2 へ進む条件（更新）
全履歴を扱う以上、PR-D2 の取得部分に進むには次を**すべて**満たす:
1. **nankankeiba.com `uma_info` の規約・許諾・取得負荷・アクセス間隔のクリアランス**。
2. **馬ID→URL の対応付け方式の決定**（§12.9.4）。
3. **entries を全履歴の正本にしない**（補完源に留める）。

- keiba.go.jp `HorseMarkInfo` は **robots Disallow で対象外**（候補にしない）。
- 上記が決まるまで generator / dry-run には進まない。docs 設計（スキーマ a/b・馬ID対応方式）までに留める。

### 12.9.6 本追補で実施していないこと
- nankankeiba.com `uma_info` は **1 ページの最小確認のみ**（複数ページ自動巡回・スクレイプなし）。
- keiba.go.jp `HorseMarkInfo` 本体は **未取得**（robots.txt のみ再確認）。
- generator / dry-run / scripts / shared / AK・KI / `entries-manager.astro` / `save-entries.mjs` の**変更なし**。

---

## 12.10 nankankeiba.com `uma_info` 利用規約 精査結果 (2026-06-11・PR-D1 追補3)

§12.9 で全履歴 `history[]` の本命候補とした **nankankeiba.com `uma_info`（馬単体ページ）** について、
**利用規約系ページを read-only で精査**した結果を記録する。**実取得・スクレイプ・馬詳細ページの巡回・generator/dry-run 作成は一切行っていない**（規約系ページの最小確認のみ）。

### 12.10.1 結論：利用条件・運用方針を確認しながら進める（全履歴 history[] は当面スコープ外）

- **`uma_info` は全履歴 `history[]` の技術的な本命候補**である（§12.9.3：デビューからの全出走履歴＋通算＋条件別を 1 ページで持つ）。
- **ただし利用規約精査の結果、利用条件・運用方針は確認しながら進める。** 全履歴 `history[]`（uma_info 由来）は当面スコープ外とし、今回の「自動取得 first / 手作業 fallback」（[nankan-horse-detail-display-plan.md §27]）の対象は entries 相当の出馬表データに限定する（uma_info 全履歴取得には進まない）。

### 12.10.2 精査した規約系ページ
- `/info/usage/`（**ご利用にあたって＝利用規約 本文**）
- `/info/usage/sitemap.html`（サイトマップ）／`/info/usage/izonsho.html`（依存症対策ページ・規約ではない）
- `/info/contact/`（問い合わせフォーム）
- `robots.txt`＝**404（不在）**（再確認）

### 12.10.3 規約・著作権の要点（精査結果）
- **著作権表記 `copyright(C)nankankeiba.com all rights reserved.` が明示**。
- コンテンツ（文章・画像等）の著作権その他の権利は、特別の記載がない限り**南関側が保有**。
- 規約本文に **「別に許可を頂いている場合を除き」＋「個人的・家庭的利用に限定」** の趣旨の条項あり
  → **利用範囲の解釈には確認余地がある**（複製・転載・転用・二次利用・再配布・データベース化の扱いは必要に応じて確認する）。
- ⚠️ **規約本文の取得に文字化け・解釈余地があり、可否の語尾を断定できない箇所がある**。
  **明示の許可とは判断しない**（外部サイト由来データの扱いには注意する）。利用条件・運用方針は確認しながら進める。

### 12.10.4 本件用途で確認余地がある点
本契約の用途は次を含み、**利用範囲の解釈には確認余地がある**：
- `uma_info` の**全履歴データ取得** / **shared への保存** / **`history[]` への加工**
- **AK/KI での表示** / サービス内利用 / **データベース化**
- shared（別リポジトリ）への保存・表示・再利用の扱いは、必要に応じて確認する。

### 12.10.5 自動取得・機械的アクセスの扱い
- 利用規約本文に **スクレイピング・ロボット・機械的アクセス・大量アクセス・サーバー負荷行為の明示禁止規定は見当たらない（該当記載なし）**。
- **だが明示の許可も無い**。**`robots.txt` 不在（404）も許可扱いしない**。
- → 自動取得の可否は**不明**。**「明示が無い＝許可」とは判断しない**。

### 12.10.6 利用方針の確認ポイント
- 用途にサービス内利用・shared 保存・全履歴の DB 化を含むため、**保存・表示・再利用の扱いは必要に応じて確認する**。
- 外部サイト由来データの扱いには注意する。**全履歴 `history[]` 路線は、利用条件・運用方針が固まるまで本格展開しない**（自動取得・大量取得はしない）。

### 12.10.7 問い合わせ・許諾窓口
- 問い合わせは `/info/contact/`（Webフォーム）があるが、**「ご意見・ご提案」向けで、データ利用許諾の正式窓口として十分かは不明**。
- 正式なデータ利用許諾は、**別途適切な窓口・書面での確認が必要**な可能性がある。

### 12.10.8 他候補の状況（再確認）
- **keiba.go.jp `HorseMarkInfo` は `/KeibaWeb/DataRoom/` の robots Disallow のため引き続き対象外**（§12.9.3）。
- **entries は全履歴を持たない**（最大5走）ため、**profile / record / recent5 の補完源に留める**（§12.9.2）。
- → **利用条件・運用方針が固まるまで、`uma_info` を取得元にした全履歴 `history[]` 生成は本格展開しない**（現状ほかに現実的な全履歴取得元が無い）。なお entries 相当の出馬表データ供給は、これとは別に「自動取得 first / 手作業 fallback」で進める（[nankan-horse-detail-display-plan.md §27]）。

### 12.10.9 PR-D2 進行条件（更新・自動取得 first / 手作業 fallback 方針で再設計）

**PR-D2（uma_info 全履歴の取得部分）は、自動取得 first / 手作業 fallback 方針で再設計する**。取得部分に進むには次を**確認・整理**する:
1. **nankankeiba.com `uma_info` の外部データ利用方針の確認**。
2. **サービス内利用に関する方針の確認**。
3. **shared 保存・加工・表示・DB化の扱いの確認**。
4. **取得方法に関する方針の確認**（自動取得・大量取得はしない前提）。
5. **取得負荷・アクセス間隔条件の確認**。
6. **馬ID→URL 対応方式の決定**（§12.9.4）。

- 上記が固まるまで全履歴 generator / dry-run / 取得設計には進まない。進めてよいのは docs 設計（スキーマ a/b・馬ID対応方式の机上検討）まで。
- なお **entries 相当の出馬表データ供給は、uma_info 全履歴路線とは別に「自動取得 first / 手作業 fallback」で進める**（[nankan-horse-detail-display-plan.md §27]・PR-F系）。全履歴 `history[]` 路線は、利用条件・運用方針が固まるまで本格展開しない。

### 12.10.10 本追補で実施していないこと
- `uma_info`（馬詳細ページ）の**巡回なし・取得なし・スクレイプなし**（精査は規約系ページの最小確認のみ）。
- generator / dry-run / scripts / shared / AK・KI / `entries-manager.astro` / `save-entries.mjs` の**変更なし**。
- featureScores / AI指数 / 印 / 買い目 / 穴馬抽出 / `dark-horse.mjs` 非接触。

---

## 12.11 entries record 着別5分割 補完源 調査結論（PR-F2a・2026-06-11）

entries の `record`（着別 5分割 total/left/right/venue/distance × wins/seconds/thirds/unplaced）の自動取得補完源を、出馬表系ページで read-only 調査（同一レースID `2026061020040301` 基準・各1回・低負荷）した結論を記録する。**実取得は出馬表系の最小確認のみ・保存なし・実装なし**。

- **`uma_shosai/{raceID}.do`（出馬表）**: profile + recentRaces（最大5）は**あり**。**着別 record は無い**（成績欄は平均着順/勝率で別形式）。
- **`program/{14桁}.do`（番組）**: 軽量版。record・recentRaces **無し**。
- **`result/{16桁}.do`（成績・払戻金）**: レース結果中心。着別 record **無し**（`N-N-N-N` は通過順）。
- **`repay`系**: result に内包＝別取得不要。着別 record **無し**。
- **`uma_info/{horseID}.do`（馬単体）**: 条件別の候補だが**今回スコープ外**（馬単体・全履歴方向）。取得しない。
- **keiba.go.jp DataRoom**: **対象外**。取得しない。

**結論**: 着別 record の補完源は**出馬表系に存在しない**。よって自動取得 entries では **record を optional 扱い**とし、**0埋め保存は禁止**、record 無しは「未取得」として明示する。手作業 `entries-manager` 由来は record を持つ場合があり従来どおり使用。詳細方針＝[nankan-horse-detail-display-plan.md §28]（PR-F2a）。validator の record optional 化は PR-F2b、保存メタは PR-F3、表示分岐は PR-F5。

---

## 11. 更新履歴

- 2026-06-10: 初版作成（PR-D0）。南関版 horseHistories 詳細データの取得・保存契約 v0 ドラフト。目的（プロフィール/通算/条件別/直近10走）、recentHorseHistories との責務分離、JRA 参照モデル（生 history[] 保存・集計は表示側）、保存パス案 `nankan/horseHistories/`、v0 スキーマ案、取得元候補と制約（keiba.go.jp 不可方針 / nankankeiba.com 規約要確認 / entries 復活候補 / results 自前集約候補）、段階分割（PR-D0〜D7）、禁止事項、回帰確認を記録。**docs-only・取得なし・スクレイプなし・実装なし**。
- 2026-06-10: **PR-D1 取得元可否 read-only 調査結果を追記（§12）**。取得元4分類（A: nankan/entries 復活＝要確認・最有力 / B: nankankeiba.com 直接＝技術的可能だが採用要確認 / C: keiba.go.jp＝不可方針維持 / D: results・archive 自前集約＝母数不足で正本不可）。entries は `record`（通算+左右/場/距離別を構造化済）・profile（父/母父/馬主/生産者/毛色等）・recentRaces 5走を持つ最有力候補だが、**2026-04-07 で停止し生成元コードが現環境に無く出自不明**＝再稼働可否未確定。nankankeiba.com は馬データページ（uma_search/syousai/race_detail_search）実在・著作権 "all rights reserved" 明示・robots.txt 404 だが**不在を許可扱いしない**・規約本文未精査。スキーマ二択（(a)JRA式 生history保存・表示側集計／(b)entries式 集約record保存）は PR-D2 以降で判断。**PR-D2 進行条件＝entries生成元の再確認 or nankankeiba.com 規約・許諾・負荷クリアランス（現状いずれも未充足）**。取得元確定まで generator/dry-run に進まない。**docs-only・実取得なし・スクレイプなし・generator/dry-run作成なし。shared/AK/KI/scripts 不変更**。
- 2026-06-11: **PR-D1 追補：entries の出自を訂正（§12.1 A 行 / §12.2 → §12.2.1〜12.2.3 / §12.7）**。追加 read-only 調査により、PR-D1 初稿の「生成元コードが現環境に無く出自不明／外部ツール・別環境で生成」は**誤りと判明したため訂正**。entries の生成元は admin repo 内に**現存**する `src/pages/admin/entries-manager.astro`（入力UI）＋ `netlify/functions/save-entries.mjs`（保存Function）で、**公式（地方/南関/中央）出走表テキストの手作業コピペ＋ブラウザ内パース由来**（外部 fetch なし・自動スクレイプではない・nankankeiba.com からの自動取得でもない）。ID/URL 非保持は転記パースのため。停止理由はコード喪失ではなく 2026-04-07 以降に手作業運用をしていないだけ。ただし**公式表示の転記・保存・再利用は手作業運用でも外部サイト由来テキストの扱いには注意する**（運用を止める理由ではなく運用上の注意）。再稼働は技術的に可能で手作業コピペ運用として小さく再開できる。JRA auto-fetch（日次自動）とは別物。自動化する場合は nankankeiba.com の利用条件・取得負荷を確認しながら小規模・低負荷・停止可能な設計で進める。**PR-D2 進行条件を「entries供給の方針決定」へ更新**（後続 PR-F0 で 自動取得 first / 手作業 fallback へ確定）。**docs-only・1ファイル・entries-manager.astro / save-entries.mjs は不変更・実取得/スクレイプ/generator/dry-run なし**。
- 2026-06-11: **PR-D1 追補2：全履歴 history[] の取得元を再整理（§12.1 分類表 / §12.7 / 新設 §12.9）**。目的が「直近10走」ではなく **JRA 同様の全履歴 `history[]` が基本**である点を明確化。**entries（出馬表）は `recentRaces` 最大5走で全履歴を作れない → 全履歴の正本ではなく profile/record/recent5 の補完源**へ位置づけ変更。**全履歴の正本候補を馬単体ページ系へ切替**：本命＝**nankankeiba.com `uma_info`（馬単体ページ）**＝デビューからの全出走履歴（40件以上）＋通算＋条件別を 1 ページで持つ（馬単体ページ 1 件の最小確認で確認）。ただし **robots.txt 不在を許可扱いしない**・著作権 "all rights reserved" 明示・**利用規約/取得負荷/アクセス間隔の確認が必要**。**keiba.go.jp `HorseMarkInfo` は全履歴に近いが URL が `/KeibaWeb/DataRoom/` ＝ robots Disallow（再確認済）で自動取得対象外を維持**。**馬ID→URL 対応付けが必要**（entries に horseId/uma_info ID 無し→馬名検索/出馬表リンク等の設計要）。**PR-D2 進行条件を「nankankeiba.com uma_info の規約・許諾・取得負荷クリアランス＋馬ID対応方式の決定＋entriesを全履歴正本にしない」へ更新**。**docs-only・1ファイル。uma_info は1ページ最小確認のみ・HorseMarkInfo本体は未取得・スクレイプ/generator/dry-run/scripts/shared/AK/KI/entries-manager.astro/save-entries.mjs 変更なし**。
- 2026-06-11: **PR-D1 追補3：nankankeiba.com `uma_info` 利用規約 精査結果を追記（新設 §12.10）**。規約系ページ（`/info/usage/` 本文・sitemap・izonsho・`/info/contact/`・robots.txt=404）を read-only で精査。**利用条件は未確定（現時点では採用未決定）**と整理。著作権 `all rights reserved` 明示・権利は南関側保有・**「個人的/家庭的利用に限定」＋「別に許可を頂いている場合を除き」**＝利用範囲の解釈には確認余地がある。本件用途（全履歴取得・shared保存・history[]加工・AK/KI表示・サービス内利用・DB化）は、保存・表示・再利用の扱いを必要に応じて確認する。**自動取得・機械的アクセスの明示禁止は規約本文に無いが明示許可も無く、robots.txt 不在も許可扱いしない**。規約本文に文字化け・解釈余地がある。問い合わせは `/info/contact/`。**keiba.go.jp HorseMarkInfo は引き続き robots Disallow で対象外／entries は全履歴を持たず補完源に留める**。**全履歴 `history[]`（uma_info 由来）は当面スコープ外**（利用条件・運用方針が固まるまで本格展開しない）。**docs-only・1ファイル。uma_info巡回/取得なし・スクレイプ/generator/dry-run/scripts/shared/AK/KI/entries-manager.astro/save-entries.mjs 変更なし**。
- 2026-06-11: **PR-F0：entries 供給方針を「自動取得 first / 手作業 fallback」へ更新し、法務断定を緩和（§6・§12.2.2/12.2.3・§12.3・§12.9.3・§12.7・§12.10）**。entries（出馬表由来データ）の最新日継続供給を、**第一候補＝自動取得・fallback＝entries-manager 手作業コピペ**の両対応とする。自動/手作業で出力 JSON schema を同一・保存先 `nankan/entries/...` 同一・AK/KI は取得方法を意識しない。**自動取得の対象は出馬表ページ系に限定**（`uma_info` の全履歴 `history[]` 取得には進まない／keiba.go.jp DataRoom 取得しない＝対象外維持）。安全設計＝保存なし dry-run first・初回1会場単位／設計は1日複数会場対応・対象URL/件数ログ・token非露出・アクセス間隔・retry過剰にしない・失敗時途中停止・schema不一致なら保存しない・featureScores/AI/印/買い目/穴馬に非接続。停止寄り表現（要許諾/規約違反リスク/不可寄り/許諾が取れない限り不可/許諾確認まで保留/手作業でも規約論点/自動取得しない）を中立・実務寄り（利用条件は未確定/外部サイト由来データの扱いには注意/現時点では採用未決定/利用条件・運用方針は確認しながら進める）へ置換。**全履歴 `history[]`（uma_info 由来）は当面スコープ外で、利用条件・運用方針が固まるまで本格展開しない**点は維持。詳細方針は [nankan-horse-detail-display-plan.md §27]。**docs-only・実装/実取得/保存なし。shared/AK/KI/workflow/scripts/entries-manager.astro/save-entries.mjs/JRA horseHistories/recentHorseHistories/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし**。本変更は未merge PR #94（断定緩和）を統合し #94 は close。
- 2026-06-11: **PR-F0a：「1日1会場」前提の誤記を補正（§12.2.3・§12.3）**。南関は **1日1〜複数場開催がある**（例 6/29 大井・船橋）ため、自動取得の安全設計を「**初回 dry-run は1会場単位／設計は1日複数会場（OOI/KAW/FUN/URA）対応**」へ補正。venue ごとに `parsedResult` を作り 1日複数 venue を1JSONに混ぜない・venue ごとに1ファイル。詳細は [nankan-horse-detail-display-plan.md §27.3]。**docs-only・実装/実取得/保存なし。shared/AK/KI/workflow/scripts/entries-manager.astro/save-entries.mjs/JRA horseHistories/recentHorseHistories/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし**。
- 2026-06-11: **PR-F2a：record 着別5分割 補完源 調査結論と record optional 方針を追記（新設 §12.11）**。出馬表系（`uma_shosai`/`program`/`result`/`repay`）を read-only 確認（同一レースID基準・各1回・低負荷）した結論＝**着別 record（total/left/right/venue/distance × wins/seconds/thirds/unplaced）はいずれにも無い**（uma_shosai は profile+recentRaces のみ・成績欄は平均着順/勝率で別形式／program 軽量版／result は通過順で着別でない）。`uma_info` は**スコープ外**・keiba.go.jp DataRoom は**対象外**で取得せず。→ 自動取得 entries は **record を optional 扱い**・**0埋め保存禁止**・record 無しは「未取得」明示。手作業 `entries-manager` 由来は record を持つ場合があり従来どおり使用。詳細方針＝[nankan-horse-detail-display-plan.md §28]（PR-F2a）。validator の record optional 化は PR-F2b・保存メタは PR-F3・表示分岐は PR-F5。**docs-only・実装/保存なし。実取得は出馬表系の最小 read-only 確認のみ。uma_info/keiba.go.jp DataRoom 非取得。shared/AK/KI/workflow/scripts/entries-manager.astro/save-entries.mjs/JRA horseHistories/recentHorseHistories/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし**。
