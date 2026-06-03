# 南関 recentHorseHistories 本実装計画

**作成日**: 2026-06-02
**対象repo**: keiba-data-shared-admin（中心） / keiba-data-shared（保存先・別許可） / analytics-keiba・keiba-intelligence（読み手・別Phase）
**前提ドキュメント**: [nankan-recent-horse-histories-contract.md](nankan-recent-horse-histories-contract.md)（契約v0 + §9.1突合追加ルール） / [nankan-recent-horse-histories-dryrun-design.md](nankan-recent-horse-histories-dryrun-design.md)（ドライラン設計 + §9.2〜9.4実測） / [cross-project-safety-rules.md](cross-project-safety-rules.md)

---

## 1. ステータス

- **本ファイルは本実装前の「実装計画」である。** 生成フロー設計の固定が目的。
- **実装・JSON生成・shared PUT・workflow_dispatch・AK/KI接続はまだ行わない。**
- **2会場ドライラン結果に基づく**:
  - `2026-05-29-URA`：**match率 61.6%**
  - `2026-05-22-OOI`：**match率 61.1%**
  - 2会場で match率約61%・no-result-file率約35%・ambiguous 0 が安定再現。name-miss は表記ゆれでなく racebook 誤紐付け疑い。

---

## 2. 前提

- **racebook を base** とする。
- **results を enrichment** とする。
- **entries は初回実装では必須にしない**（2026/03〜04で停止、7ファイルのみ）。
- **parent horseName 完全/正規化一致を必須ゲート**とする。
- **補助突合は禁止**（time/distance/finish/winner 類似だけで別馬行へ接続しない）。
- **racebook-only を許容する**（results 補完できなくても recentRace を残す）。
- **`dataQualityFlags` で補完可否・疑義を可視化**する（無理に50 baselineで埋めない思想）。
- **shared PUT / AK/KI接続 / Feature Importance改善は別Phase**。

---

## 3. 生成対象

- **初回は単日単場**で生成・検査する。
- **初回対象案は `2026-05-29-URA`**。
- 安定後に**複数日・複数場へ拡大**（`--date`/`--venue` の1ファイル単位を基本粒度とし、既存 racebook/results/computer の `YYYY-MM-DD-{VENUE}` に揃える）。
- **results未確定日（例 `2026-06-01-FUN`）**: 当日結果は使わず、**過去走の推定日付に対応する results のみ参照**する。
- **当日結果を recentRaces に混ぜない**（±1日マージ事故と同じ思想。当日 racebook の自馬の当日結果を過去走へ流し込まない）。

---

## 4. 入力ファイル

| ソース | 役割 | 不在/不整合時 |
|---|---|---|
| racebook（当日） | **base・必須** | 無ければ**停止**（生成しない） |
| results（過去日付・動的ロード） | **enrichment** | 無ければ `no-result-file` → racebook-only |
| entries | **初回は使わない** | 参照しない（将来Phase） |

- **results があるが親馬名不在** → `result-present-horse-absent` + `racebook-pastrace-suspect` を付与し、**racebook-only として残す**（救済しない）。

---

## 5. 突合ルール

- **基本キー**: `推定date + venueCode + parent horseName`。
- **horseName 正規化**は **NFKC + 空白/中黒除去**を基本とする。
- **`distanceMeters` は検証補助**（results `"1300"` ↔ racebook `"ダ1300"` を数値化して照合。名前一致の確証上積みに使い、名前不一致を距離一致で覆さない）。
- **time / distance / finish / winner 類似だけでは採用しない**。
- **`winner` は弱い補助情報**（約6字切捨あり。前方一致のみで採用しない）。
- **ambiguous（複数候補・低信頼）は採用しない** → `match-ambiguous`、racebook-only。
- **nameExact（完全/正規化一致）が無い場合は results 値を採用しない**（必須ゲート）。

---

## 6. 出力JSON設計

- **保存先案**: `nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json`（既存命名と統一）。

```jsonc
{
  "schemaVersion": "nankan-recent-horse-histories-v0",
  "category": "nankan",
  "date": "2026-05-29",
  "venue": "URA",
  "venueName": "浦和",
  "source": {
    "base": "racebook",
    "enrichment": ["results"],
    "generatedAt": "<ISO8601>",
    "generator": "enrich-recent-horse-histories@v0"
  },
  "races": [
    {
      "raceNumber": 1,
      "raceName": "...",
      "horses": [
        {
          "horseNumber": 6,
          "horseName": "...",
          "recentRaces": [
            {
              "date": "2025-07-10",
              "yearInferred": true,
              "venue": "川崎",
              "venueCode": "KAW",
              "raceNumber": 5,
              "raceName": "...",
              "distance": "ダ900",
              "distanceMeters": 900,
              "surface": "ダート",
              "trackCondition": "良",
              "headCount": 10,
              "horseNumber": 3,
              "finish": 7,
              "popularity": 4,
              "bodyWeight": 395,
              "jockey": "...",
              "carriedWeight": 54,
              "time": "0:59.4",
              "passingOrder": "8-7-7-7",
              "last3f": "40.4",
              "margin": "クビ",
              "opponentName": "...",
              "resultMatched": true,
              "source": "results-enriched",
              "sourcePriority": 2,
              "resultMatchKey": "2025-07-10|KAW|<horseName>",
              "dataQualityFlags": ["year-inferred", "source-results-enriched"]
            }
          ]
        }
      ]
    }
  ]
}
```

設計確定事項:
- **`headCount` に統一**（results `races[].horses`=出走頭数）。**`fieldSize` は出力しない**。
- **racebook-only の recentRace も残す**（落とさない。補完不能項目は `null` + flags）。
- 各 recentRace に **`resultMatched` / `source` / `sourcePriority`（2=results, 3=racebook）/ `yearInferred` / `resultMatchKey` / `dataQualityFlags`** を付与。

---

## 7. dataQualityFlags（必須設計）

### 来歴系
- `source-results-enriched` — results 突合で補完済み
- `source-racebook-only` — racebook の値のみ

### 突合・日付・会場系（最優先で出力）
- `no-result-match` — 突合先 results が見つからない
- `no-result-file` — 推定date+venueCode の results ファイルが無い
- `outside-nankan` — 南関4場以外の前走
- `result-present-horse-absent` — results は存在するが parent horseName が results に無い
- `racebook-pastrace-suspect` — 過去走行と親馬の対応自体が疑わしい（racebook 誤紐付け）
- `horse-name-mismatch` — 表記ゆれ・正規化差分（**上記2フラグとは別物**）
- `match-ambiguous` — 突合候補が複数 or 低信頼
- `year-inferred` — venue 日付の年を前年推定で補完

### 項目欠損系（**補完後の実効値で付与**）
- `no-track-condition` / `no-corner-order` / `no-popularity` / `no-margin` / `no-field-size` / `no-surface`

### 補足
- **欠損フラグは補完後の実効値で付ける**。
- **matched で results から補完できた項目には欠損フラグを付けない**（trackCondition/popularity/margin/headCount/surface は results 供給で解消、corner-order は cornerData 欠落分のみ残す）。
- **`no-field-size` はフラグ名として残すが、出力フィールドは `headCount`**（フラグ名と出力フィールド名は別物）。

---

## 8. 保存前検査（stdout summary で必ず出す）

| 検査項目 | 備考 |
|---|---|
| pastRaces総件数 | 入力 |
| recentRaces出力件数 | 出力 |
| matched件数 | |
| match率 | 2会場基準 約61% から大きく乖離しないか |
| no-result-match率 | 約38% 基準 |
| no-result-file率 | 約35% 基準 |
| name-miss件数 | suspect flag 付与済か |
| ambiguous件数 | 採用0か |
| headCount欠損件数 | matched分の欠損数 |
| passingOrder欠損件数 | **horse-level**（馬番が cornerData に現れず derivePassingOrder=null）。§8.1 |
| unknown venue件数 | **0** 期待。>0なら全件列挙 |
| time正規化失敗件数 | **0** 期待。>0なら全件列挙 |
| 必須項目欠損件数 | schemaVersion/date/venue/races/horses/recentRaces |
| 入力件数と出力件数の差分 | racebook-only含め原則同数 |

- **異常時（閾値超過・unknown venue>0・time失敗>0・件数不自然減）は書き込みに進まない**（stdout 警告のみ）。

---

## 9. 安全装置

- **初回は stdout summary のみ**（書き込みなし）。
- **`--dry-run` を既定ON**。
- **`--out` / `--write-local` は別許可**（リポジトリ外 or `.gitignore` 済の一時領域に限定、追跡対象に出さない）。
- **shared PUT は別許可**。
- **workflow_dispatch は別許可**。
- **AK/KI接続は別Phase**。
- **`git add .` / `git add -A` 禁止**（個別 path のみ）。
- **既知未追跡3ファイルを巻き込まない**（`netlify/functions/publish-prediction.mjs` / `scripts/build-feature-scores-once.mjs` / `scripts/enrich-past-races-once.mjs`）。
- **AI総合指数・印・買い目・予想本文・過去走表示は触らない。**

---

## 10. 実装単位案

- **配置**: `scripts/` 配下（例 `scripts/enrich-recent-horse-histories.mjs`）。
- **`netlify/functions` には置かない**（本番 dispatch 経路に混ぜない。当日 dispatch 単独新規実装をしない原則と整合）。
- **CLI引数案**:

| 引数 | 意味 | 既定 |
|---|---|---|
| `--date` | 対象開催日 YYYY-MM-DD | 必須 |
| `--venue` | 3文字コード（OOI/KAW/FUN/URA） | 必須 |
| `--dry-run` | stdout サマリのみ・書き込みなし | **既定ON** |
| `--out <path>` | ローカル一時出力先 | 任意（別許可） |
| `--write-local` | ローカルJSON生成を許可 | 既定OFF（別許可） |
| `--push` | shared PUT | **将来・別許可まで未実装または無効** |

---

## 10.1. Phase 2 stdout generator 詳細設計

> Phase 2（stdout dry-run generator）の実装前詳細設計。**本節は設計のみ。コード・JSON生成・PUT・dispatch は行わない。**

### 1. generator 配置案

- **配置**: `scripts/enrich-recent-horse-histories.mjs`。
- **`netlify/functions` には置かない**。理由:
  - 本番 dispatch 経路（pair-guard / prediction-updated）に混ぜない。
  - オフラインCLIのため **HTTPトリガ不要**。
  - 誤 PUT / 誤 dispatch を構造的に避ける。
- **既存 scripts との衝突なし**（`compare-past-races.mjs` / `verify-past-races.mjs` 等とは別名・別責務）。

### 2. CLI 仕様

| 引数 | 必須/既定 | 挙動 |
|---|---|---|
| `--date` | **必須** | 対象開催日 `YYYY-MM-DD`。不正形式は usage 表示 + exit 1 |
| `--venue` | **必須** | `OOI`/`KAW`/`FUN`/`URA`。それ以外は exit 1 |
| `--dry-run` | **既定ON** | stdout summary のみ・書き込みなし |
| `--out <path>` | 任意 | 出力先候補。**単独では保存しない** |
| `--write-local` | 既定OFF | 明示時のみローカル保存を許可。Phase 2 では未使用または無効でもよい |
| `--push` | — | **Phase 2 では未実装**。指定されたら明示エラーで exit 1 |
| `--help` / `-h` | — | usage 表示 + exit 0 |

**安全方針**:
- `--dry-run` は既定ON。
- `--out` 指定だけでは保存しない。**書き込みには `--write-local` が必須**。
- `--push` は Phase 2 では必ずエラー。
- `--dry-run` と `--write-local` が同時指定された場合は**安全側で dry-run 維持・書き込まない**（＋警告）。

### 3. 関数分割案

| 関数 | 種別 |
|---|---|
| `parseArgs` | 純粋 |
| `loadRacebook` | **I/O** |
| `loadResultsIndex` | **I/O** |
| `parsePastRaceDate` | 純粋 |
| `normalizeVenue` | 純粋 |
| `normalizeHorseName` | 純粋 |
| `normalizeDistanceMeters` | 純粋 |
| `normalizeTime` | 純粋 |
| `buildResultLookup` | 純粋 |
| `derivePassingOrder` | 純粋 |
| `matchPastRaceToResult` | 純粋（突合判定＋フラグ生成の単一責任点） |
| `buildRecentRace` | 純粋 |
| `buildRecentHorseHistories` | 合成 |
| `collectSummary` | 純粋 |
| `validateOutput` | 純粋 |
| `printSummary` | **I/O** |
| `maybeWriteLocal` | **I/O** |
| `main` | 合成 |

