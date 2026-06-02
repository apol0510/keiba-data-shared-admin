# 南関 recentHorseHistories 生成ドライラン設計

**作成日**: 2026-06-01
**ステータス**: 設計のみ（読み取り専用調査完了 / 実装・生成・commit・push・PUT・dispatch なし）
**対象repo**: keiba-data-shared-admin（中心） / keiba-data-shared（読取） / analytics-keiba・keiba-intelligence（読取のみ）
**前提**: [nankan-recent-horse-histories-contract.md](nankan-recent-horse-histories-contract.md)（契約v0） / [nankan-past-races-audit.md](nankan-past-races-audit.md)（監査） / [cross-project-safety-rules.md](cross-project-safety-rules.md)

> 本ドキュメントは契約v0（実装なし）の次段にあたる「生成ドライランの設計」である。
> **ドライランも生成→検査のみ。ファイル書き込み・shared PUT・workflow_dispatch は一切しない。**
> スクリプト作成（`scripts/` 配下）はマコさんの明示許可後。本ドキュメントは設計の固定で停止する。

---

## 0. 事前確認の結果（必須）

実施日 2026-06-01 時点、全リポジトリ upstream と完全同期（0 ahead / 0 behind）。

| repo | branch | 同期 | 未追跡 |
|---|---|---|---|
| keiba-data-shared-admin | main | 0/0 | 既知3ファイルのみ（**commit禁止対象**） |
| keiba-data-shared | main | 0/0 | なし |
| analytics-keiba | feat/ak-feature-summary-jra-free | 0/0 | `.claude/worktrees/` のみ |
| keiba-intelligence | feat/jra-free-feature-scores-ui | 0/0 | なし |

- `git add .` / `git add -A` は**今回使用しない**。ドライランはファイルを生成せず、生成する場合も個別 path 指定のみ。
- commit 禁止の未追跡3ファイル（`netlify/functions/publish-prediction.mjs` / `scripts/build-feature-scores-once.mjs` / `scripts/enrich-past-races-once.mjs`）には触れない。
- `recentHorseHistories` の語は AK / KI / shared の**どこにも未出現** → 新規 shared ファイルは純粋に追加的で、既存読み手のロードを壊さない。

---

## データで確定した突合の前提（実構造を実測）

| ソース | 馬の過去走配列 | 日付表現 | time表記 | 通過順 | 人気/着差/馬場/頭数 |
|---|---|---|---|---|---|
| **racebook** | `races[].horses[].pastRaces[]` | `venue:"川崎 7.10"`（年なし・場名混入） | `"59.4"` / `"1.24.9"`（**ドット**） | `courseNote:null`（全欠損） | 全欠損 |
| **results** | `races[].results[]`（当時馬番ベース） | race単位 `date`/`venue`/`venueCode` 分離 | `"1:24.9"`（**コロン**） | race単位 `cornerData[].order`（馬番配列）から導出 | 各行 `popularity`/`margin` + race単位 `trackCondition`/`surface`/`horses`(=fieldSize) |
| **entries** | `races[].horses[].recentRaces[]` | `date`分離・`venue:"浦和"` | `"1:41.7"`（コロン） | `passingOrder:"10-10-10-9"` 完備 | 完備（理想スキーマ）だが **2026/03〜04 の7ファイルで停止** |

**確定事項**:
- **time表記の正規化は突合の前提条件**（racebook ドット ↔ results/entries コロン）。`"1.24.9"→"1:24.9"`、`"59.4"`（分なし秒）も秒(float)へ統一。
- results の通過順は `cornerData[].order` から「当時馬番の各コーナー位置」を逆引きして `passingOrder` を構成。
- entries は事実上 2026/03〜04 のみ → 主対象期間 2026/05 では **enrichment 補助に使えない**。突合は実質 **racebook(base) × results(enrichment)** の2者で設計する。
- racebook past オブジェクト自体には「その馬の名前」が無い（`winner`=勝ち馬のみ）。過去走は親 `horses[].name` に属するので、**突合キーの horseName は親馬の名前**を用いる。

