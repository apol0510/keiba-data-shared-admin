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
| passingOrder欠損件数 | cornerData欠落分 |
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