- **I/O は `loadRacebook` / `loadResultsIndex` / `printSummary` / `maybeWriteLocal` の4関数に限定**。残りは純粋関数。

### 4. 突合ロジック（判定木）

```
1. parsePastRaceDate → 失敗: NO_DATE（resultsロードしない）
2. normalizeVenue:
   - outside → OUTSIDE
   - unknown → UNKNOWN_VENUE（unknown-venue記録, NO_FILE扱い）
   - venueCode あり → 次へ
3. resultsFile load(date, venueCode):
   - null → NO_FILE
4. lookup(normalizeHorseName(parent)):
   - 0件 → HORSE_ABSENT
   - 2件以上 → AMBIGUOUS
   - 1件 → 距離矛盾チェックへ
5. distanceMeters(past) と distanceMeters(cand) が両方既知で不一致:
   - 不一致 → AMBIGUOUS
   - それ以外 → MATCHED
```

**確定ルール**:
- **parent horseName 完全/正規化一致が必須ゲート**。
- **基本キー**: `date + venueCode + normalized parent horseName`。
- **`distanceMeters` は降格専用の検証補助**（一致を増やす方向には使わない。名前一致でも距離矛盾は AMBIGUOUS に降格）。
- **time / distance / finish / winner 類似だけでは採用しない**。
- **ambiguous は採用しない**（results 値を取り込まず racebook-only）。
- **`horse-name-mismatch` は正規化一致で救済できた場合だけ**付与（`result-present-horse-absent` とは別物）。

### 5. status 分類

| status | 意味 | source | 主フラグ |
|---|---|---|---|
| `MATCHED` | 名前一致・距離矛盾なし | results-enriched | `source-results-enriched` |
| `HORSE_ABSENT` | results在・馬名不在 | racebook-only | `result-present-horse-absent` + `racebook-pastrace-suspect` |
| `AMBIGUOUS` | 複数候補 or 距離矛盾 | racebook-only | `match-ambiguous` |
| `NO_FILE` | results ファイル無 | racebook-only | `no-result-file` |
| `OUTSIDE` | 南関4場以外 | racebook-only | `outside-nankan` |
| `NO_DATE` | 日付解釈不能 | racebook-only | `no-date` |

### 6. dataQualityFlags 付与順序（固定）

1. `source-results-enriched` / `source-racebook-only`
2. `no-result-match`
3. `no-result-file` / `outside-nankan` / `result-present-horse-absent` / `racebook-pastrace-suspect` / `match-ambiguous`
4. `horse-name-mismatch`
5. `year-inferred`
6. `no-track-condition` / `no-corner-order` / `no-popularity` / `no-margin` / `no-field-size` / `no-surface`

**補足**:
- source系は必ず先頭・排他で1つ。
- **欠損フラグは補完後の実効値で付与**（MATCHED で results 供給された項目には付けない。corner-order は passingOrder null 時のみ）。
- **`no-field-size` はフラグ名として残すが、出力フィールドは `headCount`**。

### 7. stdout summary 仕様

必ず出す項目:
- 入力ファイル（racebook パス）
- results 動的ロード数
- races / horses / pastRaces
- output recentRaces 件数
- matched / match率
- no-result-match / no-result-match率
- no-result-file
- outside-nankan
- name-miss（= result-present-horse-absent）
- ambiguous
- year-inferred
- no-date
- unknown-venue（>0 は全件列挙）
- time-fail（>0 は全件列挙）
- headCount欠損（matched）
- passingOrder欠損（matched）
- flags集計
- validateOutput PASS/FAIL
- 書込モード（dry-run / write-local / skipped）

### 8. validateOutput 設計

**fail（1つでもあれば書き込み不可）**:
- 入力pastRaces総件数 != 出力recentRaces件数
- races/horses 構造欠落
- schemaVersion / date / venue / venueName 欠落
- MATCHED で headCount 欠損
- ambiguous なのに results-enriched になっている
- 入力より出力件数が減っている

**warn（書き込みは止めないが強調）**:
- unknown-venue > 0
- time正規化失敗 > 0
- match率 < 30%
- no-result-file率 >= 70%

### 8.1. passingOrder の定義（計測基準の確定 2026-06-02）

> Phase 2 generator 実装後の dry-run で、docs §9.2/§9.4 の passingOrder 値（race-level）と generator 値（horse-level）に差が出たため、定義を確定する。

- **passingOrder 補完率は horse-level で測る。**
- **horse-level とは**: matched した馬の**当時馬番が results の `cornerData` 各コーナー `order` 配列に実際に現れ、`derivePassingOrder` が非null を返す**こと。
- **race-level の cornerData 存在だけでは補完成功扱いにしない**（=「レースに cornerData がある」だけでは passingOrder を埋めたことにしない）。
- 保存前検査・stdout summary では **horse-level の passingOrder 欠損数**を表示する（`passingOrder欠損(matched)`）。
- **passingOrder 欠損は `validateOutput` では fail にしない。warn / summary 対象**にとどめる（後方追走で各コーナーに現れない馬は正常に発生し得るため）。
- 実測差（race-level → horse-level）: URA 290/299→**253/299**、OOI 336/339→**314/339**（docs §9.2/§9.4 訂正注記）。

### 9. preview 方針

- **Phase 2 では full JSON dump しない。summary のみ。**
- 将来 `--preview` を追加する余地は残すが、**作る場合も1Rまたは1頭限定**。全件 dump はしない。

### 10. 未確定論点への暫定方針

| 論点 | 暫定方針 |
|---|---|
| match率 warn 閾値 | **30%未満** |
| no-result-file率 warn 閾値 | **70%以上** |
| `racebook-pastrace-suspect` | Phase 2 では **HORSE_ABSENT 時に付与** |
| `--out` 既定パス | **Phase 3 で確定** |
| horseName 正規化 | **NFKC + 空白除去 + 中黒除去** |
| `[J]` 等プレフィックス | Phase 2 では**検出・summary表示のみ**、自動除去は保留 |
| recentRaces 最大保持件数 | **racebook由来をそのまま保持** |
| `generatedAt` | **生成時刻の ISO 文字列** |
| unit test | **Phase 2 実装後、必要に応じて別PR** |

---

## 10.2. Phase 3 ローカルJSON生成 詳細設計

> Phase 3（ローカル一時JSON生成）の実装前詳細設計。**本節は設計のみ。`--write-local` 実装・JSON生成・shared PUT・dispatch・AK/KI接続は行わない。**

### 確定方針（重要）

- **Phase 3 の出力先は admin repo 内 `tmp/` 配下のみ許可**。
- **repo外 `/tmp` は今回は許可しない。**
- **keiba-data-shared 実パスへの書き込みは禁止。**
- **既存ファイル上書きは禁止**（将来 `--overwrite` を検討）。
- **`--write-local` 実装はまだしない。**

### 1. Phase 3 の目的

- shared PUT 手前の**ローカル一時JSON生成段階**。
- 生成JSONを **jq 等で検査するための段階**。
- **AK/KI接続はまだ行わない。** **shared PUT はまだ行わない。** **workflow_dispatch はまだ行わない。**

### 2. 出力先設計（A/B/C 比較）

| 案 | パス | 誤commitリスク | 実保存先との近さ | 検査しやすさ | .gitignore 必要性 | Phase4/5移行性 |
|---|---|---|---|---|---|---|
| A | repo外 `/tmp/nankan-recentHorseHistories/...` | 極小 | 低 | やや低 | 不要 | 中 |
| **B（推奨）** | admin内 `tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json` | **極小（`tmp/` は既に .gitignore 済）** | **高** | **高** | **不要** | **高** |
| C | shared 実パス `keiba-data-shared/nankan/recentHorseHistories/...` | 高（禁止事項） | 同一 | 高 | 別repo | — |

**推奨案: B**（`tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json`）。理由:
- admin の `.gitignore` に **`tmp/` が既に登録済み**。
- 誤commitリスクが低い。
- 実保存先に近い構造を再現できる。
- jq/ls で検査しやすい。
- keiba-data-shared 本体を書き換えない。
- Phase 5 では **`tmp/` プレフィックスを外すだけ**で shared 相対パスへ移行しやすい。

### 3. CLI 仕様（Phase 3 案）

- **`--write-local` を有効化する。**
- **`--out` は任意。**
- `--out` 未指定時の既定パス: `tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json`。
- `--out` を指定する場合も、**admin repo 内 `tmp/` 配下でなければ fail**。
- **Phase 3 では許可ディレクトリは admin repo 内 `tmp/` 配下のみ**。**repo外 `/tmp` は今回は許可しない。**
- `--dry-run` と `--write-local` が同時指定された場合は **dry-run 優先で書き込まない**。
- `--push` は引き続き未実装・exit 1。
- **`--write-local` 実行時も validateOutput PASS が必須**（FAIL なら書き込まず exit 2）。

### 4. 書き込み前 validation

**必須 fail（1つでも該当で書き込み不可）**:
- validateOutput FAIL
- 入力pastRaces総件数 != 出力recentRaces件数
- schemaVersion / date / venue / venueName 欠落
- races / horses / recentRaces 構造欠落
- MATCHED で headCount 欠損
- ambiguous なのに results-enriched
- 出力先が keiba-data-shared の本番パス
- 出力先が git tracked path
- 出力先が admin repo 内 `tmp/` 配下以外
- 出力先ファイルが既に存在する
- `--push` 指定

**warn（書き込みは止めないが強調）**:
- unknown-venue > 0
- time正規化失敗 > 0
- match率 < 30%
- no-result-file率 >= 70%
- passingOrder欠損率 >= 30%（horse-level、§8.1）

#### time-fail の実測知見（2026-06-02 / 4場 write-local 検証）

- **URA / OOI では time正規化失敗は 0件**だった。
- **FUN / KAW の追加 write-local 検証で time正規化失敗が発生**した:
  - FUN 2026-05-08: **time-fail 9件**
  - KAW 2026-05-15: **time-fail 8件**
- 失敗サンプル: `"11頭 5枠"` / `"10頭 6枠 433"` / `"12頭 1枠 437"`。
- **time フィールドに「頭数・枠・馬体重」らしき文字列が混入**している（タイム値ではない）。
- これは **FUN/KAW の racebook pastRaces パースに venue 依存の崩れがある可能性**を示す。
- generator は**クラッシュせず warn として可視化**し、**生値保持**で処理できている（[§9.5 dryrun-design](nankan-recent-horse-histories-dryrun-design.md) 参照）。
- **validateOutput では time-fail は fail ではなく warn のまま**とする。
- **Phase 4 では time-fail 件数・サンプル列挙・閾値評価を保存前検査に含める。**

### 5. 出力JSON確認方法（jq）

```bash
F=tmp/nankan/recentHorseHistories/2026/05/2026-05-29-URA.json
# トップ構造
jq '{schemaVersion, date, venue, venueName, races: (.races|length)}' "$F"
# recentRaces 総数（= 入力 pastRaces と一致するか）
jq '[.races[].horses[].recentRaces[]] | length' "$F"
# source 内訳
jq '[.races[].horses[].recentRaces[].source] | group_by(.) | map({(.[0]): length}) | add' "$F"
# dataQualityFlags 集計
jq '[.races[].horses[].recentRaces[].dataQualityFlags[]] | group_by(.) | map({(.[0]): length}) | add' "$F"
# headCount が存在し fieldSize が存在しないこと
jq '[.races[].horses[].recentRaces[] | keys] | add | unique | map(select(.=="headCount" or .=="fieldSize"))' "$F"
# result-present-horse-absent / racebook-pastrace-suspect 件数
jq '[.races[].horses[].recentRaces[].dataQualityFlags[] | select(.=="result-present-horse-absent" or .=="racebook-pastrace-suspect")] | length' "$F"
```

