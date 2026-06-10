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

## 12. PR-D1: 取得元可否 read-only 調査結果 (2026-06-10)

§6 の取得元候補について read-only 調査（shared 既存データの精査＋公式サイトの公開ページ最小確認のみ）を実施した記録。
**実取得・スクレイプ・generator/dry-run スクリプト作成・shared 変更・AK/KI 変更は一切行っていない。**

### 12.1 取得元候補 4 分類（結論）

| # | 取得元 | 分類 | 要点 |
|---|---|---|---|
| **A** | **`nankan/entries` 復活** | **要確認・最有力** | データは理想的。**出自は判明**（admin の `entries-manager.astro` ＋ `save-entries.mjs`＝公式出走表テキストの手作業コピペ＋ブラウザ内パース由来）。再稼働は技術的に可能だが**手作業運用**。§12.2 参照 |
| **B** | **nankankeiba.com 直接取得** | **技術的には可能だが採用は要確認** | 馬データページ実在。著作権明示・robots不在・許諾未確認のため**現時点で取得しない** |
| **C** | **keiba.go.jp（NAR公式）** | **不可（方針維持）** | robots Disallow ＋ 契約 §12。自動取得対象外を維持 |
| **D** | **shared results/archive 自前集約** | **母数不足で正本不可** | 2026のみ・南関外/2025以前欠落。補助どまり |

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

#### 12.2.2 著作権・利用規約の論点（手作業でも残る）

- entries は **公式表示テキストの転記・保存・再利用**であるため、**著作権・利用規約・商用利用可否の論点は
  手作業コピペでも残る**（自動/手動を問わず、公式コンテンツの shared 保存・再配布の可否は確認対象）。
- **手作業だから無条件に可、とは扱わない**。

#### 12.2.3 再稼働の性質

- entries の**再稼働は技術的には可能**（UI `entries-manager.astro` は現存）。ただし **手作業コピペ運用**になる。
- **JRA `auto-fetch-horse-histories.mjs`（自動・日次）とは別物**。日次自動運用ではない。
- **自動化する場合**は、nankankeiba.com の**規約・許諾・取得負荷（礼儀的アクセス間隔）条件の確認が別途必要**
  （§12.3／§12.7）。手作業 UI を自動取得へ作り変えることは、規約クリアランス前に行わない。
- → entries は**最有力候補で、出自・再稼働手段とも判明済**。残る判断は「手作業運用を再開するか／自動化の規約クリアを取るか」（§12.7）。

### 12.3 B: nankankeiba.com 直接取得（技術的可能・採用は要確認）

公開トップ／総合案内ページの**最小確認のみ**（データページのスクレイプはしていない）で次を確認:

- **馬データ詳細ページが実在**: データバンク `/uma_search/search.do`・`/uma_detail_search/search.do`、
  出馬表 `/syousai/{id}.do`、過去競走検索 `/race_detail_search/search.do`。
- **著作権表記 "copyright(C)nankankeiba.com all rights reserved." が明示**。
- **robots.txt は 404**（不在）。利用規約は `/info/` 配下に存在するが、転載・複製・データ利用・自動取得・商用利用の
  可否の**明示文言は未抽出**（規約本文の精査が未了）。
- **判断**: **robots.txt 不在を「許可」と扱わない**。著作権・利用規約・取得負荷（礼儀的アクセス間隔）を確認し、
  **許諾が取れるまで取得しない**。entries の出自が本サイトなら、A の再稼働も実質この規約確認に帰着する。

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

PR-D2（dry-run 設計）の**取得部分**に進むには、**取得運用の方針を1つ決める**必要がある:
1. **entries 手作業コピペ運用の再開**（既存 UI `entries-manager.astro` で公式出走表テキストを貼り付け運用）。
   - 技術的には即可能だが**手作業**で、JRA のような日次自動運用ではない。
   - **公式表示の転記・保存・再利用の著作権/利用規約の論点は手作業でも残る**（§12.2.2）ため、運用継続の可否は確認する。
2. **自動取得の規約クリアランス**（nankankeiba.com の利用規約・許諾・取得負荷条件を確認し、自動取得してよいと確定）。
   - クリアできれば手作業 UI を自動取得へ作り変える設計（PR-D2 以降）に進める。