---

## 1. no-result-match率の実測方法

racebook pastRaces のうち results 突合できない割合を**原因別**に実測する（stdout のみ、ファイル化しない）。

1. 対象開催日の racebook を読み、全 `pastRaces` を flatten（1件＝1過去走、親馬名を保持）。
2. 各過去走で年推定（§2）→ `(date, venueCode)` を確定。
3. `nankan/results/{Y}/{M}/{date}-{venueCode}.json` 存在判定。
4. 存在すれば horseName 突合（§4）を試行。
5. 次のバケットへ分類してカウント:

| バケット | 条件 | 想定フラグ |
|---|---|---|
| `matched` | results存在 & 馬名一致 | `source-results-enriched` |
| `no-result-file` | results ファイル無し（2025以前/未投入） | `no-result-match` |
| `outside-nankan` | venueCode=null（南関外） | `outside-nankan`+`no-result-match` |
| `name-miss` | resultsはあるが馬名不一致 | `no-result-match`+`horse-name-mismatch` |
| `ambiguous` | 複数候補/低信頼 | `match-ambiguous` |

**出力**: 全体 match率 / no-result-match率 ＋ 原因別内訳。契約§13 の「年跨ぎ ~14% + 南関外 ~2%」想定を検証。母数は「過去走件数ベース」と「馬ベース（1走でも補完できた馬の率）」の両方を出す。

---

## 2. 年推定ルールの検証方法

ルール（契約§6）: past (M,D) で `cand=(開催年,M,D)`。`cand > 開催日`→前年、`cand <= 開催日`→同年。

1. 全 pastRaces の `venue` を `/^(\D+?)\s*(\d{1,2})\.(\d{1,2})$/` でパース（場名 + M.D）。
2. 推定絶対日付を**3種のオラクル**で正誤判定:
   - (a) results 突合成功過去走 → 推定日付の results に同名馬が居れば推定正。
   - (b) entries(2026/03〜04) の同一馬 `recentRaces.date` と突合し年含め一致確認（少数だが ground-truth）。
   - (c) 単調性: 同一馬 pastRaces は新しい順 → 推定日付が降順か（逆転＝推定ミス疑い）。
3. 実例: 2026-05-29-URA の `"川崎 7.10"` は開催日(5/29)より未来 → **前年 2025-07-10** 推定（実データ確認済）。
4. 境界ケース期待値表: 同月過去→同年 / 同日→同年(`<=`) / 翌日以降→前年 / 12月→1月跨ぎ→前年。

**合格基準**: 突合可能過去走で推定日付の不一致0、単調性違反0。違反は `year-inferred` 群の誤りとして列挙。

---

## 3. venue正規化テスト

対象: 大井→OOI / 川崎→KAW / 船橋→FUN / 浦和→URA。それ以外→`venueCode=null`＋`outside-nankan`。

1. 全 pastRaces の場名部分を抽出しユニーク頻度表を作る。
2. 4場の写像可否（表記ゆれ・全角混入チェック）。
3. 南関外（門別/盛岡/水沢/中山/東京/中京 等）が `null`+`outside-nankan` に落ちるか。
4. **未知の場名**（マップにも南関外リストにも無い値）を例外リストとして必ず stdout 出力（silentに捨てない）。

**合格基準**: 既知4場100%写像、未知場名は0件か全件列挙。

---

## 4. horseName突合テスト

第一キー: `date + venueCode + horseName`（horseName=親馬名）。補助照合: `distance` / `finish` / `time`(正規化後) の一致度で confidence。