確認観点:
- `schemaVersion` / `date` / `venue` / `venueName` / `races件数` が正しい。
- recentRaces 総数 == 入力 pastRaces 件数。
- `source-results-enriched` / `source-racebook-only` 件数が dry-run summary と一致。
- **`headCount` が存在し `fieldSize` が存在しない**こと（`no-field-size` はフラグ名としてのみ存在）。
- `result-present-horse-absent` / `racebook-pastrace-suspect` が name-miss 件数分出ている。

### 6. 安全装置

- **`git add .` / `git add -A` 禁止。**
- 生成JSONは **`tmp/` 配下のみ**。`tmp/` は `.gitignore` 対象。
- **keiba-data-shared 本体には書き込まない。**
- **shared PUT は別Phase。** **workflow_dispatch は別Phase。** **AK/KI接続は別Phase。**
- 生成後に **`git status` で tracked 増分がないこと**を確認。
- **生成先パスを stdout summary に必ず表示。**
- **既存ファイルがある場合は上書きせず fail。**

### 7. 未確定論点への暫定方針

| 論点 | 暫定方針 |
|---|---|
| 既定出力先 | `tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json` |
| 許可ディレクトリ | admin repo 内 `tmp/` 配下のみ |
| repo外 `/tmp` | 今回は許可しない |
| tracked path 判定 | `git ls-files --error-unmatch` 相当で拒否 |
| passingOrder欠損 warn閾値 | 30%以上 |
| 既存ファイル上書き | Phase 3 では禁止。将来 `--overwrite` を検討 |
| `generatedAt` | 生成時刻 ISO |

### 8. まだやらないこと（明示）

- `--write-local` 実装しない
- JSON生成しない
- shared PUT しない
- workflow_dispatch しない
- AK/KI接続しない
- Feature Importance 改善に入らない

---

## 10.3. Phase 4 保存前検査 詳細設計

> Phase 4（shared 保存前検査 preflight）の実装前詳細設計。**本節は設計のみ。validator script 実装・JSON生成・shared PUT・dispatch・AK/KI接続は行わない。**

### 1. Phase 4 の目的

- **shared PUT 前の保存前検査（preflight）を自動化・強化する段階。**
- Phase 3 の tmp JSON を対象に、**shared へ出してよいかを判定**する。
- **shared PUT はまだしない。workflow_dispatch はまだしない。AK/KI接続はまだしない。**
- **Phase 5（PUT）への唯一のゲート**にする。

### 2. 検査対象

- `tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json`
- generator の stdout summary
- racebook 入力 / results enrichment 状況 / `dataQualityFlags` / 出力JSON構造
- **環境健全性**: keiba-data-shared が clean か / tmp配下のみ生成か / git に生成物が出ていないか

### 3. 判定ステータス（3段階）

| ステータス | 意味 |
|---|---|
| **PASS** | 構造・件数・保存前条件すべてOK |
| **HOLD** | 構造はOKだが time-fail など品質上の人間確認が必要（PUT 前に承認必須） |
| **FAIL** | 保存禁止条件に該当し、PUT 不可 |

### 4. 必須 pass 条件

- JSON が存在する
- JSON parse 可能
- `schemaVersion === "nankan-recent-horse-histories-v0"`
- `date` / `venue` / `venueName` が存在
- `races[]` / `horses[]` / `recentRaces[]` 構造が存在
- recentRaces 総数 == 入力 pastRaces 総数
- `source-results-enriched` + `source-racebook-only` == recentRaces 総数
- MATCHED で headCount 欠損 0
- 出力JSONキーに `fieldSize` が存在しない
- `headCount` が出力される
- ambiguous が results-enriched になっていない
- keiba-data-shared 本体に変更がない
- tmp/ 配下のみの生成である
- git status に JSON生成物が tracked/untracked として出ていない

### 5. warn 条件

- time-fail > 0
- unknown-venue > 0
- match率 < 30%
- no-result-file率 >= 70%
- passingOrder欠損率 >= 30%（horse-level）
- `result-present-horse-absent` が多い
- `racebook-pastrace-suspect` が多い
- `no-surface` が多い
- `no-track-condition` が多い
- `no-popularity` が多い
- `no-margin` が多い

### 6. time-fail 検査

- **time-fail は fail ではなく warn。**
- 件数を必ず表示。**サンプルを最大10件表示**。
- サンプルには **horseName / raceNumber / raw time / date / venue** を含める。
- `"11頭 5枠"` のような**頭数・枠・馬体重混入を検出**する（パターン例: `/\d+頭/` または `/\d+枠/`）。
- **time-fail率 >= 5% で強warn**。
- **time-fail率 >= 10% で HOLD**。
- HOLD は構造OKだが Phase 5 PUT 前に**人間確認必須**の状態。

### 7. 4場別の暫定基準（実測ベース）

| 場 | 日付 | match率 | time-fail |
|---|---|---|---|
| URA | 2026-05-29 | 61.6% | 0 |
| OOI | 2026-05-22 | 61.1% | 0 |
| FUN | 2026-05-08 | 44.1% | 9 |
| KAW | 2026-05-15 | 36.6% | 8 |

- **KAW/FUN の match率が低いだけでは fail にしない。**
- **no-result-file が主因なら racebook-only を許容。**
- **time-fail は warn・サンプル表示で扱う。件数次第で強warn/HOLD。**

### 8. 保存禁止条件（FAIL）

- JSON parse 不可
- schemaVersion 不一致
- recentRaces 総数不一致
- MATCHED で headCount 欠損
- `fieldSize` キーが出力されている
- ambiguous が results-enriched として採用されている
- keiba-data-shared に変更がある
- 出力先が tmp/ 配下ではない
- JSON生成物が git tracked/untracked に出ている
- `--push` 指定
- validateOutput FAIL

### 9. 実装方式比較

| 観点 | A. generator に `--preflight` 統合 | B. 別 validator script |
|---|---|---|
| 実装コスト | 低い | 中 |
| 生成と検査 | 混在する | **分離できる** |
| 冪等な再検査 | 不向き（生成し直し要） | **既存 tmp JSON を書き込みなしで再検査可** |
| tmp 汚染リスク | 検査時に tmp を汚す可能性 | **入力を読むだけで安全** |
| generator 回帰リスク | あり | **低い** |
| 不正パス拒否 | 可 | **tmp配下以外/shared実パス指定は即FAIL** |

**推奨: B. 別 validator script**
```
scripts/validate-recent-horse-histories.mjs --file=tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-URA.json
```

### 10. 自動化対象の検査

- top構造
- recentRaces総数
- source内訳
- dataQualityFlags集計
- headCount/fieldSizeキー検査
- time-fail件数
- time-failサンプル
- suspect系件数（result-present-horse-absent / racebook-pastrace-suspect）
- no-surface / no-track-condition / no-popularity / no-margin件数

### 11. Phase 5 へ進む条件

- 4場または複数日で **preflight PASS**
- HOLD がある場合は**人間承認済み**
- **FAIL 0**
- warn は**人間確認済み**
- **time-fail サンプル確認済み**
- shared が clean
- tmp JSON の件数・スキーマ確認済み
- **shared PUT は別PR/別許可**
- **workflow_dispatch はさらに別許可**

### 12. まだやらないこと（明示）

- Phase 4 実装しない
- validator script 作らない
- shared PUT しない
- workflow_dispatch しない
- AK/KI接続しない
- Feature Importance 改善に入らない
- keiba-data-shared を変更しない

---

## 10.4. Phase 5 shared PUT 詳細設計

> 本節は設計のみ。push script 実装・shared PUT 実行・workflow_dispatch・AK/KI接続は含まない。

### 1. Phase 5 の目的

- Phase 3 で生成し、Phase 4 validator で **PASS** した tmp JSON を `keiba-data-shared` に保存する段階。
- **shared PUT 経路を初めて作る段階**。
- ただし **workflow_dispatch はまだ行わない**。
- **AK/KI接続はまだ行わない**。
- **Feature Importance 改善にも入らない**。
- 「生成 → 検査 → 保存」の最後の1段を**安全に確立する**。

### 2. shared 保存先パス（正式）

```
keiba-data-shared/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json
```

例:
```
nankan/recentHorseHistories/2026/05/2026-05-29-URA.json
```

方針:
- racebook / results / predictions とは**別 namespace**。
- 既存読者がいないため **additive**（壊す対象ゼロ）。
- tmp 側 `tmp/nankan/recentHorseHistories/YYYY/MM/...` と **1対1対応**。

### 3. 初回対象

初回は以下 **1ファイルのみ**。

```
2026-05-29-URA
```

理由:
- match率 **61.6%**
- **time-fail 0**
- validator **PASS 実績あり**
- FUN/KAW は time-fail があるため**初回対象にしない**
- OOI も候補だが、初回は**最も検証が厚い URA** を選ぶ
- **1日・1会場・1ファイル**で保存経路を確立する

### 4. tmp JSON生成 → validator → shared保存 の流れ

1. `generator --write-local` で tmp JSON を生成
2. `validator --file=tmp/...` で preflight
3. validator **PASS の場合のみ** shared保存候補
4. **HOLD / FAIL の場合は保存しない**
5. push 経路は **validator PASS を内部で再確認**する
6. **GitHub Contents API で create-only PUT**
7. 保存後に **GET して内容一致を確認**
8. **dispatch はしない**

### 5. PASS / HOLD / FAIL の扱い

| 判定 | shared 保存 |
|---|---|
| **PASS** | 保存を**許可** |
| **HOLD** | **保存しない**。人間確認後に**別許可**が必要 |
| **FAIL** | **保存禁止** |

- **自動で HOLD を進めない**。
- **自動で FAIL を進めない**。

### 6. 既存ファイル上書き禁止

- Phase 5 初回は **create-only**。
- 保存先が既に存在したら**中止**。
- GitHub Contents API で**既存ファイル確認**。
- **sha を使った上書き更新は実装しない**。
- 再生成・更新が必要な場合は**別 Phase で設計**する。

### 7. shared 保存前チェック（必須ゲート）

- validator 判定 = **PASS**
- `keiba-data-shared` が **clean**
- 保存先パスが `nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json` に一致
- 保存先が**未存在**
- `schemaVersion` が `nankan-recent-horse-histories-v0`
- `date` / `venue` / `venueName` が存在
- `source-results-enriched` + `source-racebook-only` = **recentRaces 総数**
- tmp ファイルが admin repo 内 **`tmp/` 配下**
- tmp JSON が **git に露出していない**

### 8. shared 保存後チェック

- PUT レスポンスが**成功**
- **commit sha を取得**
- 保存先を GET して **200**
- 取得 content を decode して **tmp JSON と一致確認**
- 取得 JSON を parse して **validator 相当の検査**
- shared 側に**意図した1ファイルだけが増えた**こと
- **dispatch が発火していないことを明示確認**

### 9. shared commit / push 方針

**推奨: GitHub Contents API PUT = 1コミットで完結**

理由:
- 既存 save 系 function と**同系統**
- ローカル `keiba-data-shared` working tree を**汚さない**
- `git add .` の事故を避けられる
- **create-only PUT に限定しやすい**

**非推奨: ローカル shared を編集 → `git add` → commit → push**

理由:
- ローカル mutation が増える
- 誤 add リスクが増える
- clean 前提が崩れやすい

### 10. dispatch 禁止

- `repository_dispatch` **禁止**
- `workflow_dispatch` **禁止**
- `prediction-updated` など**既存 dispatch 経路に触れない**
- dispatch は **Phase 6 以降、別許可**

### 11. AK/KI 接続禁止

- analytics-keiba **変更禁止**
- keiba-intelligence **変更禁止**
- `recentHorseHistories` **読み取り実装禁止**
- AK/KI接続は **Phase 6 以降、別設計**

### 12. 実装方式比較

| 案 | 内容 | 評価 |
|---|---|---|
| **A. generator に `--push` を実装** | 生成と shared 書き込みが結合する / 誤 PUT リスクが増える / 現状 `--push` exit 1 の安全性を崩す | **非推奨** |
| **B. 新規 push 専用スクリプト** `scripts/push-recent-horse-histories.mjs --file=tmp/...` | generator / validator を壊さない / validator PASS を必須ゲートにできる / shared PUT だけを隔離できる / dispatch を構造的に排除しやすい | **推奨** |
| **C. Netlify function** | HTTP トリガや UI 経路が絡む / 今回の手動・限定 PUT には過剰 | **非推奨** |

