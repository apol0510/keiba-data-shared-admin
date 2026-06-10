# 南関 recentHorseHistories 契約 v0 ドラフト

**作成日**: 2026-06-01
**ステータス**: 契約ドラフト（設計のみ・実装なし）
**対象repo**: keiba-data-shared-admin（中心） / keiba-data-shared（保存先） / analytics-keiba・keiba-intelligence（読み手）
**前提ドキュメント**: [nankan-past-races-audit.md](nankan-past-races-audit.md) / [nankan-feature-importance-plan.md](nankan-feature-importance-plan.md) / [cross-project-safety-rules.md](cross-project-safety-rules.md)

> 本ドキュメントは「南関過去走の正本契約」の v0 ドラフトである。**実装・JSON生成は行わない。**
> 監査（[nankan-past-races-audit.md](nankan-past-races-audit.md)）で確認した次の事実に基づく:
> - results 突合で **馬場・通過順・人気・着差・fieldSize・surface・raceName・raceNo** を補完できる可能性が高い。
> - `entries.recentRaces` は **date/venue 分離済・passingOrder・popularity・margin・headCount・trackCondition** を持つ理想に近いスキーマだが、**2026/03〜04 で停止**。
> - `computer` は racebook の **backfill コピー**（`backfilledFrom:"racebook"`）であり独立正本ソースではない。
> - `2026-06-01-FUN` は racebook のみで **results 未確定**（当日分は翌日以降）。
> - 南関 Feature Importance 改善より、**recentHorseHistories の正本契約化が先**。

---

> **別契約への注記（2026-06-10 追記）**: 本契約の `nankan/recentHorseHistories/` は**最大5走の過去走表示用**である。
> 中央JRA 相当の**全履歴・通算成績・条件別成績・直近10走**を南関で持つための新設データは、別パス
> **`nankan/horseHistories/`** として [nankan-horse-histories-detail-contract.md](nankan-horse-histories-detail-contract.md)
> （PR-D 系列）で別契約として設計する。**両者を混同しない**（別ディレクトリ・別 generator/validator/dispatch・別ローダー・別注入フィールド）。
> 本契約の generator / validator / dispatch / whitelist（22項目）は新設側で**壊さない**。

---

## 1. 契約の目的

- 南関の過去走データを、**表示側ではなく admin/shared 側で正本化**する。
- **AK / KI が同じ南関過去走正本（recentHorseHistories）を読む**。
- **AK / KI の表示差別化は維持**する（[feature-scores-site-differentiation.md](feature-scores-site-differentiation.md)）:
  - **AK = 3項目要約**（安定性 / 能力上位性 / 展開利、`computeImportance` 由来）
  - **KI = 6項目詳細**（Speed / Stamina / Form / Track / Distance / Jockey、`generateAdvancedMetrics` 由来）
- **JRA horseHistories をそのまま流用しない**（南関は年なし・raceNo なし等の固有事情があり、JRA 形に寄せると null だらけになる）。
- **Feature Importance 改善より、過去走正本化を先に行う**。

---

## 2. 保存先案

```
nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json
```

例:
- `nankan/recentHorseHistories/2026/06/2026-06-01-FUN.json`
- `nankan/recentHorseHistories/2026/05/2026-05-29-URA.json`

命名規則は既存の racebook / results / computer と同一（`YYYY-MM-DD-{3文字VENUEコード}.json`）に揃える。

---

## 3. トップレベル構造案

```jsonc
{
  "schemaVersion": "nankan-recent-horse-histories-v0",
  "category": "nankan",
  "date": "2026-06-01",          // この開催日（過去走の日付ではない）
  "venue": "FUN",                // 3文字コード
  "venueName": "船橋",
  "source": {
    "base": "racebook",          // ベースソース
    "enrichment": ["results", "entries"],  // 突合・補助ソース
    "generatedAt": "2026-06-01T00:00:00.000Z",
    "generator": "enrich-recent-horse-histories@v0"  // 生成スクリプト名（将来）
  },
  "races": [
    {
      "raceNumber": 1,
      "raceName": "...",
      "horses": [
        {
          "horseNumber": 1,       // 今回出走の馬番
          "horseName": "...",
          "recentRaces": [ /* §4 のオブジェクト配列。新しい順 */ ]
        }
      ]
    }
  ]
}
```

設計意図:
- **1頭ごとに `recentRaces` 配列**を持たせる（race ごとに horses を持つ形にしない）。AK の `attachRecentRacesBeforeScoring` / KI の `recentRaces` 付与がいずれも「馬 → recentRaces 配列」を前提にしているため、読み手の改修が最小になる。
- `source` ブロックで来歴を明示（どのソースを base/enrichment に使ったか）。