1. results 側 `results[].name` と racebook 親馬 `horses[].name` を照合（推定date・venueCode込み）。
2. 表記ゆれ正規化（全/半角・トリム・中黒差）。補正を要したら `horse-name-mismatch`。
3. 同名衝突: 同一 (date,venueCode) results 内に同名2件以上が無いか走査。
4. confidence = `nameExact`(必須) + `distanceMatch` + `finishMatch` + `timeMatch`(正規化後)。閾値未満は `match-ambiguous` で **results値を採用しない**。
5. time正規化単体テスト: `"59.4"`/`"1.24.9"`/`"1:24.9"`/`"1:41.7"` を全て秒(float)へ変換し比較可能か。

**合格基準**: 突合成立過去走の confidence 分布を出し、低信頼帯件数とフラグ付与を確認。同名衝突は全件列挙。

---

## 5. dataQualityFlags 出力設計

ドライランで「実際に何件・どのフラグが付くか」を集計（stdout、生成JSONは作らない）。

```
flag集計（2026-05-29-URA, 過去走 N件）:
  source-results-enriched : ___
  source-racebook-only    : ___
  no-result-match         : ___  (内 outside-nankan ___ / no-result-file ___ / name-miss ___)
  year-inferred           : ___
  outside-nankan          : ___
  no-track-condition      : ___  ← racebook由来は構造的に100%付くはず
  no-corner-order         : ___
  no-popularity           : ___
  no-margin               : ___
  match-ambiguous         : ___
  horse-name-mismatch     : ___
```

不変条件（検証項目）:
- racebook-only の過去走には必ず `no-track-condition`/`no-corner-order`/`no-popularity`/`no-margin` が付く。
- results-enriched に昇格したらこれらが解消される（results が供給）。
- フラグは排他でなく多重付与（配列）。`no-result-match` と `year-inferred` は最優先で出力。

---

## 6. recentHorseHistories 生成ドライラン設計

**原則**: 生成→検査のみ。ファイル書き込み・PUT・dispatch は一切しない。

3段階（いずれも read-only）:
1. **構造検証モード**: racebook×results 突合で**メモリ上**に契約§4スキーマのオブジェクトを組み立て、`JSON.stringify` を **stdout 表示するだけ**（保存なし）。
2. **差分検査モード**: results 補完で「racebook-only → results-enriched」に変わった項目（trackCondition/popularity/margin/passingOrder/fieldSize/raceName/raceNumber/surface）を before/after で列挙。
3. **集計モード**: §1〜§5 の指標サマリを表示。

入出力の境界:
- 入力: `keiba-data-shared` の既存JSONを読むだけ（pull もしない＝同期済）。
- 出力: stdout のみ。`nankan/recentHorseHistories/...` への書き込みはしない。
- スクリプト置き場: `scripts/` は今回禁止対象。ドライラン専用スクリプトを置く場合は別途明示許可を取る。**本設計では作成しない**。

---

## 7. 対象日付・会場の選定

| 用途 | 日付-会場 | 理由 |
|---|---|---|
| **初回主対象（確定）** | `2026-05-29-URA` | racebook+results 両在、同日クリーン、`"川崎 7.10"` 年跨ぎ実例あり。最小スコープで突合・年推定・flags集計を検証 |
| 副対象（合格後） | `2026-05-22-OOI` | OOI（大頭数傾向）で突合母数を増やす |
| 年跨ぎ密度確認（合格後） | `2026-05-18〜22-OOI` 連続 | 前年past が増える期間の傾向確認 |
| 除外 | `2026-06-01-FUN` | results未確定（当日）→突合不可。当日は過去走補完のみ・結果は使わない原則の確認用に「no-result-file になること」だけ確認 |

**初回は 2026-05-29-URA 単独**。合格後に副対象へ広げる。

---

## 8. 入力JSONの確認方法

突合前に各入力ファイルの存在と健全性を確認（読み取りのみ）:

```
ls -l keiba-data-shared/nankan/racebook/2026/05/2026-05-29-URA.json
ls -l keiba-data-shared/nankan/results/2026/05/2026-05-29-URA.json
# entries は同日なし（2026/03〜04のみ）→ enrichment補助は今回スキップと記録
```