**推奨: B. 新規 push 専用スクリプト**

### 13. 実行者

- `GITHUB_TOKEN_KEIBA_DATA_SHARED` が **Claude 実行環境に届かない可能性**がある。
- **実 PUT はマコさんのターミナルで実行する前提**。
- Claude は **plan / dry-run / PUT 直前確認まで**。
- **実 PUT は明示許可後のみ**。

### 14. Phase 6 へ進む条件

- 初回 URA が shared に **1ファイル保存**される
- 保存後 **GET 200**
- **tmp JSON と shared JSON が一致**
- **validator 相当検査 PASS**
- shared 側で**意図した1ファイルだけが増えている**
- **dispatch 未発火**
- **shared clean / commit 状態確認済み**
- 複数日・複数場展開は**別許可**
- AK/KI接続は**さらに別 Phase**

### 15. docs 追記後の次工程

- §10.4 を **commit/PR**
- merge 後に **push 専用スクリプト設計または実装**
- **実 PUT はまだ別許可**
- **shared PUT と dispatch は分離**

### 16. まだやらないこと（明示）

- push script 実装しない
- shared PUT しない
- workflow_dispatch しない
- repository_dispatch しない
- AK/KI接続しない
- Feature Importance 改善に入らない
- keiba-data-shared を変更しない
- JSON を shared 本体に保存しない

---

## 10.5. push専用スクリプト詳細設計

> 本節は設計のみ。`scripts/push-recent-horse-histories.mjs` の実装・shared PUT 実行・workflow_dispatch・repository_dispatch・AK/KI接続は含まない。§10.4（B案）の具体化。

### 1. 目的

- tmp JSON を `keiba-data-shared` の `recentHorseHistories` namespace へ保存する**専用スクリプト**。
- **generator / validator は壊さない**（別ファイル・呼び出すだけ）。
- **shared PUT だけを隔離する**。
- **dispatch はしない**。
- **AK/KI接続はしない**。

### 2. 対象スクリプト

```
scripts/push-recent-horse-histories.mjs
```

### 3. CLI 仕様

```
node scripts/push-recent-horse-histories.mjs --file=tmp/nankan/recentHorseHistories/2026/05/2026-05-29-URA.json
node scripts/push-recent-horse-histories.mjs --file=tmp/nankan/recentHorseHistories/2026/05/2026-05-29-URA.json --execute
```

方針:
- `--file` **必須**
- `--dry-run` **既定 ON**
- `--execute` が**ない限り PUT しない**
- `--execute` は**明示許可後のみ**
- `--dry-run` と `--execute` 同時指定時は **dry-run 優先**
- `--help` / `-h`
- `--file` は **admin repo 内 `tmp/` 配下のみ許可**
- shared 実パス指定は**禁止**
- 保存先 shared path は **file path から自動算出**
- **`--path` 任意指定は初回では持たない**

### 4. 保存先変換

```
tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json
        ↓
nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json
```

補足:
- **先頭 `tmp/` を剥がすだけ**（`path.relative(TMP_ROOT, absFile)`）。
- 算出後、`nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{OOI|KAW|FUN|URA}.json` に**一致するか再検証**。
- **namespace ガードを必須**にする。

### 5. 必須ゲート（dry-run / execute 共通）

- validator が **PASS**
- validator **HOLD / FAIL は中止**
- `keiba-data-shared` が **clean**
- tmp JSON が**存在**
- tmp JSON が **parse 可能**
- `schemaVersion` が `nankan-recent-horse-histories-v0`
- `source-results-enriched` + `source-racebook-only` = **recentRaces 総数**
- **headCount あり**
- **fieldSize なし**
- 保存先が **recentHorseHistories namespace に一致**
- 保存先が**未存在**
- JSON 生成物が **git に露出していない**
- `GITHUB_TOKEN_KEIBA_DATA_SHARED` が **execute 時に存在**

### 6. validator 呼び出し方針

- **validator を再実装しない**。
- `scripts/validate-recent-horse-histories.mjs --file=...` を**子プロセスで呼ぶ**。
- **exit 0 の PASS のみ許可**。
- **exit 3 の HOLD は中止**。
- **exit 2 の FAIL は中止**。
- 検査ロジックの**二重管理を避ける**（PASS の単一情報源は validator）。

### 7. GitHub Contents API 設計

**GET:**
```
https://api.github.com/repos/apol0510/keiba-data-shared/contents/{path}?ref=main
```
- **200**（既存ファイルあり）→ **中止**
- **404** → **create-only PUT へ**
- それ以外 → **中止**

**PUT:**
- **sha なし**
- **新規作成のみ**
- body:
  - `message`
  - `content`: base64(JSON)
  - `branch`: `main`

- repository: `apol0510/keiba-data-shared`
- branch: `main`
- commit message 案: `add nankan recentHorseHistories 2026-05-29 URA`

**PUT 後:**
- **GET して内容一致確認**
- **dispatch はしない**

### 8. dry-run / execute の扱い

**dry-run:**
- 全ゲート実行
- 保存先 path 表示
- PUT 予定内容表示
- **実 PUT しない**
- **token なしでも計画表示可**
- token がない場合、**execute 時に必要と表示**

**execute:**
- dry-run 相当ゲートを**再実行**
- **PASS 時のみ PUT**
- **PUT 後 GET 確認**
- **dispatch しない**

### 9. 初回対象

- **2026-05-29-URA**
- **1ファイルのみ**
- **4場一括はしない**
- **ループ / glob 展開機能を初回スクリプトに持たせない**

### 10. 保存後確認

- GET **200**
- content **decode**
- **tmp JSON とバイトまたは構造一致**
- shared に**意図した1ファイルだけ増えた**
- PUT レスポンスの **content.path が想定と一致**
- **dispatch 未発火**
- **AK/KI 変更なし**

### 11. 失敗時の exit コード

| 状況 | exit |
|---|---|
| 正常 dry-run / execute 成功 | **0** |
| validator HOLD | **3** |
| validator FAIL | **2** |
| 既存ファイルあり | **1** |
| token なし execute | **1** |
| その他ゲート不合格 | **2** |
| 保存後 GET 不一致 | **2**（ただし PUT 成功済みなので**要手動確認を強く表示**） |

### 12. token 方針

- dry-run では **token なしでも計画表示可**。
- execute では **`GITHUB_TOKEN_KEIBA_DATA_SHARED` 必須**。
- **Claude 実行環境に token が届かない可能性がある**。
- **実 PUT はマコさんのターミナルで実行する前提**。
- Claude は **plan / dry-run / PUT 直前確認まで**。

### 13. まだやらないこと（明示）

- push script 実装しない
- shared PUT 実行しない
- workflow_dispatch しない
- repository_dispatch しない
- AK/KI接続しない
- Feature Importance 改善に入らない
- keiba-data-shared を変更しない

---

## 10.6. push script --execute 有効化設計

> 本節は設計のみ。`scripts/push-recent-horse-histories.mjs` の変更・`--execute` 有効化・shared PUT 実行・workflow_dispatch・repository_dispatch・AK/KI接続は含まない。

### 1. 目的

- `scripts/push-recent-horse-histories.mjs` の `--execute` を有効化する**前の設計**。
- tmp JSON を `keiba-data-shared` に **create-only PUT** するための実行経路を定義する。
- ただし docs 追記段階では**実装しない**。
- **shared PUT 実行もしない**。
- **dispatch もしない**。
- **AK/KI接続もしない**。

### 2. --execute 有効化の基本方針

- `--execute` は**明示指定時のみ実 PUT 候補**になる。
- `--dry-run` が指定されている場合は**常に dry-run 優先**。
- `--execute` 単独でも、**内部で dry-run 相当チェックを再実行**する。
- **validator PASS が必須**。
- **HOLD / FAIL は中止**。
- **`GITHUB_TOKEN_KEIBA_DATA_SHARED` が必須**。
- **token なしなら exit 1**。
- **実 PUT はマコさんのターミナルで実行する前提**。

### 3. 初回実 PUT 対象

以下 **1ファイルのみ**:
```
tmp/nankan/recentHorseHistories/2026/05/2026-05-29-URA.json
```
shared 保存先:
```
nankan/recentHorseHistories/2026/05/2026-05-29-URA.json
```

理由:
- URA 2026-05-29 は **validator PASS 実績あり**
- **time-fail 0**
- **match率 61.6%**
- **既存確認 404 = 未存在OK 確認済み**
- 初回は **1日1場1ファイルのみ**
- **4場一括はしない**

### 4. 実 PUT 前ゲート（すべて必須）

- admin が **main**
- **local main = origin/main**
- push script が main に存在
- generator が main に存在
- validator が main に存在
- 禁止3ファイルは**未追跡のまま**
- shared / AK / KI に**変更なし**
- tmp JSON が**存在**
- tmp JSON が **parse 可能**
- **validator PASS**
- shared 保存先 path が **recentHorseHistories namespace に一致**
- 保存先が**未存在**
- `keiba-data-shared` が **clean**
- JSON 生成物が **git に露出していない**
- **`GITHUB_TOKEN_KEIBA_DATA_SHARED` が存在**
- **`--execute` 指定時にも dry-run 相当チェックを再実行**

### 5. GitHub Contents API PUT

- repository: `apol0510/keiba-data-shared`
- branch: `main`
- method: **PUT**
- endpoint:
  ```
  https://api.github.com/repos/apol0510/keiba-data-shared/contents/{path}
  ```
- **sha なし**
- **create-only**
- 既存ファイルがある場合は**中止**
- body:
  - `message`
  - `content`: base64(JSON)
  - `branch`: `main`
- commit message:
  ```
  add nankan recentHorseHistories 2026-05-29 URA
  ```

### 6. 保存後チェック（すべて必須）

- PUT レスポンス**成功**
- **commit sha 取得**
- `content.path` が**想定パスと一致**
- GET で保存先を**再取得**
- GET **200**
- content **decode**
- **tmp JSON と shared JSON が一致**
- 保存後 JSON が **parse 可能**
- **validator 相当検査 PASS**
- shared 側に**意図した1ファイルだけが増えた**こと
- **dispatch 未発火**
- **AK/KI 変更なし**

### 7. 失敗時の扱い

- **PUT 前の失敗**は何も保存せず**中止**
- 既存ファイルあり → **exit 1**
- token なし → **exit 1**
- validator HOLD → **exit 3**
- validator FAIL → **exit 2**
- namespace 不一致・schema 不一致・source 不整合 → **exit 2**
- **PUT 後 GET 不一致 → exit 2**。ただし **PUT 成功済みのため、強く手動確認を促す**
- **PUT 成功後の失敗は「要手動確認」として明示**

### 8. dispatch 禁止

- `--execute` 有効化後も **repository_dispatch は呼ばない**
- **workflow_dispatch も呼ばない**
- `prediction-updated` など**既存 dispatch 経路に触れない**
- dispatch は **Phase 6 以降、別許可**

### 9. AK/KI 接続禁止

- analytics-keiba **変更禁止**
- keiba-intelligence **変更禁止**
- `recentHorseHistories` **読み取り実装禁止**
- AK/KI接続は **Phase 6 以降、別設計**

### 10. 実行手順案

1. `generator --write-local`
2. `validator --file`
3. push script **dry-run**
4. `--execute` 有効化版の**事前確認**
5. **マコさんがターミナルで `--execute` 実行**
6. 保存後 **GET 確認**
7. **shared 状態確認**
8. **dispatch 未発火確認**
9. **AK/KI 無変更確認**

### 11. 実装PRの範囲

`--execute` 有効化実装 PR では**以下だけを変更対象**にする:
```
scripts/push-recent-horse-histories.mjs
```

含めないもの:
- generator 変更
- validator 変更
- docs 変更
- JSON 生成物
- keiba-data-shared 変更
- AK/KI 変更
- dispatch 実装

### 12. まだやらないこと（明示）

- `--execute` 実装しない
- shared PUT 実行しない
- workflow_dispatch しない
- repository_dispatch しない
- AK/KI接続しない
- Feature Importance 改善に入らない
- keiba-data-shared を変更しない