---

## 4. recentRaces の項目案（entries.recentRaces を下敷き）

`entries.recentRaces` の実スキーマ（date/venue 分離・passingOrder・popularity・margin・headCount・trackCondition）を踏襲する。

### 必須候補

| フィールド | 型 | 主な供給元 | 備考 |
|---|---|---|---|
| `date` | string(YYYY-MM-DD) | entries / results / racebook(年推定) | **年補完済の絶対日付** |
| `venue` | string | 全ソース | 表示名 "浦和" |
| `venueCode` | string | 正規化 | OOI/KAW/FUN/URA or null(南関外) |
| `raceNumber` | number | results | racebook には無い→突合で取得 |
| `raceName` | string | results / entries | racebook は階級のみ |
| `distance` | string | racebook | "ダ1300" |
| `distanceMeters` | number | racebook / entries | 1300 |
| `surface` | string | results / entries | "ダート" |
| `trackCondition` | string | results / entries | 良/稍重/重/不良 |
| `headCount` | number | results(`horses`) / entries | 出走頭数 |
| `horseNumber` | number | results / entries | **当時の馬番**（今回出走馬番と別物） |
| `finish` | number | racebook / results / entries | 着順 |
| `finishStatus` | string\|null | results(頭数差) / entries | normal/cancelled/excluded/stopped |
| `popularity` | number | results / entries | racebook には無い |
| `bodyWeight` | number | racebook / entries | results には無い |
| `jockey` | string | 全ソース | |
| `carriedWeight` | number | racebook(`weight`) / entries(`weight`) | 斤量。results には無い |
| `time` | string | 全ソース | **表記正規化要**（"1.24.9"↔"1:24.9"） |
| `passingOrder` | string | results(cornerData導出) / entries | "10-10-10-9" |
| `last3f` | string\|number | 全ソース | 上がり3F |
| `margin` | string | results / entries | "アタマ/1/2/大差/-" |
| `opponentName` | string | racebook(`winner`) / results / entries | 勝ち馬 or 相手 |
| `source` | string | 生成時 | "racebook" / "results-enriched" / "entries" |
| `sourcePriority` | number | 生成時 | 採用したソースの優先度 |
| `dataQualityFlags` | string[] | 生成時 | **§9。必須** |

### 可能なら追加

| フィールド | 供給元 | 備考 |
|---|---|---|
| `trainer` | results | racebook pastRaces には無い |
| `postPosition` | entries | 枠/ゲート |
| `fieldSize` | results(`horses`) | headCount と同義の場合は片方に統一 |
| `resultMatched` | bool | results 突合が成功したか |
| `resultMatchKey` | string | 突合に使ったキー（監査用） |
| `yearInferred` | bool | date の年を推定で補完したか |
| `originalVenueText` | string | racebook 由来の生 "浦和 4.23" |
| `originalRaceText` | string | racebook 由来の生 raceClass |

---

## 5. ソース優先順位

| ソース | 持つもの | 持たないもの | 扱い |
|---|---|---|---|
| **racebook pastRaces** | 距離・着順・タイム・上がり・**馬体重・斤量**・騎手の一部 | venue に日付混入、**raceNo なし**、馬場/通過順/人気/着差/surface なし | **base** |
| **results** | raceDate・venue・raceNo・raceName・surface・trackCondition・**fieldSize・popularity・margin・cornerData** | **斤量・馬体重なし**、2026 のみ | **enrichment（主）** |
| **entries** | 理想スキーマに近い（date/venue 分離・passingOrder・popularity・margin・headCount・trackCondition） | **2026/03〜04 で停止** | **設計参考・補助 enrichment** |
| **computer** | racebook の backfill コピー（`backfilledFrom:"racebook"`） | racebook と同一の欠損 | **独立ソースとして扱わない** |

採用ルール: 同一項目が複数ソースで取れる場合、信頼度の高い順に **entries > results > racebook** で採用（斤量・馬体重は results に無いため racebook を採用）。採用元を `source` / `sourcePriority` に記録。

---

## 6. 年推定ルール（racebook `venue="浦和 4.23"` → 絶対日付）

racebook pastRaces の venue 文字列は「場名 M.D」で**年がない**。開催日（ファイル date）を基準に年を推定する。

```
入力: 開催日 D（例 2026-05-29）、past の月日 (M, day)
1. 候補日 cand = (D.year, M, day)
2. cand > D （未来）なら → 前年扱い: (D.year - 1, M, day) … flag: year-inferred
3. cand <= D （同年以前）なら → 同年扱い: (D.year, M, day)
4. M または day が解釈不能 → date を作らず flag: no-date / date-ambiguous
```