健全性チェック（node で読取集計、書き込みなし）:
- racebook: `races[].horses[].pastRaces[]` 総件数、馬あたり走数分布（0〜6走）。
- results: `races[].results[]` 件数、`cornerData` 有無、`trackCondition`/`surface` 充足。
- venue文字列ユニーク一覧（§3入力）。
- time表記サンプル抽出（ドット/コロン/分なしの分布）。

---

## 9. 出力JSONサンプル（設計見本・実生成ではない）

契約§3/§4 準拠。主対象 2026-05-29-URA・R1 想定。

```jsonc
{
  "schemaVersion": "nankan-recent-horse-histories-v0",
  "category": "nankan",
  "date": "2026-05-29",
  "venue": "URA",
  "venueName": "浦和",
  "source": {
    "base": "racebook",
    "enrichment": ["results"],          // entries は当該期間停止のため不使用
    "generatedAt": "<dry-run: stamp省略>",
    "generator": "dry-run/no-write"
  },
  "races": [
    {
      "raceNumber": 1,
      "raceName": "...",
      "horses": [
        {
          "horseNumber": 6,
          "horseName": "ラブシリカ",
          "recentRaces": [
            // ── ケースA: results補完成功（results-enriched） ──
            {
              "date": "2025-07-10",
              "yearInferred": true,           // "川崎 7.10" → 前年推定
              "venue": "川崎",
              "venueCode": "KAW",
              "raceNumber": 5,                // results由来（racebookに無い）
              "raceName": "C3 ...",           // results由来
              "distance": "ダ900",
              "distanceMeters": 900,
              "surface": "ダート",            // results由来
              "trackCondition": "良",         // results由来（racebookは100%null）
              "headCount": 10,                // results horses由来=fieldSize
              "horseNumber": 3,               // 当時馬番（今回馬番と別物）
              "finish": 7,
              "finishStatus": "normal",
              "popularity": 4,                // results由来
              "bodyWeight": 395,              // racebook由来（resultsに無い）
              "jockey": "藤江渉",
              "carriedWeight": 54,            // racebook weight由来
              "time": "0:59.4",               // 正規化後（元 "59.4"）
              "passingOrder": "8-7-7-7",      // results cornerDataから当時馬番3を逆引き
              "last3f": "40.4",
              "margin": "クビ",               // results由来
              "opponentName": "デーレーシト", // racebook winner / results 1着名
              "source": "results-enriched",
              "sourcePriority": 2,
              "resultMatched": true,
              "resultMatchKey": "2025-07-10|KAW|ラブシリカ",
              "dataQualityFlags": ["year-inferred", "source-results-enriched"]
            },
            // ── ケースB: 突合不可（racebook-only / 南関外 or 2025未投入） ──
            {
              "date": null,
              "yearInferred": false,
              "venue": "盛岡",
              "venueCode": null,
              "raceNumber": null,
              "raceName": null,
              "distance": "ダ1400",
              "distanceMeters": 1400,
              "surface": null,
              "trackCondition": null,
              "headCount": null,
              "finish": 3,
              "popularity": null,
              "bodyWeight": 402,
              "jockey": "...",
              "carriedWeight": 55,
              "time": "1:28.0",
              "passingOrder": null,
              "last3f": "39.1",
              "margin": null,
              "source": "racebook-only",
              "sourcePriority": 3,
              "resultMatched": false,
              "dataQualityFlags": [
                "outside-nankan", "no-result-match",
                "no-track-condition", "no-corner-order",
                "no-popularity", "no-margin", "no-field-size", "no-surface"
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

ポイント:
- **馬→recentRaces配列**構造（AK/KIの既存読み取り前提に最小改修で合う）。
- `dataQualityFlags` は多重付与・必須出力。
- 突合不可ケースは**埋めずに null + フラグで可視化**（±1日マージ事故と同じ「曖昧を伝える」思想）。

---

## 9.1. 頭数フィールドの表記統一方針（fieldSize / headCount）

契約v0 §4 が「`headCount` と `fieldSize` が同義なら片方に統一」としていた論点を、本ドライラン設計では次のとおり確定する。

- **final output JSON の正式フィールド名は `headCount` に統一する。**
- results 側の `races[].horses`（出走頭数）／`fieldSize` 相当値は、**`headCount` に正規化して格納する**。
- **`fieldSize` は内部説明・差分検査（§6）上の便宜名として登場する場合があるが、出力JSON には `fieldSize` を出さない。**
- **AK / KI が将来この正本を読む場合も `headCount` を読む前提**とする（頭数キーは `headCount` の一択）。
- 欠損時のフラグは引き続き `no-field-size`（フラグ名は契約v0 §9 のまま据え置き）。フラグ名と出力フィールド名（`headCount`）は別物として扱う。

> 注: §6 差分検査モードの記述に出てくる `fieldSize`、および §9 ケースBの `no-field-size` フラグは上記の便宜名・フラグ名であり、出力JSONフィールドとしては `headCount` のみを採用する。

---

## 9.2. 2026-05-29-URA 単独ドライラン実測結果

**実施日**: 2026-06-02 / **対象**: `2026-05-29-URA` 単独 / **形態**: 読み取り専用（stdout のみ・ファイル生成/保存/PUT/dispatch/commit なし）
**入力**: `keiba-data-shared/nankan/racebook/2026/05/2026-05-29-URA.json` × `.../results/2026/05/2026-05-29-URA.json`（突合先 results は推定日付・venueCode から動的ロード）

### 実測数値

| 指標 | 値 |
|---|---|
| racebook races | 12R |
| racebook horses | 134頭 |
| pastRaces 総件数 | 485 |
| results races | 12R |
| results 行数 | 128 |
| matched | 299 |
| **match率** | **61.6%** |
| no-result-match | 186 |
| **no-result-match率** | **38.4%** |
| └ no-result-file | 172 |
| └ outside-nankan | 10 |
| └ name-miss | 4 |
| ambiguous | 0 |
| year-inferred | 70 |
| time正規化 | 485/485 成功（失敗0） |
| venue未知場名 | 0 |

### results 補完可能項目（matched母数 299）

- `raceNumber` / `raceName` / `surface` / `trackCondition` / `headCount` / `popularity` / `margin` / `horseNumber`：**299/299（100%）**
- `passingOrder`（cornerData導出）：**290/299**（cornerData 欠落9R分のみ未補完）
  - **【訂正注記 2026-06-02】** この **290/299（97.0%）は race-level**（=「レースに cornerData が存在するか」）の粗い指標だった。**Phase 2 generator の horse-level 導出（=その馬の当時馬番が cornerData 各コーナー order 配列に実際に現れ `derivePassingOrder` が非nullを返す）では 253/299**。recentHorseHistories の実装上は **horse-level が正しい基準**であり、今後の保存前検査・summary では **horse-level の passingOrder 欠損**を採用する（[implementation-plan §10.1](nankan-recent-horse-histories-implementation-plan.md)）。
- `headCount`：results `races[].horses`（出走頭数）から **299/299 取得可能**。**`fieldSize` は出力不要、`headCount` 統一で問題なし**（§9.1 と整合）。

### 構造欠損フラグの補完後実効値

racebook 素材ベースでは全485件に `no-track-condition`/`no-corner-order`/`no-popularity`/`no-margin`/`no-field-size`/`no-surface` が付くが、results 補完後の実効値は次のとおり（matched 299 は results 供給で解消）:

- `no-track-condition` / `no-popularity` / `no-margin` / `no-field-size` / `no-surface`：各 **186**（= source-racebook-only 件数）
- `no-corner-order`：**195**（racebook-only 186 + cornerData欠落9R）

### 所見

- **match率 61.6% で、南関 recentHorseHistories の正本化は実現可能性が高い。**
- **no-result-match の主因は `no-result-file`（172件）であり、horseName 突合の失敗ではない。** name-miss は **4件のみ**、ambiguous は **0件**（同日内の同名衝突は顕在化せず）。
- **time正規化（485/485）・venue正規化（未知0）は今回対象では安定。**
- no-result-match は **results 在庫の範囲外**、特に **2025年以前や未保存日**が主因（year-inferred 70件の多くが results 窓外で突合不可）。これは契約§13 の想定（年跨ぎ~14% + 南関外~2%）より大きく、当ドライランの重要な実測値。
- **初回実装時は racebook-only（results補完なし）を許容し、`dataQualityFlags` で明示する設計が妥当。** 無理に埋めず「曖昧に埋めた／埋められなかった」を後段に伝える（±1日マージ事故と同じ思想）。
- **shared PUT・AK/KI 接続はまだ行わない**（本ドライランは読み取り検証のみ）。

> 補足: results 在庫は 2026/03=27・04=22・05=21 ファイルと厚く、南関4場近走の高い突合率（61.6%）はこの在庫の厚さに支えられている。対象期間を広げる際は results 窓の有無で match率が変動する点に留意する。

---

## 9.3. name-miss 4件の精査結果（2026-05-29-URA）

**実施日**: 2026-06-02 / **形態**: 読み取り専用（stdout のみ・全2026 nankan results 96ファイルを横断検索）

### 結論

2026-05-29-URA 単独ドライランで発生した name-miss 4件は、**horseName 突合ロジックの失敗ではなく、racebook pastRaces 側のパース誤紐付け・幻行・親馬との不整合が主因**だった。

| 観点 | 判定 |
|---|---|
| cancellation / scratched | **該当せず**（各馬は別日付の results に実在） |
| horse-name-normalization-needed（表記ゆれ） | **該当せず**（正規化しても痕跡なし） |
| year-inference-suspect（年推定ミス） | **該当せず**（同年窓内 / case1 は winner が推定日を裏付け） |
| venue-normalization-suspect（場名変換ミス） | **該当せず** |
| ambiguous | **0件** |
| 救済可能件数 | **0件** |
| 救済しない方がよい件数 | **4件** |

### 4件の内訳

| # | parent | past raw → 推定 | 不整合の証拠 |
|---|---|---|---|
| 1 | ハーシュミストレス | 浦和3.18/URA 4着 | 3/18-URA-R1(1300m) の真の4着はカスカナノゾミ。本馬の真の4着は **2/28-URA-R6(1400m)**。finish=4 だけ実戦績と一致＝**列ずれ** |
| 2 | レコパンマミー | 川崎5.12/KAW 5着 | 5/12-KAW 走が実在せず、winner プルーフリーも全results 1着に不在＝**幻行** |
| 3 | レコパンマミー | 浦和5.27/URA 5着 | 5/27-URA 走が実在せず、winner バトルホッパも不在＝**幻行** |
| 4 | ジオヴィグラス | 浦和5.27/URA 2000m 5着 | 真の2000m走は **5/12-KAW-R12 13着**。5/27-URA 2000m 5着は実在せず＝日付/着順/winner 不整合 |

→ 4件とも **result-file-exists-but-horse-absent**（results在×馬不在）であり、根本原因は **racebook-parent-name-suspect（pastRaces パースの誤紐付け）**。各馬は別日付の results に実在するため「results 未投入」ではない。

### 精査中に判明した突合の追加ルール（→ 契約 [§9.1](nankan-recent-horse-histories-contract.md) に反映）

- **距離照合は `distanceMeters` で行う**（results `"1300"` ↔ racebook `"ダ1300"`。文字列一致は使わない）。
- **racebook `winner` は約6文字で切り捨てられる**（`エミネントキ`=`エミネントキャリア`）。winner は弱い補助情報とし、前方一致だけで results 行を採用しない。
- **補助突合（time/distance/finish/winner 類似だけで別馬行へ接続）は禁止**。case1 で補助突合すると別馬カスカナノゾミの行へ誤接続する偽陽性が確認された。**parent horseName の完全/正規化一致を必須ゲート**とする。
- **新フラグ追加**: `result-present-horse-absent` / `racebook-pastrace-suspect`（既存 `horse-name-mismatch`＝表記ゆれ とは別物）。
- **実装方針**: horseName 突合の緩和は不要・むしろ緩和しない方が安全。name-miss は racebook-only として残し、専用フラグで可視化し、無理に補完しない。

---

## 9.4. 2026-05-22-OOI 単独ドライラン実測結果

**実施日**: 2026-06-02 / **対象**: `2026-05-22-OOI` 単独 / **形態**: 読み取り専用（stdout のみ・ファイル生成/保存/PUT/dispatch/commit なし）
**入力**: `keiba-data-shared/nankan/racebook/2026/05/2026-05-22-OOI.json` × `.../results/2026/05/2026-05-22-OOI.json`（突合先 results は推定日付・venueCode から動的ロード）
**目的**: [§9.2 URA](#92-2026-05-29-ura-単独ドライラン実測結果) の傾向が他会場でも再現するかの確認（対象拡大）。

### 実測数値

| 指標 | 値 |
|---|---|
| racebook races | 12R |
| racebook horses | 148頭 |
| pastRaces 総件数 | 555 |
| results races | 12R |
| results 行数 | 144 |
| 日付解釈成功 | 555/555（no-date 0） |
| year-inferred | 129 |
| venue未知場名 | 0 |
| outside-nankan（南関外） | 18 |
| time正規化 | 555/555 成功（失敗0） |
| matched | 339 |
| **match率** | **61.1%** |
| no-result-match | 216 |
| **no-result-match率** | **38.9%** |
| └ no-result-file | 195 |
| └ outside-nankan | 18 |
| └ name-miss | 3 |
| ambiguous | 0 |
| results補完8項目（raceNumber/raceName/surface/trackCondition/headCount/popularity/margin/horseNumber） | 339/339 |
| passingOrder | 336/339（※下記訂正注記） |
| headCount | 339/339 |
| result-present-horse-absent | 3 |
| racebook-pastrace-suspect | 3 |
| horse-name-mismatch | 0 |

> **【passingOrder 訂正注記 2026-06-02】** 上表の **336/339（99.1%）は race-level**（=「レースに cornerData が存在するか」）の粗い指標だった。**Phase 2 generator の horse-level 導出（=その馬の当時馬番が cornerData 各コーナー order 配列に実際に現れ `derivePassingOrder` が非nullを返す）では 314/339**。recentHorseHistories の実装上は **horse-level が正しい基準**であり、今後の保存前検査・summary では **horse-level の passingOrder 欠損**を採用する（[implementation-plan §10.1](nankan-recent-horse-histories-implementation-plan.md)）。

### name-miss 3件の簡易分類

| # | parent @ 推定先 | finish/距離/time | winner | 判定 |
|---|---|---|---|---|
| 1 | コーゲンマース @ 2026-05-01-OOI | 5着 / ダ1600 / 1.43.2 | クアッズ | resultsファイル有・馬名不在・類似名なし |
| 2 | レディーキラー @ 2026-05-01-OOI | 3着 / ダ1400 / 1.29.4 | オペラアリア | resultsファイル有・馬名不在・類似名なし |
| 3 | マスターキー @ 2026-04-17-OOI | 2着 / ダ1200 / 1.13.1 | ケイアイカペ | resultsファイル有・馬名不在・類似名なし |

- 3件とも **前回 URA と同じ `result-present-horse-absent` / `racebook-pastrace-suspect` パターン**（results 在×馬不在）。
- **表記ゆれではない**（正規化一致・類似名いずれもなし）。**ambiguous ではない**（候補0）。
- [§9.1-C](nankan-recent-horse-histories-contract.md) の**補助突合で救済しない方針と整合**（time/distance/finish/winner 類似で別馬行へ接続しない）。

### 2026-05-29-URA との比較

| 指標 | URA(5/29) | OOI(5/22) | 評価 |
|---|---|---|---|
| match率 | 61.6% | 61.1% | **ほぼ同等** |
| no-result-file率 | 35.5% | 35.1% | **ほぼ同等** |
| no-result-match率 | 38.4% | 38.9% | **ほぼ同等** |
| name-miss | 4件 | 3件 | **同傾向** |
| ambiguous | 0件 | 0件 | **両方0** |
| year-inferred | 70件（14.4%） | 129件（23.2%） | **OOIが多い** |
| headCount統一 | 問題なし | 問題なし | **両方問題なし** |
| passingOrder補完率（race-level 旧記録） | 97.0% | 99.1% | 粗い指標 |
| passingOrder補完率（**horse-level 正基準**） | **253/299=84.6%** | **314/339=92.6%** | generator 実測。今後はこちらを採用 |

### 所見

- **2会場で match率が約61%で安定した。**
- **no-result-file率も約35%で安定**しており、**no-result-match の主因は results 在庫の範囲外**（2025年以前・未保存日）であることが2会場で裏付けられた。
- **name-miss は2会場とも racebook 誤紐付け疑いであり、表記ゆれではない。** OOI の year-inferred 23.2% は `大井 12.25→2025` 等の年末前年走が多く、前年走が results 窓外で no-result-file になりやすいことを示す。
- **ambiguous は2会場とも0**で、**保守的な parent horseName 突合方針は妥当**。
- **headCount 統一に問題はない**（339/339 取得可）。
- **補助突合禁止、新フラグ `result-present-horse-absent` / `racebook-pastrace-suspect` の妥当性が補強された。**
- **本実装設計へ進む根拠は揃いつつある**が、**shared PUT・AK/KI 接続はまだ行わない**（本ドライランは読み取り検証のみ）。

---

## 10. AK / KI への影響範囲確認（読み取り専用結果）

- `recentHorseHistories` は AK / KI / shared の**どこにも未出現** → 新規 shared ファイルは純粋に追加的で、既存読み手のロードを壊さない。
- 現状の recentRaces 供給経路（**変更しない**）:
  - AK: `astro-site/src/lib/horseEnrichment.js`（`attachRecentRacesBeforeScoring`）/ racebook `pastRaces.slice(0,5)`。
  - KI: entries優先 → racebook フォールバック / `astro-site/src/utils/featureScores.js`。
- ドライランは読むだけ → AK/KI の表示・指数・印・買い目・過去走表示・`featureScores.js`・`computeImportance`・`HorseMainCard`・`RaceHorseSection` に一切影響しない。
- 将来 AK/KI がこの正本を読む接続は **Phase 4 以降の別タスク**（本ドライラン範囲外）。差別化（AK=3項目/KI=6項目）は維持。

---

## 11. 禁止事項（本ドライラン中）

- 実装 / commit / push / PR作成 / workflow_dispatch / shared PUT 禁止。
- 既存JSON変更・手作業JSON補完禁止。
- analytics-keiba / keiba-intelligence / keiba-data-shared 変更禁止。
- `featureScores.js` / `computeImportance` / `HorseMainCard` / `RaceHorseSection` / AI総合指数 / 印 / 買い目 / 予想本文 / 過去走表示 変更禁止。
- `scripts/` / `netlify/functions/` 変更禁止。
- 未追跡3ファイル（publish-prediction.mjs / build-feature-scores-once.mjs / enrich-past-races-once.mjs）は commit しない。

---

## 12. 次の停止ポイント

本設計の固定で停止する。次段（ドライランスクリプト作成・実行）は**マコさんの明示許可後**。
許可時の初手は **2026-05-29-URA 単独**の構造検証＋集計モードから。

**関連**: [nankan-recent-horse-histories-contract.md](nankan-recent-horse-histories-contract.md) / [nankan-past-races-audit.md](nankan-past-races-audit.md) / [cross-project-safety-rules.md](cross-project-safety-rules.md)