---

## 10.7. Phase 5 初回 shared PUT 成功記録

> 2026-06-03 実施。初回 create-only PUT は **マコさんのローカルターミナル**で実行・成功。本節は実績記録。追加 PUT・workflow_dispatch・repository_dispatch・AK/KI接続・Feature Importance 改善は含まない。

### 1. 初回 PUT 実行結果

- 実行対象: `tmp/nankan/recentHorseHistories/2026/05/2026-05-29-URA.json`
- shared 保存先: `nankan/recentHorseHistories/2026/05/2026-05-29-URA.json`
- **create-only PUT 成功**
- 実行者: **マコさんのローカルターミナル**
- token: `GITHUB_TOKEN_KEIBA_DATA_SHARED`（値は記録しない）
- **workflow_dispatch / repository_dispatch は未実行**
- **AK/KI接続は未実行**

### 2. shared commit

- commit hash: `0c6d289c8d5fdfb3e72409d56fafbb3175ca5553`
- commit message: `add nankan recentHorseHistories 2026-05-29 URA`
- author: `apol0510`
- 変更ファイル: `nankan/recentHorseHistories/2026/05/2026-05-29-URA.json` の **1件のみ**（`1 file changed, 18989 insertions(+)`）

### 3. 保存後 GET 検証

- GET 200（admin 側は `keiba-data-shared` を `git pull origin main` で同期して取得確認）
- **tmp JSON と shared JSON が一致**（648,499 bytes・同一）
- JSON parse **OK**
- schemaVersion: `nankan-recent-horse-histories-v0`
- recentRaces: **485**
- source-results-enriched: **299**
- source-racebook-only: **186**
- **299 + 186 = 485**（recentRaces と一致）

### 4. schema / key 検証

- **headCount は485件全件に存在**
- **fieldSize は0件**（出力されていない）
- output key は **headCount に統一**
- recentRaces 件数は generator / validator 時の件数（485）と**一致**

### 5. create-only 再実行防止確認

- 保存先 `nankan/recentHorseHistories/2026/05/2026-05-29-URA.json` は **shared に実在**（pull + `git log` で commit `0c6d289` を確認）。
- push script は **sha なし create-only PUT**。既存ファイルに対する再 PUT は、
  - 有効 token 環境では push script の既存確認 GET が **200 → 「既存あり（中止）」exit 1**、
  - 仮にゲートを越えても GitHub Contents API が **422（sha 不一致）** を返す、
  のいずれかで**二重 PUT が構造的に防止される**。
- ※補足（透明性）: 漏えい対応で旧 token が失効したため、**Claude の実行環境の token は現在無効（既存確認 GET が 401）**。そのため「既存あり（中止）」の dry-run 再現は **有効 token のあるマコさんのターミナルで行う**前提。Claude 環境からは再現できない（401）が、ファイル実在は pull で確認済みのため create-only 防止は成立している。

### 6. repo 状態

- admin: 禁止3ファイル（`publish-prediction.mjs` / `build-feature-scores-once.mjs` / `enrich-past-races-once.mjs`）のみ未追跡
- shared: **clean**（commit `0c6d289` は main 取り込み済）
- AK: 既存 `.claude/worktrees/` のみ
- KI: **clean**

### 7. dispatch / 接続状態

- **workflow_dispatch 未実行**
- **repository_dispatch 未実行**
- **AK/KI 変更なし**
- `recentHorseHistories` **読み取り接続は未実装**
- **Feature Importance 改善は未着手**

### 8. 次工程候補

- 追加 PUT は **1ファイルずつ・別許可**。
- OOI / FUN / KAW へ拡大する場合も、**generator → validator → push dry-run → execute → 保存後確認** を **1件ずつ**行う。
- Phase 6（AK/KI 読み取り接続）は**別設計から開始**。
- **いきなり複数場一括・dispatch・AK/KI接続に進まない**。

---

## 10.8. Phase 5 2件目 shared PUT 成功記録

> 2026-06-03 実施。初回 URA（§10.7）に続く **2件目** の create-only PUT。**マコさんのローカルターミナル**で実行・成功。本節は再現性確認の実績記録。3件目 PUT・workflow_dispatch・repository_dispatch・AK/KI接続・Feature Importance 改善は含まない。

### 1. 2件目 PUT 実行結果

- 実行対象: `tmp/nankan/recentHorseHistories/2026/05/2026-05-22-OOI.json`
- shared 保存先: `nankan/recentHorseHistories/2026/05/2026-05-22-OOI.json`
- **create-only PUT 成功**
- 実行者: **マコさんのローカルターミナル**
- token: `GITHUB_TOKEN_KEIBA_DATA_SHARED`（値は記録しない／旧 classic PAT 失効による 401 を新 token 差し替えで解消後に実行）
- **workflow_dispatch / repository_dispatch は未実行**
- **AK/KI接続は未実行**

### 2. shared commit

- commit hash: `b4bf0320f5821ef106d858ebf0b7a93fccc80a28`
- commit message: `add nankan recentHorseHistories 2026-05-22 OOI`
- author: `apol0510`
- 変更ファイル: `nankan/recentHorseHistories/2026/05/2026-05-22-OOI.json` の **1件のみ**（`1 file changed, 21732 insertions(+)`）

### 3. 保存後検証

- **PUT 成功 status=201**
- 保存後 **GET=200**
- tmp JSON と shared JSON が **一致**
- **JSON parse OK**
- schemaVersion: `nankan-recent-horse-histories-v0`
- recentRaces: **555**
- source-results-enriched: **339**
- source-racebook-only: **216**
- 339 + 216 = **555**（一致）

### 4. schema / key 検証

- `headCount` は **555件全件に存在**
- `fieldSize` は **0件**
- output key は **`headCount` に統一**（`fieldSize` は出力しない）
- recentRaces 件数は generator / validator 時点（555）と **一致**

### 5. 初回 URA との対比

| 項目 | 初回 URA | 2件目 OOI |
|---|---|---|
| 日付 | 2026-05-29 | 2026-05-22 |
| shared commit | `0c6d289` | `b4bf032` |
| recentRaces | 485 | 555 |
| source-results-enriched | 299 | 339 |
| source-racebook-only | 186 | 216 |

- **2件連続**で create-only PUT → GET 200 → 内容一致 → headCount 全件 / fieldSize 0 を確認。
- **Phase 5 shared PUT フローの再現性を確認**。

### 6. repo 状態

- admin: **禁止3ファイルのみ未追跡**（`publish-prediction.mjs` / `build-feature-scores-once.mjs` / `enrich-past-races-once.mjs`）
- shared: **clean**（HEAD `b4bf032`）
- AK: 既存 `.claude/worktrees/` のみ
- KI: **clean**

### 7. dispatch / 接続状態

- **workflow_dispatch 未実行**
- **repository_dispatch 未実行**
- **AK/KI変更なし**
- recentHorseHistories **読み取り接続は未実装**
- **Feature Importance改善は未着手**

### 8. 次工程候補

- 3件目 PUT へ進む場合も **1ファイルずつ・別許可**。
- FUN / KAW へ拡大する場合も、**generator → validator → push dry-run → execute → 保存後確認** を **1件ずつ**行う。
- Phase 6（AK/KI 読み取り接続）は**別設計から開始**。
- **一括 PUT・dispatch・AK/KI接続にいきなり進まない**。

---

## 10.9. Phase 6 AK/KI 読み取り接続 設計

> 2026-06-03 追記。Phase 5（§10.4 / §10.7 / §10.8）で shared に create-only PUT 済みの南関 recentHorseHistories を、analytics-keiba / keiba-intelligence が将来安全に読み取れるようにするための**設計のみ**。**本節では接続実装・JSON生成・shared PUT・workflow_dispatch・repository_dispatch・Feature Importance 改善・表示コンポーネント変更を一切行わない。** 読み取り契約・変換方針・衝突回避・禁止事項を明文化するだけに留める。

### 1. Phase 6 の目的

- 南関 recentHorseHistories を **shared data の正本**として扱い、AK/KI が将来的に**安全に読み取れる**状態の契約を定める。
- ただしこの Phase では**接続実装は行わない**。読み取り契約・変換方針・衝突回避・禁止事項を明文化する。

### 2. shared data の位置づけ

- `keiba-data-shared/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-VENUE.json` を**南関 recentHorseHistories の正本候補**とする。
- admin 側で**生成・検査・create-only PUT** されたものを読む（§10.7 / §10.8 のフロー由来）。
- **AK/KI 側で独自に過去走を再構成しない。**
- **AK/KI 側で shared JSON を直接改変しない。**

### 3. AK/KI の役割分離

#### analytics-keiba（AK）

- ユーザー向けに**分かりやすい3項目**へ要約する。
- 例:
  - 近走安定性
  - 距離・条件適性
  - 展開/上昇気配
- 競馬初心者にも意味が分かる説明を優先する。
- **機械学習風6項目をそのまま表示しない。**

#### keiba-intelligence（KI）

- **機械学習風の6項目詳細**として表示する。
- 例:
  - Speed Index
  - Stamina Rating
  - Form Trend
  - Track Compatibility
  - Distance Fitness
  - Jockey/Trainer Factor
- ただし **shared recentHorseHistories の値をそのまま表示値にしない。**
- shared の**事実データをもとに**、KI 用の**派生評価**として扱う。

> 役割分離は [project_feature_scores_site_differentiation](../) で確定済みの「KI=6項目詳細 / AK=3項目要約」方針と整合する。6項目統一案は撤回済み。

### 4. 同じ shared 値をそのまま両サイトに出さない

- shared recentHorseHistories は**事実データの正本**であり、**表示スコアの正本ではない**。
- AK/KI で**同一の数値・同一の説明文・同一の6項目**を並べることは**禁止**。
- 両サイトの**差別化を維持**する。
- ただし、事実データに基づく説明が**矛盾しない**ようにする。

### 5. 矛盾防止

- 同じ馬について、AK では「距離適性高い」、KI では「Distance Fitness 低い」のような**真逆説明が出ない**ようにする。
- shared data 由来の**基礎事実は共通**にする。
- サイト別の派生表示は、**表現粒度・項目数・見せ方を変えるだけ**にする。
- 評価ロジックを分ける場合でも、**共通の中間判定・正規化ルールを docs 化してから**進める。

### 6. 既存データとの衝突回避

Phase 6 では以下に**触れない**:

- JRA horseHistories
- 南関 recentRaces
- predictions
- results
- archiveResults
- AI指数
- 印
- 買い目
- Feature Importance
- featureScores
- AK/KI の表示コンポーネント実装

### 7. 読み取り優先順位の設計案

将来的な実装時の優先順位案として、以下を記載する（**今回実装しない**）。

1. 南関 recentHorseHistories が存在する場合は、それを**近走履歴の優先ソース候補**とする。
2. 存在しない場合は、**既存 recentRaces を維持**する。
3. データ欠損時に**表示を壊さず**、既存表示へ**安全にフォールバック**する。
4. ただし、この優先順位は **Phase 6 docs 上の設計案**であり、**今回実装しない**。

### 8. 禁止事項

- analytics-keiba **のみ**を先に recentHorseHistories 対応することは**禁止**。
- keiba-intelligence **のみ**を先に recentHorseHistories 対応することは**禁止**。
- shared data 契約なしに表示側で**独自補正**することは**禁止**。
- Feature Importance の**数値改善に入る**ことは**禁止**。
- 既存 AI指数・印・買い目を**変更**することは**禁止**。
- **repository_dispatch / workflow_dispatch を実行しない。**
- **shared PUT を実行しない。**
- **token 値を表示しない。**

### 9. Phase 6 の出口条件

- docs に AK/KI 読み取り接続の設計が追記されている。
- AK/KI の役割分離が明文化されている。
- shared recentHorseHistories と existing recentRaces / Feature Importance の衝突回避方針が明文化されている。
- 実装禁止範囲が明文化されている。
- 差分が **docs のみ**である。
- PR 作成前に diff を提示できる状態で**停止**する。

---

## 10.10. Phase 6.1 shared recentHorseHistories 表示契約