- いずれの方針も**まだ決定していない**。C（keiba.go.jp）は不可、D（自前集約）は母数不足で正本不可。
- → **方針が決まるまで generator / dry-run スクリプトには進まない**。進めてよいのは docs 設計
  （スキーマ二択 a/b の検討・§12.6）まで。**手作業 UI（entries-manager.astro / save-entries.mjs）の改変もしない**。

### 12.8 本 PR（PR-D1）で実施していないこと
- 実取得 / スクレイプ / generator 作成 / dry-run スクリプト作成 / scripts 変更 / shared データ変更 / AK・KI 変更はなし。
- featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目 / 穴馬抽出 / `dark-horse.mjs` 非接触。
- JRA `horseHistories` 非変更。`nankan/recentHorseHistories`（5走）非変更。`nankan/entries`（既存 shared データ）非変更（read-only 参照のみ）。

---

## 11. 更新履歴

- 2026-06-10: 初版作成（PR-D0）。南関版 horseHistories 詳細データの取得・保存契約 v0 ドラフト。目的（プロフィール/通算/条件別/直近10走）、recentHorseHistories との責務分離、JRA 参照モデル（生 history[] 保存・集計は表示側）、保存パス案 `nankan/horseHistories/`、v0 スキーマ案、取得元候補と制約（keiba.go.jp 不可方針 / nankankeiba.com 規約要確認 / entries 復活候補 / results 自前集約候補）、段階分割（PR-D0〜D7）、禁止事項、回帰確認を記録。**docs-only・取得なし・スクレイプなし・実装なし**。
- 2026-06-10: **PR-D1 取得元可否 read-only 調査結果を追記（§12）**。取得元4分類（A: nankan/entries 復活＝要確認・最有力 / B: nankankeiba.com 直接＝技術的可能だが採用要確認 / C: keiba.go.jp＝不可方針維持 / D: results・archive 自前集約＝母数不足で正本不可）。entries は `record`（通算+左右/場/距離別を構造化済）・profile（父/母父/馬主/生産者/毛色等）・recentRaces 5走を持つ最有力候補だが、**2026-04-07 で停止し生成元コードが現環境に無く出自不明**＝再稼働可否未確定。nankankeiba.com は馬データページ（uma_search/syousai/race_detail_search）実在・著作権 "all rights reserved" 明示・robots.txt 404 だが**不在を許可扱いしない**・規約本文未精査。スキーマ二択（(a)JRA式 生history保存・表示側集計／(b)entries式 集約record保存）は PR-D2 以降で判断。**PR-D2 進行条件＝entries生成元の再確認 or nankankeiba.com 規約・許諾・負荷クリアランス（現状いずれも未充足）**。取得元確定まで generator/dry-run に進まない。**docs-only・実取得なし・スクレイプなし・generator/dry-run作成なし。shared/AK/KI/scripts 不変更**。
- 2026-06-11: **PR-D1 追補：entries の出自を訂正（§12.1 A 行 / §12.2 → §12.2.1〜12.2.3 / §12.7）**。追加 read-only 調査により、PR-D1 初稿の「生成元コードが現環境に無く出自不明／外部ツール・別環境で生成」は**誤りと判明したため訂正**。entries の生成元は admin repo 内に**現存**する `src/pages/admin/entries-manager.astro`（入力UI）＋ `netlify/functions/save-entries.mjs`（保存Function）で、**公式（地方/南関/中央）出走表テキストの手作業コピペ＋ブラウザ内パース由来**（外部 fetch なし・自動スクレイプではない・nankankeiba.com からの自動取得でもない）。ID/URL 非保持は転記パースのため。停止理由はコード喪失ではなく 2026-04-07 以降に手作業運用をしていないだけ。ただし**公式表示の転記・保存・再利用の著作権・利用規約・商用利用可否の論点は手作業でも残る**。再稼働は技術的に可能だが手作業運用で、JRA auto-fetch（日次自動）とは別物。自動化する場合は nankankeiba.com の規約・許諾・取得負荷条件の確認が別途必要。**PR-D2 進行条件を「entries手作業コピペ運用を再開するか／自動取得の規約クリアを取るか の方針決定」へ更新**。**docs-only・1ファイル・entries-manager.astro / save-entries.mjs は不変更・実取得/スクレイプ/generator/dry-run なし**。