注意:
- **出走日より未来の月日なら前年扱い**、**出走日以前なら同年扱い**。
- 年跨ぎ推定をした場合は必ず **`year-inferred`** を付ける。
- 年推定不能なら **`no-date`** / **`date-ambiguous`**。
- **2025 以前や南関外の前走は results 突合不可の可能性がある**（results は 2026 のみ、南関外は nankan/results に無い）。
- 年推定による誤突合を避けるため、突合時に **match confidence**（§8）を持たせ、低信頼一致は採用しない。

---

## 7. venue 正規化

| 表示名 | コード |
|---|---|
| 大井 | OOI |
| 川崎 | KAW |
| 船橋 | FUN |
| 浦和 | URA |

南関外（門別 / 盛岡 / 水沢 / 中山 / 東京 / 中京 など）は `venueCode=null` とし、**`outside-nankan`** flag を付ける。南関外は `nankan/results` に存在しないため results 突合不可（racebook の値のみ採用）。

---

## 8. results 突合ルール

### 突合キー案

1. 第一キー: `date` + `venueCode` + `horseName`
2. 補助照合（衝突・曖昧時）: `raceNumber` または `raceName` / `distance` / `finish` / `time` の一致度

### 注意

- **horseName だけでは将来的に衝突リスク**（監査では1日内衝突0件だが、長期・複数開催日では同名馬リスクあり）。
- 同名馬対策として **date + venue + horseName + distance + time + finish** を組み合わせ、match confidence を算出。
- **results 側 `horseNumber` は当時の馬番**であり、**今回出走の馬番とは異なる**ため、馬番での突合は不可（番号は passingOrder 導出にのみ使用）。
- 取消・除外・中止は **`finishStatus`** で明示（results の頭数 `horses` と results 件数の差から推定。明示テキストは results に無い）。
- 突合失敗時は **`no-result-match`**。
- 曖昧一致（複数候補・低信頼）時は **`match-ambiguous`**（採用しない or 低優先で採用しフラグ）。

### match confidence（案）

```
confidence = w1*nameExact + w2*dateExact + w3*venueExact
           + w4*distanceMatch + w5*finishMatch + w6*timeMatch
閾値未満 → match-ambiguous（results 値を採用しない）
```

---

## 9. dataQualityFlags 定義

### 突合・日付・会場系
- `no-result-match` — 突合先 results が見つからない（2025 / 南関外 / 未投入）
- `year-inferred` — venue 日付の年を推定補完した
- `date-ambiguous` / `no-date` — 日付解釈不能
- `venue-date-embedded` — racebook 由来の日付混入生データ
- `outside-nankan` — 南関4場以外の前走
- `horse-name-mismatch` — 馬名突合に表記ゆれ補正を要した
- `match-ambiguous` — 突合候補が複数 or 低信頼

### 項目欠損系
- `no-track-condition` / `no-corner-order` / `no-popularity` / `no-margin`
- `no-field-size` / `no-surface` / `no-odds` / `no-source-url`
- `jockey-missing` / `weight-missing` / `bodyweight-missing`

### 状態系
- `cancelled` / `excluded` / `stopped`

### 来歴系
- `source-racebook-only` — racebook の値のみ（results 補完なし）
- `source-results-enriched` — results 突合で補完済み
- `source-entries` — entries 由来

**必須運用**: `no-result-match` と `year-inferred` は最優先で出力。曖昧補完を契約で可視化し、±1日マージ事故（[cross-project-safety-rules.md](cross-project-safety-rules.md)）と同じ思想で「曖昧に埋めた」ことを後段に伝える。

---

## 9.1. ドライラン実測で確定した突合の追加ルール（2026-05-29-URA 精査由来）

> 2026-05-29-URA 単独ドライランの name-miss 4件精査（[dryrun-design §9.3](nankan-recent-horse-histories-dryrun-design.md)）で確定した契約追補。

### A. 距離照合は `distanceMeters` で行う

- results 側の距離は `"1300"` のような **数値文字列**、racebook 側は `"ダ1300"` のような表記。
- **距離照合は文字列一致ではなく `distanceMeters` に正規化して比較する**。`distance` / `surface` の表記をそのまま比較しない。

### B. winner 名は弱い補助情報として扱う

- racebook pastRace の `winner` は **約6文字で切り捨てられている可能性がある**（例: `エミネントキ` = results の `エミネントキャリア`）。
- **winner は補助情報**にとどめ、強い突合キーにしない。**winner の前方一致だけで results 行を採用しない**。

### C. 補助突合による救済は禁止（偽陽性防止）