> 2026-06-03 追記。Phase 6（§10.9）の **AK/KI 読み取り接続に入る前**に、表示側が `keiba-data-shared/nankan/recentHorseHistories/...` を**読んでよい範囲＝表示契約**を明文化する。**本節は docs のみ。** AK/KI 実装・shared PUT・dispatch・Feature Importance 改善は行わない。
>
> **関連**: データ生成・保存・突合・dataQualityFlags の**生成側契約**は [nankan-recent-horse-histories-contract.md](nankan-recent-horse-histories-contract.md)（§10 AK/KI利用方針 / §11 Feature Importance接続 / §9 dataQualityFlags）に既出。本§は**表示側が読む契約**を扱い、生成側契約と二重定義しない。値の定義・生成根拠は contract.md を正とし、本§は「表示が依存してよいか」だけを規定する。
>
> 本表示契約は **Phase 6 実装前監査（§10.9 直後に実施）**で確認した実データ事実（URA 2026-05-29 / OOI 2026-05-22）に基づく。

### 1. 正本の位置づけ

- `keiba-data-shared/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-VENUE.json` は南関 recentHorseHistories の**事実データ正本**とする。
- ただし、**表示スコア・Feature Importance・AI指数・印・買い目の正本ではない**。
- AK/KI はこの JSON を**直接改変しない**。
- 表示側は**読み取り専用**とする。

### 2. top-level 構造（実データ準拠）

現時点の実データ構造として以下を契約候補にする。

| 階層 | キー |
|---|---|
| top-level | `schemaVersion` / `category` / `date` / `venue` / `venueName` / `source` / `races` |
| `races[]` | `raceNumber` / `raceName` / `horses[]` |
| `horses[]` | `horseNumber` / `horseName` / `recentRaces[]` |

- **実データは `entries[]` ではなく `horses[]`** である点を明記する（監査で確認）。
- 馬配列キーは `horses` に固定して読む（`entries` を期待する実装は壊れる）。

### 3. 表示側が読んでよいキー（ホワイトリスト）

表示側が依存してよいキーを以下に限定する。

- top / race / horse: `date` / `venue` / `venueName` / `raceNumber` / `raceName` / `horseNumber` / `horseName` / `recentRaces`
- `recentRaces[]`: `date` / `venue` / `venueName` / `raceName` / `distance` / `surface` / `finish` / `time` / `last3f` / `corner` / `headCount`

> ⚠️ `headCount` は **null の可能性がある**（監査: racebook-only 由来の record では値が null。URA 186件 / OOI 216件）。**数値前提で扱わない**（§5 参照）。
> ⚠️ 上記ホワイトリストのキーでも、実データに存在しない record がありうる（例: `recentRaces` 空配列、走によっては `last3f`/`corner` 欠落）。**存在前提でアクセスしない**。

### 4. 表示側が依存してはいけないキー（契約外）

以下は**内部・診断・生成都合**のフィールドとして扱い、AK/KI 表示実装が依存しないことを明記する。

- `_status` / `_timeFail` / `_unknownVenue`
- `resultMatchKey` / `sourcePriority` / `dataQualityFlags`
- その他 **`_` prefix** のフィールド全般

これらは**デバッグ・検査・生成側突合用**であり、**表示契約外**。表示ロジック・分岐・スコアの入力に使わない。生成側での意味は contract.md §9 / §8 を参照。

### 5. null / 欠損 / 空配列の扱い（表示側共通 fallback）

表示側共通の安全条件として以下を明記する。**「既存表示を壊さない」ことを最優先**とする。

1. recentHorseHistories **ファイルが存在しない** → 既存 `horse.recentRaces` を維持。
2. 該当 **race が存在しない** → 既存 `horse.recentRaces` を維持。
3. 該当 **horse が存在しない**（馬名照合不成立含む） → 既存 `horse.recentRaces` を維持。
4. 該当 horse の **`recentRaces` が空配列** → 既存 `horse.recentRaces` を維持（監査: URA に2頭存在）。
5. `headCount === null` → 表示では **「—」等に安全置換**する。
6. `headCount === null` を**数値計算に使わない**。
7. `fieldSize` は**現時点で表示契約に含めない**（監査: 実データに当キーは0件）。

> これらは AK/KI **両サイト共通**で定義する。片側だけ fallback を実装すると「片側 repo 寄せ」になり禁止（CLAUDE.md / §10.9）。

### 6. 最大走数

- shared recentHorseHistories は**最大4走**を持つ可能性がある（監査確認）。
- **KI は既存実装で最大3走の前提**がある（`slice(0,3)` 由来）。
- AK/KI で表示走数を変える場合は、**表示仕様として別途明記**する。
- Phase 6.1 では「**shared 側は事実データとして保持し、表示側が何走使うかは別契約**」とする。
- 走数変更は **Feature Importance / 6項目評価に波及**するため、**今回変更しない**。

### 7. Feature Importance との分離

- shared recentHorseHistories を読んでも、**Feature Importance / featureScores / `generateAdvancedMetrics` に自動接続しない**。
- `recentRaces` の**供給元差し替え**は、Feature Importance 値を変える可能性がある（監査: 両サイトとも近走を特徴量入力に使用）。
- そのため Phase 6.1 では「**表示用近走データ**」と「**特徴量計算用入力**」を**分離する方針**を明記する。
- **Feature Importance 改善は別 Phase**（Phase 7）とする。

### 8. AK/KI 表示差別化との関係

- shared recentHorseHistories は**事実データ**であり、**AK/KI 共通の表示スコアではない**。
- AK は**3項目要約**へ派生 / KI は**6項目詳細**へ派生（§10.9 で確定）。
- ただし **Phase 6.1 では派生計算を実装しない**。
- **同じ shared 値をそのまま AK/KI に出すことは禁止**。
- 同じ馬について**真逆の説明が出ない**よう、**将来の中間判定契約**が必要（§10.9 / 監査 C-4）。

### 9. 実装前ゲート

Phase 6.1 完了後でも、以下が**未完了なら AK/KI 実装に入らない**。

- [ ] AK/KI 両 repo が **main または作業開始に適したブランチ状態**であること（監査: 現状 AK=`feat/ak-feature-summary-jra-free`＋11 worktree / KI=`feat/jra-free-feature-scores-ui`、いずれも main 外）。
- [ ] **shared 表示契約**が docs に明記されていること（本§）。
- [ ] **fallback 条件**が明記されていること（§5）。
- [ ] **Feature Importance に接続しない方針**が明記されていること（§7）。
- [ ] **AK/KI 表示差別化の中間判定方針**が明記されていること（§8 / §10.9）。
- [ ] **本番同梱方式の違い**を確認済みであること（監査 B-5: AK=明示 `readFileSync` / KI=`included_files` glob + multi-candidate path）。

### 10. 禁止事項

- AK/KI 実装禁止
- keiba-data-shared PUT 禁止
- workflow_dispatch / repository_dispatch 禁止
- Feature Importance 改善禁止
- AI指数・印・買い目変更禁止
- shared JSON 直接改変禁止
- token 値表示禁止
- 禁止3ファイルを触らない（`netlify/functions/publish-prediction.mjs` / `scripts/build-feature-scores-once.mjs` / `scripts/enrich-past-races-once.mjs`）

---

## 10.11. Phase 6.2 fallback契約

> 2026-06-03 追記。Phase 6.1（§10.10）の表示契約に続き、shared recentHorseHistories を AK/KI が**将来読む場合**の **fallback 契約**を明文化する。目的は「**shared データが欠損・未生成・不完全でも、既存表示を壊さない**」こと。**本節は docs のみ。** AK/KI 実装・shared PUT・dispatch・Feature Importance 改善は行わない。
>
> 本節は §10.10 の null/欠損/空配列ルール（§5）を **fallback 判定の優先順位・粒度**として具体化したもの。値の意味・生成根拠は [nankan-recent-horse-histories-contract.md](nankan-recent-horse-histories-contract.md) を正とする。

### 1. fallback契約の目的

- shared recentHorseHistories は現時点で**全日付・全場が揃っていない**。
- **URA 2026-05-29 / OOI 2026-05-22 の2件のみ PUT 済み**（§10.7 / §10.8）。
- そのため、AK/KI が読む場合でも **shared が存在しない日付では既存 `horse.recentRaces` を維持**する。
- fallback は「**欠損時の補完**」ではなく「**既存表示を壊さないための安全装置**」とする。

### 2. fallback優先順位

将来実装時の読み取り優先順位を以下のように契約化する。

1. shared recentHorseHistories **ファイルが存在するか**確認。
2. **存在しない**場合は既存 `horse.recentRaces` をそのまま使う。
3. ファイルが存在しても **JSON parse に失敗**した場合は既存 `horse.recentRaces` を使う。
4. **top-level 構造が契約外**（§10.10 §2 と不一致）の場合は既存 `horse.recentRaces` を使う。
5. **該当 race が見つからない**場合は既存 `horse.recentRaces` を使う。
6. **該当 horse が見つからない**場合は既存 `horse.recentRaces` を使う。
7. 該当 horse の **`recentRaces` が空配列**の場合は既存 `horse.recentRaces` を使う。
8. **usable な `recentRaces` がある場合のみ**、表示用近走データとして**利用候補**にする。

### 3. fallback判定で落としてよいケース

以下は shared recentHorseHistories を使わず、**既存 `horse.recentRaces` に戻す**。

- ファイルなし
- JSON parse 失敗
- `races` が配列ではない
- `horses` が配列ではない
- `recentRaces` が配列ではない
- `recentRaces.length === 0`
- horseName / horseNumber 照合に失敗
- date / venue / raceNumber の対応が不明
- 読み取り側で安全に表示できない値がある

### 4. null値の扱い

- **`headCount === null` は fallback 理由にはしない**（§10.10 §5 と整合。racebook-only 由来で正常に発生しうる値）。
- ただし**数値計算には使わない**。
- 表示する場合は **「—」等に安全置換**する。
- **`distance` / `surface` / `finish` など表示の根幹キーが欠損**している場合は、その record 単位で**非表示**または**既存 recentRaces 維持**を検討する。
- **record 単位 fallback と horse 単位 fallback のどちらを採用するか**は実装前に別途決める（§5）。

### 5. record単位fallbackとhorse単位fallback

Phase 6.2 では以下を設計候補として明記する。

**候補A: horse 単位 fallback**
- shared 側の該当 horse `recentRaces` が使えない場合、**`horse.recentRaces` 全体を既存に戻す**。
- 安全性が高い。

**候補B: record 単位 fallback**
- **欠損 record だけ**既存 `recentRaces` から補う。
- 複雑で、**AK/KI 差分や順序ズレの原因になりやすい**。

**推奨**:
- **初期実装では候補A「horse 単位 fallback」を優先**する。
- record 単位 fallback は**将来 Phase に回す**。

### 6. AK/KI共通条件

- fallback 条件は **AK/KI で共通**にする。
- **AK だけ独自 fallback、KI だけ独自 fallback は禁止**。
- **表示項目は AK/KI で分けても**、shared を**使う/使わない判定は共通化**する。
- **共通 fallback 条件なしに片側 repo だけ実装しない**（監査 B-5 / CLAUDE.md 片側寄せ禁止）。

### 7. Feature Importanceとの関係

- fallback は**表示用近走データの切り替え条件**であり、**Feature Importance 入力の切り替え条件ではない**。
- **Feature Importance / featureScores / `generateAdvancedMetrics` に自動接続しない**。
- 既存の特徴量計算入力を**勝手に recentHorseHistories へ差し替えない**。
- **fallback 実装によって FI 値が変わる状態は禁止**。

### 8. 実装前ゲート

Phase 6.2 完了後でも、以下が**未確定なら AK/KI 実装に入らない**。

- [ ] **horse 単位 fallback で始めるか、record 単位 fallback を許可するか**
- [ ] `distance` / `surface` **欠損時の扱い**
- [ ] `finish` **欠損時の扱い**
- [ ] `headCount: null` の**表示ルール**
- [ ] **shared 使用判定をどこに置くか**（共通 helper / 各サイト）
- [ ] **AK/KI 両 repo の作業ブランチ状態**（監査: 現状とも main 外）
- [ ] **本番同梱方式の差分確認**（監査 B-5: AK=明示 `readFileSync` / KI=`included_files` glob）

### 9. 禁止事項

- AK/KI 実装禁止
- keiba-data-shared PUT 禁止
- workflow_dispatch / repository_dispatch 禁止
- Feature Importance 改善禁止
- AI指数・印・買い目変更禁止
- shared JSON 直接改変禁止
- token 値表示禁止
- 禁止3ファイルを触らない（`netlify/functions/publish-prediction.mjs` / `scripts/build-feature-scores-once.mjs` / `scripts/enrich-past-races-once.mjs`）

---

## 10.12. Phase 6.3 中間判定契約

> 2026-06-03 追記。Phase 6.1（§10.10 表示契約）・Phase 6.2（§10.11 fallback契約）に続き、shared recentHorseHistories の**事実データ**を AK/KI が**将来利用する際の中間判定契約**を明文化する。目的は「**shared 値をそのまま AK/KI に出さない**」「**同じ馬で AK/KI が真逆の説明を出さない**」「**AK=3項目要約 / KI=6項目詳細の差別化を保ちつつ、元になる共通判定は矛盾させない**」「**Feature Importance / AI指数 / 印 / 買い目と切り離す**」こと。**本節は設計契約のみで、計算実装は行わない。**

### 1. 中間判定契約の目的

- shared recentHorseHistories は**事実データ正本**であり、**表示スコア正本ではない**。
- AK/KI が同じ shared 事実を読む場合でも、**表示項目や説明粒度は分ける**。
- ただし、同じ馬について **AK と KI で真逆の評価説明が出ない**ようにする。
- そのため、shared 事実データと AK/KI 表示の間に「**共通中間判定**」を置く。
- Phase 6.3 では**設計契約のみ**で、計算実装は行わない。

### 2. 中間判定の位置づけ（3層）

| 層 | 内容 | 範囲 |
|---|---|---|
| **1. 事実データ層** | shared recentHorseHistories（日付・場・距離・馬場・着順・時計・上がり・頭数 等） | **AK/KI 共通** |
| **2. 中間判定層** | 近走安定性 / 距離・条件適性 / 近走上昇・下降傾向 / データ充足度 の判定 | **AK/KI 共通** |
| **3. 表示派生層** | AK=ユーザー向け3項目要約 / KI=機械学習風6項目詳細 | **サイト別** |

### 3. AK/KI差別化の原則

- shared recentHorseHistories の値を**そのまま AK/KI 両方に表示しない**。
- AK は「**分かりやすい説明**」と「**3項目要約**」を優先する。
- KI は「**詳細分析風**」と「**6項目詳細**」を優先する。
- ただし、**共通中間判定が同じである限り、説明の方向性は矛盾させない**。
- 例:
  - 中間判定で「距離適性: 高」とした馬を、AK で「距離条件は合う」、KI で「Distance Fitness 高め」と表現する → **可**。
  - AK で「距離条件は合う」、KI で「Distance Fitness 低い」とする → **禁止**。

### 4. 中間判定候補

Phase 6.3 では実装せず、候補として以下を docs 化する。

#### 4.1 近走安定性

- 入力候補: `recentRaces[].finish` / `recentRaces[].time` / `recentRaces[].headCount` / `recentRaces.length`
- 判定候補: 高 / 中 / 低 / 判定不可
- 注意: `headCount` null は数値計算に使わない。`recentRaces` が空の場合は fallback 対象（§10.11）。着順だけでなく**データ充足度も見る**。

#### 4.2 距離・条件適性

- 入力候補: `recentRaces[].distance` / `recentRaces[].surface` / 今回レースの distance・surface / `venue`・`venueName`
- 判定候補: 高 / 中 / 低 / 判定不可
- 注意: distance / surface 欠損時は**無理に判定しない**。**南関と JRA を混同しない**。venue 差を**過度にスコア化しない**。

#### 4.3 近走上昇/下降傾向

- 入力候補: finish 推移 / time 推移 / `last3f` / recentRaces の時系列順
- 判定候補: 上昇 / 横ばい / 下降 / 判定不可
- 注意: **recentRaces の順序が保証されるか確認が必要**。record 単位 fallback を使わない初期方針（§10.11 §5 候補A）では、**horse 単位で安定判定**する。

#### 4.4 データ充足度

- 入力候補: `recentRaces.length` / distance・surface・finish・time の欠損率 / source-results-enriched・source-racebook-only の混在 / headCount null の有無
- 判定候補: 十分 / 一部不足 / 不足 / 判定不可
- 注意: データ充足度は**評価そのものではなく、説明の信頼度**として扱う。**racebook-only を低評価扱いにしない**。`dataQualityFlags` や内部フィールドを**表示ロジックに直接使わない**（§10.10 §4）。

### 5. AK 3項目への派生候補

AK では中間判定を以下の3項目へ要約する候補とする。

1. **近走安定性** — 中間判定「近走安定性」を主に利用。データ充足度で説明の強さを調整。
2. **距離・条件適性** — 中間判定「距離・条件適性」を主に利用。surface / distance / venue を利用候補。
3. **展開/上昇気配** — 中間判定「近走上昇/下降傾向」を主に利用。ただし**展開予測そのものとは混同しない**。あくまで**近走履歴から見た上昇気配**とする。

注意: AK では機械学習風6項目を**そのまま表示しない**。**過度に細かい数値を出さない**。AK の3項目は **Feature Importance とは別物**として扱う。

### 6. KI 6項目への派生候補

KI では中間判定を以下の6項目へ派生する候補とする。

1. **Speed Index** — time / finish / distance を利用候補。ただし**既存 AI指数とは別物**。
2. **Stamina Rating** — distance 推移 / 距離経験を利用候補。
3. **Form Trend** — finish 推移 / last3f / 近走順序を利用候補。
4. **Track Compatibility** — venue / surface / 場条件を利用候補。
5. **Distance Fitness** — 今回距離と過去距離の近さを利用候補。
6. **Jockey/Trainer Factor** — Phase 6.3 では recentHorseHistories 単体からは**原則判定しない**。騎手・調教師データとの接続は**別 Phase**。**無理に recentHorseHistories から作らない**。

注意: KI 6項目は **Feature Importance 既存表示と衝突する可能性がある**ため、**今回実装しない**。`generateAdvancedMetrics` へ**自動接続しない**。`featureScores` を**変更しない**。

### 7. 矛盾禁止ルール

- 中間判定で「高」とした項目を、別サイト表示で「低」と表現しない。
- 中間判定で「判定不可」としたものを、表示側で**断定しない**。
- **データ不足を能力不足として扱わない**。
- **racebook-only 由来を能力低評価として扱わない**。
- **headCount null を不利評価に使わない**。
- **Feature Importance の数値と中間判定を混同しない**。
- **AK/KI どちらか片方だけの都合で中間判定を変更しない**。

### 8. 実装前ゲート

Phase 6.3 完了後でも、以下が**未確定なら AK/KI 実装に入らない**。

- [ ] **中間判定をどこに置くか**（admin/shared docs のみ / shared helper / AK・KI それぞれの helper）
- [ ] **判定ラベルを日本語にするか数値にするか**
- [ ] **AK 3項目と既存 Feature Importance 3項目の関係**
- [ ] **KI 6項目と既存 `generateAdvancedMetrics` の関係**
- [ ] **Jockey/Trainer Factor を Phase 6 で扱うか除外するか**
- [ ] **判定不可をどう表示するか**
- [ ] **データ不足時に説明を出すか出さないか**

### 9. 禁止事項

- AK/KI 実装禁止
- keiba-data-shared PUT 禁止
- workflow_dispatch / repository_dispatch 禁止
- Feature Importance 改善禁止
- `generateAdvancedMetrics` 変更禁止
- `featureScores` 変更禁止
- AI指数・印・買い目変更禁止
- shared JSON 直接改変禁止
- token 値表示禁止
- 禁止3ファイルを触らない（`netlify/functions/publish-prediction.mjs` / `scripts/build-feature-scores-once.mjs` / `scripts/enrich-past-races-once.mjs`）

---

## 10.13. Phase 6.4 読み取りhelper設計

> 2026-06-03 追記。Phase 6.4 読み取り helper 設計監査（4 repo 横断・読み取り専用）の結果を受けて、AK/KI が将来 shared recentHorseHistories を読むための **helper 設計**を明文化する。**本節は docs のみで、helper 実装は行わない。** AK/KI 実装・shared PUT・dispatch・Feature Importance 改善は対象外。
>
> 監査の主要事実: ① AK/KI とも JRA horseHistories で「**別フィールド注入・表示専用・計算系は `recentRaces` 据え置き**」という安全な手本を持つ（注入先 `recentRacesFromHistories`）。② helper が `horse.recentRaces` を上書きすると AK `computeImportance`/`computeEvalPoints`・KI `generateAdvancedMetrics` に波及する。③ 本番同梱方式が **AK/KI で非対称**（KI は `astro.config includeFiles` が要、`netlify.toml included_files` だけでは Astro SSR に効かない可能性）。④ KI 現行 glob は `horseHistories/**/*.json` で **`recentHorseHistories/**` は対象外**。⑤ shared を読む前に **keiba-data-shared ローカルが origin より2コミット遅れ**ている点に注意。

### 1. helper設計の目的

- shared recentHorseHistories を AK/KI が将来**安全に読む**ための helper 設計を定める。
- helper は**事実データの取得と fallback 判定に責務を限定**する。
- helper は**表示スコア・中間判定・Feature Importance 値を作らない**。
- helper は **`horse.recentRaces` を上書きしない**。
- helper は**既存表示を壊さないための安全な表示候補データ**を返す。

### 2. 採用候補

監査結果として、初期方針は以下とする。

**採用候補: 候補B + C**
- build 時または事前取込で shared JSON を `src/data/recentHorseHistories/nankan/...` に配置。
- runtime では `readFileSync` + `existsSync` + try/catch で読む。
- **JRA horseHistories とは別系統ディレクトリ**にする。
- 注入先は **`horse.recentRaces` ではなく別フィールド**にする。

**避ける候補: 候補D（predictions JSON 内の `horse.recentRaces` に焼き込む）**
- 理由: Feature Importance / `generateAdvancedMetrics` の入力を汚染する／AK/KI の計算結果が意図せず変わる／Phase 6.1〜6.3 の契約に反する。

### 3. ディレクトリ設計候補

- **推奨**: `src/data/recentHorseHistories/nankan/YYYY/MM/YYYY-MM-DD-VENUE.json`
- **避ける**: `src/data/horseHistories/nankan/...`
- 理由:
  - JRA `horseHistories` と混同しやすい。
  - KI の既存 `horseHistories/**/*.json` glob に巻き込まれる可能性がある。
  - JRA loader が `jra` 固定前提のため、同じ配下に nankan を置くと「**同梱されるが読まれない**」ねじれが起きる可能性がある。

### 4. helperの責務

**行ってよいこと**:
- date / venue から対象ファイル path を組み立てる
- ファイル存在確認
- JSON parse
- top-level 構造確認（§10.10 §2）
- raceNumber / horseName / horseNumber による該当 horse 探索
- `recentRaces` が usable か確認
- Phase 6.2 fallback 契約（§10.11）に基づく fallback 理由の判定
- 表示候補データを返す

**行ってはいけないこと**:
- `horse.recentRaces` の上書き
- Feature Importance 値の計算
- `generateAdvancedMetrics` への接続
- `featureScores` への接続
- AK 3項目要約の生成
- KI 6項目詳細の生成
- 中間判定スコアの生成
- AI指数・印・買い目の変更

### 5. helper戻り値の設計候補

候補として以下を docs 化する。

```js
{
  ok: boolean,
  source: 'shared-recentHorseHistories' | 'existing-recentRaces',
  recentRaces: array,
  fallbackReason: string | null,
  matchedBy: 'horseNumber' | 'horseName' | 'both' | null,
  warnings: string[]
}
```

方針:
- `ok: true` の場合のみ shared 由来の recentRaces を表示候補にできる。
- `ok: false` の場合は既存 `horse.recentRaces` を維持する。
- `fallbackReason` を返すことで、AK/KI で**同じ fallback 判断を再現しやすく**する。
- `warnings` は**表示ではなく検査・debug 用**。
- `fallbackReason` や `warnings` を**ユーザー向け表示文に直接使わない**。