- parent horseName が results 側に存在しない場合、**`time` / `distance` / `finish` / `winner` の類似だけで別馬の results 行へ接続しない**。
- 補助突合で救済すると **偽陽性**が発生する。実測 case1 では、補助突合すると別馬（カスカナノゾミ）の行へ誤接続する可能性が確認された。
- よって **parent horseName の完全/正規化一致を必須条件**とし、満たさなければ `no-result-match`（racebook-only）のまま据え置く。§8 の `confidence` 案も「nameExact を必須ゲートとし、補助項目は確証の上積みのみ。nameExact=0 なら採用しない」と解釈する。

### D. dataQualityFlags 追加（name-miss の細分化）

既存の `horse-name-mismatch`（表記ゆれ・正規化差分の疑い）とは**別物**として、次を追加する:

- `result-present-horse-absent` — 推定 `date` + `venueCode` の results は存在するが、parent horseName が results に存在しない。
- `racebook-pastrace-suspect` — racebook pastRace の日付・場・winner・着順などが親馬の実戦績と整合せず、**racebook 側の誤紐付け（パース列ずれ・幻行）**が疑われる。

| フラグ | 意味 | 救済方針 |
|---|---|---|
| `horse-name-mismatch` | 表記ゆれ・正規化差分。正規化一致で救える | 正規化一致なら results 採用可 |
| `result-present-horse-absent` | results はあるが馬名が無い（表記ゆれではない） | **救済しない**。racebook-only |
| `racebook-pastrace-suspect` | 過去走行と親馬の対応自体が疑わしい | **救済しない**。racebook-only |

### E. 実装方針への影響

- **horseName 突合ルールの緩和は不要**。むしろ緩和しない方が安全。
- name-miss は **racebook-only として残し、専用フラグ（D）で可視化**する。`dataQualityFlags` で後段に伝え、**無理に補完しない**。

---

## 10. AK / KI 利用方針

- AK / KI は **この recentHorseHistories を共通正本として読む**。
- **AK は 3項目要約**の材料にする。
- **KI は 6項目詳細**の材料にする。
- **値や表示を同一化しない**（差別化は正常）。
- `dataQualityFlags` を見て、**無理に 50 baseline で埋めない**。
- 欠損が多い場合は **非表示またはデータ不足表示**を検討する。
- **表示側だけで補完しない**（補完は admin/shared の正本生成で完結させる）。

---

## 11. Feature Importance への接続（※本契約 md では実装しない）

| 指標 | 効く項目 |
|---|---|
| 展開利 | `passingOrder` / `trackCondition` / `popularity` |
| 能力上位性 | `finish` / `time` / `distance` / `fieldSize` |
| 安定性 | `finish` / recent trend / `margin` |

- **KI の 50 baseline 退避を減らす**ため、`dataQualityFlags` ベースで算出可否を判断する（項目が無ければ 50 で埋めず「データ不足」へ）。
- ただし **この契約 md では実装しない**。`featureScores.js` / `computeImportance` は不変更。

---

## 12. 禁止事項

- **JRA horseHistories を南関へ流用しない。**
- **`keiba.go.jp` の robots Disallow パスを自動取得しない。**
- **表示側だけで補完しない。**
- **AK だけ、KI だけの片寄せ修正をしない。**
- **既存 JSON を手作業で補完しない。**
- **workflow_dispatch / shared PUT は明示許可なしに実行しない。**
- **`featureScores.js` / `computeImportance` / `HorseMainCard` / `RaceHorseSection` を場当たり変更しない。**
- **AI総合指数・印・買い目・予想本文・過去走表示を巻き込まない。**

---

## 13. 次の実装前チェックリスト

- [ ] `nankan/results` で補完可能な範囲を再確認（2026 窓・南関外率）
- [ ] entries 停止理由の確認（2026/03〜04 で止まっている原因と再稼働可否）
- [ ] results が当日未確定の場合の扱い（当日 racebook には過去走補完のみ、当日結果は使わない）
- [ ] `no-result-match` 率の算出（年跨ぎ ~14% + 南関外 ~2% の実測）
- [ ] 年推定ルールのテスト（未来日→前年判定の検証）
- [ ] venue 正規化テスト（南関4場 + outside-nankan）
- [ ] horseName 突合テスト（同名衝突・表記ゆれ・time 表記差）
- [ ] dataQualityFlags の出力確認
- [ ] 既存表示に影響しないドライラン設計（生成→検査のみ、push/dispatch は別途許可）

---

**関連**: [nankan-past-races-audit.md](nankan-past-races-audit.md)（監査） / [nankan-feature-importance-plan.md](nankan-feature-importance-plan.md)（FI再設計） / [cross-project-safety-rules.md](cross-project-safety-rules.md)（クロスプロジェクト安全運用）