### 6. 注入先フィールド

- **推奨**: `horse.recentRacesFromRecentHorseHistories` または `horse.recentRacesFromHistoriesNankan`
- 条件:
  - 既存 `horse.recentRaces` は**不変**。
  - JRA の `recentRacesFromHistories` と**思想を揃える**。
  - **南関用であることが名前から分かる**。
  - **AK/KI で同一の命名方針**にする。
- **禁止**:
  - `horse.recentRaces` への上書き
  - `horse.featureScores` への注入
  - `horse.importance` への注入
  - AI指数や買い目生成用フィールドへの注入

### 7. fallback契約との整合

helper は §10.11 の fallback 契約に従う。

- ファイルなし → 既存 recentRaces 維持
- JSON parse 失敗 → 既存 recentRaces 維持
- top-level 構造不正 → 既存 recentRaces 維持
- race 未検出 → 既存 recentRaces 維持
- horse 未検出 → 既存 recentRaces 維持
- recentRaces 空配列 → 既存 recentRaces 維持
- `headCount` null → **fallback 理由にはしない**が、**数値計算には使わない**
- 初期は **horse 単位 fallback を優先**
- **record 単位 fallback には入らない**

### 8. 中間判定契約との整合

helper は §10.12 の中間判定契約とは**分離**する。

- helper は**事実データ層まで**。
- 中間判定層は**別 helper または別 Phase**。
- AK/KI 表示派生層は**さらに別**。
- helper が「**高・中・低**」などの判定ラベルを作らない。
- helper が **AK 3項目や KI 6項目を返さない**。

### 9. AK/KI実装差分への注意

監査結果として以下を docs 化する。

**AK**:
- `readFileSync` 系（単一パス `process.cwd()`）。
- JRA horseHistories の**本番同梱方式が未確定**。
- 実装前に**本番同梱方式の確認が必要**。

**KI**:
- `readFileSync` + multi-candidate path / `/var/task` 対応あり。
- **`astro.config includeFiles` が重要**。
- `netlify.toml included_files` だけでは **Astro SSR に効かない可能性**あり。
- `recentHorseHistories/**` を読む場合、**`includeFiles` 追加が必要になる可能性が高い**。

**共通**:
- 同じ helper コードを**単純コピーしない**。
- **契約・戻り値・fallback 条件を共通化**し、実装は各 repo の既存方式に合わせる。
- **片側 repo だけ先に実装しない**。

### 10. 実装前ゲート

Phase 6.4 完了後でも、以下が**未確定なら AK/KI 実装に入らない**。

- [ ] `src/data/recentHorseHistories/nankan/...` で確定するか
- [ ] helper 戻り値形式
- [ ] 注入先フィールド名
- [ ] AK 本番同梱方式の確認
- [ ] KI `astro.config includeFiles` 追加方針
- [ ] shared 同期方式
- [ ] **keiba-data-shared local を origin/main に同期するか**（監査: ローカルが2コミット遅れ）
- [ ] AK/KI 両 repo の作業ブランチ状態
- [ ] helper を各 repo に同等仕様で置くか、共通化するか
- [ ] `fallbackReason` の扱い
- [ ] `warnings` の扱い

### 11. 禁止事項

- AK/KI 実装禁止
- keiba-data-shared PUT 禁止
- workflow_dispatch / repository_dispatch 禁止
- Feature Importance 改善禁止
- `generateAdvancedMetrics` 変更禁止
- `featureScores` 変更禁止
- AI指数・印・買い目変更禁止
- shared JSON 直接改変禁止
- token 値表示禁止
- 禁止3ファイルを触らない（`netlify/functions/publish-prediction.mjs` / `scripts/build-feature-scores-once.mjs` / `scripts/enrich-past-races-once.mjs`）

---

## 10.14. Phase 6.5 shared→AK/KI 同期方式設計

> 2026-06-04 追記。Phase 6.4（§10.13 読み取りhelper設計）を受けて、南関 recentHorseHistories を **keiba-data-shared → AK/KI の `src/data` へ運ぶ同期方式**を設計のみ明文化する。**本節は docs のみ。** import script / workflow / loader の実装、shared PUT、dispatch、Feature Importance 改善は対象外。
>
> 設計は 4 repo 横断の read-only 調査（2026-06-04 実施）に基づく。主要事実: ① shared 側に南関 recentHorseHistories 実データが既に存在（下記1）。② AK/KI の `importHorseHistoriesJra.js` は**両 repo 完全同一**で、shared `jra/horseHistories/...` → local `src/data/horseHistories/jra/...` を Contents API（token）→ raw fallback で転記し、`workflow import-horse-histories-on-dispatch.yml`（event `horse-histories-updated`）+ `workflow_dispatch` で駆動する。③ `import-feature-scores-on-dispatch.yml` には「`horse-histories-updated` / `prediction-updated` への相乗りは採用しない」と明記があり、**データ種別ごとに専用 event を立てる前例が確立**している。

### 1. shared 実データ確認結果

- origin/main 上に以下2件が存在することを確認済み（Phase 5 create-only PUT 実績）:
  - `nankan/recentHorseHistories/2026/05/2026-05-22-OOI.json`
  - `nankan/recentHorseHistories/2026/05/2026-05-29-URA.json`
- よって**同期方式は空振りではない**（取込元が実在する）。
- **shared 側パス規則**: `nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-VENUE.json`
- 注意: JRA は `jra/horseHistories/...` で、**category ごとに dataset サブフォルダ名が異なる**（`horseHistories` vs `recentHorseHistories`）。単純な category 差し替えにならない点が後述の方式選定に影響する。

### 2. local 転記先パス

- **AK/KI 共通**: `src/data/recentHorseHistories/nankan/YYYY/MM/YYYY-MM-DD-VENUE.json`
- shared は **category 先頭**（`nankan/recentHorseHistories/...`）。
- local は **dataset 先頭**（`recentHorseHistories/nankan/...`）。
- これは JRA の `jra/horseHistories/...` → `src/data/horseHistories/jra/...` と**同じ反転思想**を踏襲する。

### 3. 採用方式と確定命名表

**採用方式: A案（JRA とは別 script・別 workflow・別 event）**

採用理由:
- 稼働中の JRA horseHistories 同期（`importHorseHistoriesJra.js`）を**改変せず回帰リスクをゼロにする**。
- JRA horseHistories と南関 recentHorseHistories は**配置・用途・dataset 名が異なる**。
- 既存 JRA script の共通化（category 引数化＝B案）は**稼働スクリプト改変で回帰リスクが高い**。
- repository_dispatch event の**混線を避けられる**。
- feature-scores の「相乗りしない」前例と整合する。
- AK/KI へ**対称に追加**しやすい。

確定命名（AK/KI 共通）:

| 要素 | 値 |
|---|---|
| dispatch event | `recent-horse-histories-nankan-updated` |
| import script | `astro-site/scripts/importRecentHorseHistoriesNankan.js` |
| npm script | `import:recent-horse-histories:nankan` |
| workflow | `.github/workflows/import-recent-horse-histories-nankan-on-dispatch.yml`（`repository_dispatch` + `workflow_dispatch`、date / venues inputs）|
| shared 取得元 | `nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-VENUE.json` |
| local 転記先 | `src/data/recentHorseHistories/nankan/YYYY/MM/YYYY-MM-DD-VENUE.json` |

> import script は JRA script の取得/token/raw fallback 構造を流用しつつ、**パスのみ**上記に差し替える（JRA script 自体は触らない）。

### 4. AK/KI の同梱方式

- **AK**: `src/data` 配下に置けば既存 SSR 同梱方式（Netlify adapter が src ツリー全体を SSR Function に取り込む）で取り込まれるため、**追加 config 不要**。
- **KI**: `astro.config.mjs` の `includeFiles` に **`./src/data/recentHorseHistories/**/*.json` を追加必須**。現行 glob `horseHistories/**` は兄弟ディレクトリ `recentHorseHistories/**` を**含まない**。
- `netlify.toml` の `included_files` 追記は **Astro SSR Function には主対策にならない**（KI の astro.config に「netlify.toml の included_files は Astro adapter 生成の SSR Function には効かない」旨の本番診断コメントあり）。必要なら整合用扱いにとどめる。

### 5. 当面の運用

- 最初は **workflow_dispatch による手動 backfill** でよい（6/3・6/4 予想/結果の backfill と同方式）。
- admin 側からの**自動 repository_dispatch 配線は別サブタスク**（`recent-horse-histories-nankan-updated` を誰が送るかは未配線）。
- workflow_dispatch / repository_dispatch の実行は**別許可制**（dispatch token 実行はマコさん側）。

### 6. 禁止事項

- JRA horseHistories 同期 script（`importHorseHistoriesJra.js`）を**改変しない**。
- 既存 `horse-histories-updated` event に**相乗りしない**。
- `horse.recentRaces` を**上書きしない**（注入先は `recentRacesFromHistoriesNankan`）。
- Feature Importance / `generateAdvancedMetrics` / `featureScores` に**接続しない**。
- AI指数・印・買い目を**変更しない**。
- **shared PUT しない**。
- **token 値・env 値を表示しない**。
- **`netlify env:list` / `netlify env:get` を実行しない**。

### 7. 実装前ゲート更新

**確定済み**:
- 配置先（§10.13 §3 / 本§2）
- helper 戻り値形式（§10.13 §5）
- 注入先フィールド名 `recentRacesFromHistoriesNankan`（§10.13 §6）
- `fallbackReason` / `warnings` の扱い（§10.10 §5 / §10.13 §5）
- **同期方式 A案**（本§3）

**残タスク**:
- AK/KI を **origin/main 起点の新ブランチ**へ整備（現状 stale feat ブランチ上）。
- keiba-data-shared local の **15コミット遅れを解消**（pull）。
- 実装は **AK/KI 同時**に import script + workflow（+ KI `includeFiles`）から開始。
- admin 自動 dispatch 配線は**別タスク**。

---

## 11. Phase 整理

| Phase | 内容 | ゲート |
|---|---|---|
| **Phase 1** | docs確定（契約§9.1 + 設計§9.2〜9.4 + 本実装計画） | 今ここ |
| **Phase 2** | stdout dry-run generator（`--dry-run`、書き込みなし） | scripts作成の明示許可 |
| **Phase 3** | ローカルJSON生成（`--write-local`、追跡外） | 保存前検査の合格 |
| **Phase 4** | shared保存前検査（schema/件数/率の自動判定） | 検査ロジック確定 |
| **Phase 5** | shared PUT（`--push`） | **別許可**。GitHub Contents API |
| **Phase 6** | AK/KI 読み取り接続（共通正本化、表示は AK=3/KI=6維持） | 別許可・別タスク |
| **Phase 7** | Feature Importance 改善への利用（50 baseline 退避を flags ベース化） | featureScores.js 等は別タスク |

---

## 12. 未確定論点

- **`racebook-pastrace-suspect` の厳密判定基準** — 現状「results在×馬名不在」で付与。finish一致だが日付/winner不整合（case1型）をどこまで検出するか。
- **保存前検査の閾値** — match率・no-result-file率の許容乖離幅（約61%/35%から何%まで許すか）。
- **horseName 正規化の範囲** — NFKC + 空白/中黒除去で十分か、results 側 `[J]` 等プレフィックスの扱い。
- **recentRaces 最大保持件数** — racebook MAX_PAST_RACES=6 をそのまま出すか、表示用に絞るか。
- **`generatedAt` の扱い** — 生成時刻 or 入力ファイル createdAt のどちらを source にするか。

---

## 13. 今はやらないこと（明示）

- 実装しない / JSON生成しない / shared PUTしない / AK/KI接続しない
- `featureScores.js` を触らない / `computeImportance` を触らない
- `HorseMainCard` / `RaceHorseSection` を触らない
- AI総合指数・印・買い目・予想本文を触らない

---

**関連**: [nankan-recent-horse-histories-contract.md](nankan-recent-horse-histories-contract.md) / [nankan-recent-horse-histories-dryrun-design.md](nankan-recent-horse-histories-dryrun-design.md) / [nankan-past-races-audit.md](nankan-past-races-audit.md) / [cross-project-safety-rules.md](cross-project-safety-rules.md)
