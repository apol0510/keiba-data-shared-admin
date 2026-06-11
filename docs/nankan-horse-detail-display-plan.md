# 南関 馬詳細表示・5走表示化 実装計画

> 進捗管理ドキュメント。南関 recentHorseHistories の **5走表示化（Phase A）** と、
> 中央版相当の **馬詳細データ表示（Phase B）** を、混線させずに段階管理する。
> どこまで完了し、何が未完了か、何が禁止か、完了条件は何かを明文化する。
>
> **最終更新: 2026-06-05**

---

## 1. 目的

- 地方競馬公式の出馬表が5走表示であることに合わせ、南関 recentHorseHistories を **正本JSON・表示とも最大5走** にする。
- 中央版（JRA）のような **各馬の詳細データ表示**（プロフィール・通算成績・条件別成績・直近10走）を南関にも出せるようにする。
- ただし上記はすべて **表示用途**に限定し、`featureScores` / `generateAdvancedMetrics` / AI指数 / 印 / 買い目には**接続しない**。

**重要: A（5走表示）と B（馬詳細）は別タスク。** 同じ md で管理するが、shared 契約・参照元・UI は分けて扱う。

---

## 2. 現在の確定済み状況（2026-06-05）

### shared PUT 自動化復旧: **完了**
- `GITHUB_TOKEN_KEIBA_DATA_SHARED` write 権限確認済み（fine-grained PAT / Contents:Read&write）。
- `~/.zshrc` 直書き撤去済み → 一時 export 運用へ移行。
- throwaway write 検証成功（`scripts/verify-shared-write.mjs --execute`）。
- `scripts/push-recent-horse-histories.mjs --execute` による本番 PUT 成功。
- **GitHub Web UI 手動追加は不採用**（緊急回避の実績のみ／日常運用にしない）。

### 2026-06-02 FUN 実証済み（自動PUT→AK/KI→表示）
| 項目 | 値 |
|---|---|
| shared path | `nankan/recentHorseHistories/2026/06/2026-06-02-FUN.json` |
| shared commit | `307d1a7` |
| AK import commit | `a20516b` |
| KI import commit | `702c483` |
| KI archive 表示 | OK（クリーンvenue・内部値リーク0・着順あり）|

### 5走表示化方針
- 正本JSON・表示とも **最大5走**（公式出馬表に合わせる）。
- `featureScores` / `generateAdvancedMetrics` / AI指数 / 印 / 買い目 非接続。
- `horse.recentRaces` は変更しない（injected `recentRacesFromHistoriesNankan` のみ表示件数を5化）。

### 2026-06-03 FUN
- `maxLen=5` / validate PASS / shared 未存在 / dry-run PASS。
- 新方針（最大5走）では **本番 PUT 候補として再評価可**。
- ※テンカハル型「予想日同日・順序乱れ」は **データ品質問題（Phase C）** として別管理。

---

## 3. 作業範囲

### Phase A: 南関 recentHorseHistories 正本最大5走・表示最大5走
公式出馬表(5走)に合わせ、既存 `recentRacesFromHistoriesNankan` の保持・表示件数を5にする。**影響小・優先**。

### Phase B: 中央版相当の馬詳細データ表示
プロフィール・通算成績・条件別成績・直近10走。`recentHorseHistories` だけでは不足。参照元・集計ロジック・UIが別で**影響範囲が広い**。Phase A 完了後に設計。

### Phase C: データ品質検査
予想日同日・未来日・順序乱れ等の WARN 検出（generator/validator）。5走化で露出が増えるため分離管理。

### Phase D: admin 自動 dispatch 配線
shared 追加後に AK/KI へ自動同期する工程。現状は手動 `workflow_dispatch` backfill のみ。token write 復旧済みなので着手可能だが本計画の最後。

---

## 4. やらないこと・禁止事項

- GitHub Web UI 手動追加を**運用方針として採用しない**。
- `horse.recentRaces` を変更しない。
- `featureScores` / `generateAdvancedMetrics` を変更しない。
- AI指数 / 印 / 買い目 を変更しない。
- **片側 repo（AK だけ / KI だけ）に寄せた修正をしない**。AK/KI で表示方針を分岐させない。
- shared 契約を曖昧にしない（正本の最大走数を明文化する）。
- JSON を手動編集しない。
- A（5走表示）と B（馬詳細）を1つの実装で混ぜない。

---

## 5. 既存確認結果（read-only 監査 2026-06-05）

### 5.1 南関 recentHorseHistories が持つ項目
- horse 単位: `horseName`, `horseNumber`, `recentRaces` のみ。
- recentRace 単位: `date`, `venue`, `venueCode`, `raceNumber`, `raceName`, `distance`, `distanceMeters`, `surface`, `trackCondition`, `headCount`, `horseNumber`, `finish`(着順), `popularity`(人気), `bodyWeight`(馬体重), `jockey`(騎手), `carriedWeight`(斤量), `time`, `passingOrder`, `last3f`, `margin`, `opponentName`(=勝ち馬) ＋ 内部値(`_status`/`resultMatched`/`dataQualityFlags`/`sourcePriority`/`resultMatchKey`/`_timeFail`/`_unknownVenue`/`yearInferred`)。
- **持っていない**: horse 単位のプロフィール(父/調教師/現走騎手・斤量)、通算成績、条件別成績。recentRaces は **最大5走**（直近10走は無い）。

### 5.2 中央版 JRA horseHistories が持つ項目
- top: `date`, `venue`, `venueCode`, `horses`, `stats`, `failures`, `source`, `sourceR1Url`, `generatedAt`。
- horse 単位: `horseId`, `horseName`, `history`(全履歴→直近10走可), `recent5`(直近5走), `totalRuns`(通算), `sourceUrl`。
- 生成: `scripts/jra/auto-fetch-horse-histories.mjs`（取得→push→dispatch）。南関 recentHorseHistories(racebook+results 由来)とは**別パイプライン**。

### 5.3 AK/KI の南関過去走 表示箇所（5走化対象）
- **AK（4ファイル・すべて4走cap）**:
  - `free-prediction/nankan.astro`: `slice(-4).reverse()` ×4 ＋ ローカル `RECENT_LABELS=['前走','2走前','3走前','4走前']`(4要素・フォールバック無)。
  - `premium-prediction/nankan.astro`: `slice(0,4)` ×2 ＋ summary `過去{Math.min(4, …)}走`。
  - `components/HorseMainCard.astro`: `slice(0,4)`。
  - `components/RaceHorseSection.astro`: `slice(0,4)` ×2。
  - 行レイアウト（`recent-race-row`: venue/distance/rank/meta）。premium/コンポーネントは走前ラベル無し。
- **KI（3ファイル・すべて4走cap）**:
  - `free-prediction/nankan/[slug].astro` / `free-prediction/nankan/index.astro` / `prediction/nankan/index.astro`: `getDisplayRecentRacesForNankan(horse).slice(0,4)`。
  - ラベル: `RECENT_LABELS[rIdx] || \`${rIdx+1}走前\``。**`RECENT_LABELS` は既に5要素 `['前走'..'5走前']`＋フォールバック** → ラベル変更不要。
- wrapper `getDisplayRecentRacesForNankan` 自体は cap せず（normalize＋AK no-reverse/KI reverse）。cap は呼び出し側 slice のみ。

### 5.4 feature/AI 非接続
- AK/KI とも feature系(`importFeatureScores.js` 等)に `recentRacesFromHistoriesNankan` 参照**なし**。5走化・馬詳細追加とも予想ロジック非接続。

---

## 6. Phase A 詳細: 5走表示化

**目的**: 公式出馬表に合わせ、南関 recentHorseHistories を正本・表示とも最大5走にする。

**対象**:
- admin: `scripts/validate-recent-horse-histories.mjs`（`maxLen <= 5` 検査追加。>5 で FAIL・maxLen/分布を出力）／ docs 契約更新／ generator は実質 racebook 最大5走で既に ≤5（防御的に最大5走 cap を入れる案も可）。
- AK: `free-prediction/nankan.astro`（`slice(-5)` ＋ ローカル `RECENT_LABELS` に `'5走前'` 追加）／ `premium-prediction/nankan.astro`（`slice(0,5)` ＋ summary `Math.min(5, …)`）／ `HorseMainCard.astro`（`slice(0,5)`）／ `RaceHorseSection.astro`（`slice(0,5)`）。
- KI: 3ページの `slice(0,4)` → `slice(0,5)`（ラベルは既存5要素で対応済）。

**方針**: 正本JSON 最大5走 / 表示 最大5走 / **AK・KI 同時実装** / feature・AI 非接続 / `horse.recentRaces` 不変。

**完了条件**:
- [ ] validator が `maxLen <= 5` を確認（>5 で FAIL）。
- [ ] 2026-06-03 FUN が validate PASS（maxLen=5 許容）。
- [ ] 2026-06-03 FUN が shared PUT 可能候補。
- [ ] AK/KI で5走表示を実地確認。
- [ ] 内部値リーク 0 / date-suffix fallback 0 / CSS 崩れなし。
- [ ] docs に「正本最大5走・表示最大5走」を明文化（JRA 4走固定とは別系統と明記）。

---

## 7. Phase B 詳細: 中央版相当の馬詳細表示

**目的**: 中央版のように、南関でも各馬の詳細データを表示する。

**中央版相当の項目**:
- プロフィール: 父 / 騎手 / 斤量 / 調教師
- 通算成績: 通算 / 勝率 / 連対率 / 3着内率
- 条件別成績: ダート / 同距離 / 同会場
- 競走成績（直近10走）: 日付 / 会場 / 距離 / 着順 / 人気 / レース名 / 騎手 / 馬体重 / タイム / 勝ち馬

**注意（監査結果）**:
- recentHorseHistories は **最大5走の表示用途**。中央版相当のうち **通算成績・条件別成績・直近10走は recentHorseHistories だけでは不足**。
- プロフィール(現走 父/騎手/斤量/調教師)は **racebook（race-data-importer 由来）**に存在し、AK/KI の既存予想表示でも参照済み。
- 通算成績・条件別成績は **results / archiveResults からの集計**、または JRA `horseHistories` 相当の**新規生成パイプライン**が必要。
- 直近10走は racebook pastRaces(最大5)では不足 → 追加取得/生成が必要。
- → Phase B は参照元・集計ロジック・UI が別で影響範囲が広い。**Phase A 完了後に read-only 設計**する。

**完了条件**:
- [ ] 中央版の馬詳細コンポーネントと参照元が特定済み。
- [ ] 南関で利用可能なデータ項目が整理済み。
- [ ] 不足項目（通算/条件別/直近10走）の生成・参照方式が決定済み。
- [ ] AK/KI 共通方針が決定済み。
- [ ] 表示専用データとして feature/AI 系と分離済み。
- [ ] 実装後、AK/KI で表示確認済み。

---

## 8. 必要なデータ項目と参照元候補

| 項目 | 中央版 | 南関 既存で可否 | 参照元候補 | 難度 | 注意 |
|---|---|---|---|---|---|
| 父 | あり | △（現走のみ） | racebook | 低 | recentHorseHistories に無し |
| 騎手（現走） | あり | ○ | racebook | 低 | |
| 斤量（現走） | あり | ○ | racebook | 低 | |
| 調教師 | あり | △ | racebook | 低 | |
| 通算成績 | あり | ✕ | results/archiveResults 集計 or 新規生成 | 高 | recentHorseHistories に無し |
| 勝率/連対率/3着内率 | あり | ✕ | 同上（集計） | 高 | |
| ダート成績 | あり | ✕ | results 集計 | 高 | |
| 同距離成績 | あり | ✕ | results 集計 | 高 | |
| 同会場成績 | あり | ✕ | results 集計 | 高 | |
| 直近10走 | あり | ✕（最大5走） | 追加取得/生成 | 高 | recentHorseHistories は最大5走 |
| 日付/会場/距離/馬場/着順/人気/レース名/騎手/馬体重/タイム/勝ち馬（過去走） | あり | ○（最大5走分） | recentHorseHistories(recentRace) | 低 | 6走目以降が無い |

---

## 9. AK/KI 影響範囲

- **Phase A**: AK 4ファイル（slice 複数＋free のラベル配列＋premium summary 文言）/ KI 3ファイル（slice のみ）。CSS は縦リスト/アコーディオンで固定4列なし＝崩れリスク低（実装後に実地確認）。
- **Phase B**: 新規コンポーネント／新規データ参照。AK `HorseMainCard` / `RaceHorseSection` / premium・free ページ、KI nankan 3ページ。featureScores 系とは分離。
- **両 Phase とも AK・KI 同時・同一方針**（片側寄せ禁止）。

---

## 10. featureScores / AI系への非接続方針

- 表示する詳細データ（5走 / 馬詳細）は **すべて表示専用**。`featureScores` / `generateAdvancedMetrics` の入力に**しない**。
- `horse.recentRaces`（特徴量入力源）は**変更しない**。
- injected `recentRacesFromHistoriesNankan` および Phase B の新規詳細フィールドは、表示 wrapper/コンポーネント経由のみで参照する。
- AI指数 / 印 / 買い目は不変。

---

## 11. 完了条件（全体）

- [ ] Phase A: 正本・表示とも最大5走で AK/KI 実地確認・docs 明文化。
- [ ] Phase B: 馬詳細（プロフィール/通算/条件別/直近10走）の参照元決定・実装・AK/KI 表示確認。
- [x] Phase C: データ品質検査。**C-1〜C-7 完了**（validator 強化・generator 根治・横展開・差分監査・shared PUT・AK/KI 逐次同期・本番確認）。06-04 duplicate のみ WARN 据え置き。
- [~] Phase D: admin 自動 dispatch 配線。**D-1 設計方針を docs 記録済（§18）**。D-2 方式A 実装は token 経路確定後。
- [ ] 全 Phase で feature/AI 非接続・片側寄せなし・shared 契約明確。

---

## 12. 進捗チェックリスト

### Phase A: 5走表示化
- [x] validator `maxLen <= 5` 追加（>5 で FAIL・maxLen/分布を出力）(2026-06-05)
- [x] generator 防御的に最大5走 cap（≤5 は無変更・cappedExpected 整合）(2026-06-05)
- [x] docs 契約更新（正本5走・表示5走）(2026-06-05)
- [x] AK free/premium/HorseMainCard/RaceHorseSection 5走化（slice・summary・RECENT_LABELS）(2026-06-05)
- [x] KI 3ページ 5走化（slice(0,5)。RECENT_LABELS は既存5要素で対応）(2026-06-05)
- [x] 2026-06-03 FUN 再生成 validate PASS（maxLen=5・分布{1:1,2:2,3:20,4:99,5:10}）(2026-06-05)
- [x] AK/KI 実地表示確認（リーク0・fallback0・CSS）※ commit/merge/deploy 後 — **Phase A 完了 (2026-06-05)**（§15 参照）
- 注: featureScores の `recentRaces.slice(0,4)`（AK L57 / KI L112）は **horse.recentRaces 特徴量入力**で Phase A 対象外＝不変。

**→ Phase A は完了扱い (2026-06-05)。詳細は §15。**

### Phase B: 馬詳細表示
- [ ] 中央版コンポーネント/参照元 特定
- [ ] 南関 不足項目の生成/参照方式 決定
- [ ] 表示専用データ設計（feature 分離）
- [ ] AK/KI 実装・表示確認

### Phase C: データ品質
- [x] read-only 監査（06-02〜06-05 FUN・テンカハル型再現・根因2系統特定）(2026-06-05)（§16 参照）
- [x] **Phase C-1**: validator に同日/未来日=FAIL・順序乱れ/重複=WARN を追加・実ファイルで検証 (2026-06-05)（§16 参照）
- [x] **Phase C-2**: generator 根治（`parsePastRaceDate` 同月日=前年化／同日・未来日除外フィルタ／常時昇順ソート）・4日再生成で同日0・未来日0・順序乱れ0 を確認 (2026-06-05)（§17 参照）
- [x] **Phase C-3**: 横展開検証（OOI/KAW/URA を tmp 再生成・全 PASS・除外0）(2026-06-05)
- [x] **Phase C-4**: 既存 shared 6件の再生成・差分監査（構造/件数不変・順序整列＋同月日年補正のみ・06-03/06-04 が FAIL→PASS）(2026-06-05)
- [x] **Phase C-5**: shared 上書き PUT（6件・sha 指定の直接 API PUT・全 HTTP 200・PUT後 validator PASS）(2026-06-05)
- [x] **Phase C-6/6b/6c**: AK/KI 逐次 dispatch 同期（一括は concurrency で cancel→逐次で全12件取込・validator PASS）(2026-06-05)（§18 参照）
- [x] **Phase C-7**: 本番/表示確認（KI 06-03/06-04 HTTP200・leak0・テンカハル/ケイアイメビウス是正・AK latest 健全）(2026-06-05)

### Phase D: 自動 dispatch
- [x] **Phase D-1**: 設計方針を docs 記録（方式A単発 opt-in＋バックフィル逐次・updates非対応・concurrency注意・token経路）(2026-06-05)（§18 参照）
- [x] **Phase D-2**: 方式A 最小実装。`scripts/dispatch-recent-horse-histories-nankan.mjs` 追加（単発 opt-in dispatch・多段ゲート・byte一致gate＝案ア・AK/KI両token必須・dispatchToTargets不使用）(2026-06-05)（§19 参照）。**実 dispatch 運用テスト成功（2026-06-01 FUN 1件・マコさん直接実行・AK/KI 204→workflow success→両repo取り込み）(2026-06-05)（§20 参照）**

---

## 13. 未解決課題

- 通算成績・条件別成績の集計を **admin 側で生成（正本化）するか、表示側で集計するか**（CLAUDE.md の「admin/shared 中心」原則に従えば admin 生成が原則）。
- 直近10走を出すなら、racebook pastRaces(最大5) を超える履歴の**取得元**（JRA は auto-fetch、南関は keiba.go.jp robots.txt Disallow に留意）。
- テンカハル型データ品質（予想日同日・順序乱れ）の検出・是正方針（Phase C）。**→ C-1 で validator 検出は実装済（§16）。C-2 generator 根治が残**。
- 5走化に伴う generator の最大走数 cap（5）を入れるか（防御）。

---

## 15. Phase A 完了記録 (2026-06-05)

**Phase A（南関 recentHorseHistories 正本最大5走・表示最大5走）はソース反映まで完了。**

### 反映完了サマリ
- **PR merge 済み**: admin / AK / KI（実装3リポジトリすべて main 反映）
- **06-03 FUN shared PUT 成功**: `nankan/recentHorseHistories/2026/06/2026-06-03-FUN.json`
  - shared commit: `a5c006ab8927dec7462b4e3d6e83de24b7e0bfd2`
  - validate PASS（maxLen=5・分布 {1:1, 2:2, 3:20, 4:99, 5:10}・recentRaces=511・recentRacesPositive=132・horses=132・races=12）
- **AK import 成功**: commit `1502c46950130f79fe224728a0bebef47861a545`（変更=当該1ファイルのみ）
  - path: `astro-site/src/data/recentHorseHistories/nankan/2026/06/2026-06-03-FUN.json`
- **KI import 成功**: commit `153d947fd79ddae7ecfc9095b9deaa1d52e112f3`（変更=当該1ファイルのみ）
  - path: 同上
- **KI 本番で5走表示確認済み**: `https://keiba-intelligence.netlify.app/free-prediction/nankan/2026-06-03-funabashi/`（HTTP 200・title「2026-06-03 船橋 AI予想」・`<span class="recent-tag">5走前</span>` 実描画・fallback なし）
- **AK は latest-only ルーティングのため 06-03 個別URLは目視不可**（今回の不具合ではなく現行仕様による確認制約）。AK 側にも 06-03 FUN の recentHorseHistories JSON は取込済み、latest ページは HTTP 200 正常。AK の日付指定ルートは後日別タスクとして設計から扱う（本フェーズでは追加しない）。

### 非接続維持の確認
- featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目 / horse.recentRaces は**非接続を維持**（AK/KI の import commit は recentHorseHistories の当該1ファイルのみ）。
- 内部キーリークなし（`recentRacesFromHistoriesNankan` 0）・診断値リークなし（`source-results-enriched` / `source-racebook-only` / `passingOrderMissing` 0）。

### 判定
**Phase A 完了扱い。** 次は Phase B、または AK 日付指定ルート検討を別タスク化。

---

## 16. Phase C データ品質 read-only 監査結果 & C-1 validator 強化 (2026-06-05)

### read-only 監査結果（06-02〜06-05 FUN）
shared / AK / KI の 06-03 FUN（AK/KI は byte 一致 = 再シリアライズ差のみ）と、比較対象 shared 06-02 / 06-04 / 06-05 FUN を read-only で監査。

| 開催日 | 同日混入 | 未来日 | 順序乱れ | 重複日 | maxLen |
|---|---|---|---|---|---|
| 2026-06-02 FUN | 0 | 0 | 3頭 | 0 | 4 |
| 2026-06-03 FUN | **1**（テンカハル） | 0 | 7頭 | 0 | 5 |
| 2026-06-04 FUN | **1**（ケイアイメビウス） | 0 | 8頭 | **2件** | 5 |
| 2026-06-05 FUN | 0 | 0 | 1頭 | 0 | 4 |

- **テンカハル型（予想日同日混入）は 06-03 固有ではなく recentHorseHistories 全体の再発パターン**（4日中2日）。同日エントリは常に `racebook-only` で `racebook-pastrace-suspect` フラグ付き。
- **順序乱れ（古→新昇順でない）は全4日に存在**。
- **重複日は 06-04 のみ**（ノーヴヒーロー 2026-03-10×2 / マサノプレジオーソ 2026-05-06×2）。
- **maxLen は全日 5 以下で Phase A 契約は維持**。
- ※監査初稿の `missingRank=511 / missingFieldSize=511` は監査スクリプトのキー名誤りによる誤検出（実スキーマは `finish` / `headCount`、`fieldSize` キーは出力禁止設計）。validator には持ち込まない。

### 根因 2 系統（generator）
1. **同日混入**: `enrich-recent-horse-histories.mjs` `parsePastRaceDate`（L141）が `Date.UTC(...) > base` の**厳密 `>`** で前年シフトを判定。予想日と月日が一致する過去走は前年化されず**当年＝予想日と同日**になる。さらに `rr.date >= baseDate` を除外するフィルタが無いため、当日レース行が「過去走」として残る。
2. **順序乱れ**: `limitRecentRacesToLatest5`（L322）が `races.length <= 5` で**早期 return（無ソート）**。≤5走時は racebook 入力順をそのまま保持するため、racebook が非昇順だと表示契約（古→新）が崩れる。

### Phase C-1: validator 強化（generator は変更せず、shared PUT 前ゲートを先行）
`scripts/validate-recent-horse-histories.mjs` に以下を追加（generator 挙動は不変更）。

| 検出項目 | 判定 | 根拠 |
|---|---|---|
| `recentRaces.date > raceDate`（未来日） | **FAIL** | 予想日より後のレースが過去走として表示されるのは表示品質違反 |
| `recentRaces.date === raceDate`（同日＝テンカハル型） | **FAIL** | 同上。既存 `racebook-pastrace-suspect` の率閾値（10%）では 1/511 を検知できないため専用検査を追加 |
| `recentRaces.length > 5` | **FAIL**（既存 maxLen>5 検査を流用・重複実装せず） | 最大5走契約違反 |
| 日付順が古→新昇順でない | **WARN** | 表示品質問題だが C-2 generator 根治との兼ね合いでまず WARN |
| 同一日重複 | **WARN** | 同一日複数出走の可能性ゼロでないためまず WARN。`date+venue+raceNumber` 一致は将来 FAIL 候補 |

- 集計値: `sameDayRecent / futureRecent / orderBroken / duplicateDate / overMaxRecentRaces` を `[日付品質]` 行に出力。各項目の代表例を最大5件出力。
- 既存 PASS / HOLD / FAIL 設計に準拠。FAIL=exit2 / HOLD=exit3 / PASS=exit0。順序乱れ・重複は非ブロッキング WARN（HOLD 化しない）。

### 検証結果（実ファイル・shared PUT/dispatch なし）
admin の gitignore 済 `tmp/` にコピーして実行：
- **06-03 FUN → FAIL**（同日1件 FAIL：テンカハル / 順序乱れ7頭 WARN）
- **06-04 FUN → FAIL**（同日1件 FAIL：ケイアイメビウス / 順序乱れ8頭 WARN / 重複2件 WARN）
- **06-02 FUN → PASS**（順序乱れ3頭 WARN のみ・非ブロッキング）
- **06-05 FUN → PASS**（順序乱れ1頭 WARN のみ）
- maxLen>5 は全日なし。

### 次工程（Phase C-2）
→ **§17 で実装・検証完了 (2026-06-05)**。

---

## 17. Phase C-2 generator 根治 実装・検証 (2026-06-05)

Phase C read-only 監査（§16）で特定した2系統の根因を `scripts/enrich-recent-horse-histories.mjs` で根治。**generator のみ変更。shared / AK / KI / validator は不変更。**

### 根因の正体（racebook 原本確認で判明）
- テンカハル(06-03 R11)「船橋 6.3」は **finish=6・winner=サントノーレ の完走済みレース**＝当日レースの混入ではなく**実在の 2025-06-03 走**。月日が予想日と一致するため厳密 `>` 判定で誤って当年(2026)化されていた。
- ケイアイメビウス(06-04 R8)「船橋 6.4」も finish=1 の実在 2025-06-04 走。
- → **本筋は年推定の修正**（同月日は前年）。当日レースの混入ではないため「行を消す」のではなく「正しい年に直す」のが正解。

### 修正内容
1. **`parsePastRaceDate`**: 年シフト判定を `Date.UTC(...) > base` → **`>= base`** に変更。予想日と同月日の過去走は前年として推定（予想日当日は出走前で過去走になり得ないため）。
2. **同日/未来日 除外フィルタ（防御層）**: `buildRecentHorseHistories` で `rr.date >= baseDate` を除外（`excludedSameOrFuture` を集計・ログ出力）。①の `>=` 化で通常は発生しないが、想定外データへのバックストップ。
3. **`limitRecentRacesToLatest5`**: `length <= 5` の早期 return を撤去し、**件数に関係なく常に date 昇順（古→新）**へ整列。6件以上は降順で最新5件採用後に昇順へ。
4. **件数整合**: `cappedExpected` は除外後件数で算定し、generator 内 `validateOutput` の `recentOut === cappedExpected` を維持。

### 4日再生成 検証（write-local → tmp/、shared PUT/dispatch なし）
| 開催 | generator validateOutput | 除外 | 同日 | 未来日 | 順序乱れ | 重複 | maxLen | C-1 validator |
|---|---|---|---|---|---|---|---|---|
| 06-02 FUN | PASS | 0 | 0 | 0 | 0 | 0 | 4 | **PASS** |
| 06-03 FUN | PASS | 0 | 0 | 0 | 0 | 0 | 5 | **PASS** |
| 06-04 FUN | PASS | 0 | 0 | 0 | 0 | 2 | 5 | PASS（重複WARNのみ） |
| 06-05 FUN | PASS | 0 | 0 | 0 | 0 | 0 | 4 | **PASS** |

- **除外0**: `>=` 化で同日エントリは正しく前年走へ再ラベルされ、ハード除外は不要（フィルタは防御として常駐）。
- 副次効果: 06-03 の `match-ambiguous` 1→0、`racebook-pastrace-suspect` 7→6（同日エントリが当年results誤マッチから前年no-fileへ是正）。`year-inferred` は同月日分だけ増加。

### duplicateDate を C-2 で強制是正しない理由
06-04 の重複（ノーヴヒーロー「船橋 3.10」×2、マサノプレジオーソ「船橋 5.6」×2）は **racebook 原本由来**で、各行の finish/jockey/winner が**別物**＝別レース。racebook が MM.DD のみで年を持たないため**前年走が年推定で当年へ重なった**可能性が高い。強制 dedup は実データ欠落リスクがあり、results 突合ベースの年判別という別課題になるため、**WARN 据え置き**（validator が「date+venue+raceNumber 一致は将来 FAIL 候補」と明示）。必要なら別タスク化。

### 17.x PR-3 duplicateDate 精密判別 read-only監査結果 (2026-06-05)

上記「強制是正しない理由」で立てた **「前年走が年推定で当年へ重なった」仮説は、PR-3 の results 突合で否定された**。実際の原因は **racebook 原本への別馬近走の混入＋resultMatchKey 粒度不足の複合**だった。yearInferred=false で年推定は無関係。

#### 該当2件の精密判別
- **R5 ノーヴヒーロー / 2026-03-10**
  - recentRaces 2行: 着7（1:40.8・騎手 山口達・473kg）／ 着8（1:40.6・騎手 山中悠・487kg）
  - results 正本（2026-03-10-FUN race7）: ノーヴヒーローは **8着のみ・1回**（山中悠希・1:40.6）。**7着は別馬ボニファシオ**（岡村健司・1:40.4）。
  - → **着8の行が正**。**着7の行は racebook 原本に混入した誤行**（racebook raw の raceClass が「3歳」）。
- **R7 マサノプレジオーソ / 2026-05-06**
  - recentRaces 2行: 着7（騎手 岡村健・491kg）／ 着6（騎手 野畑凌・505kg）
  - results 正本（2026-05-06-FUN race2）: マサノプレジオーソは **6着のみ・1回**（野畑凌・1:17.3）。**7着は別馬キョウエイサマンサ**。
  - → **着6の行が正**。**着7の行は racebook 原本の誤行**（同じく raceClass「3歳」）。

#### 原因分類
- **主因 A**: racebook 原本の `pastRaces` に**同一日付の行が2つ**実在（別馬の近走が当該馬へ誤混入）。generator は raw を忠実反映。
- **副因 D**: `resultMatchKey = date|venueCode|horseName`（`enrich-recent-horse-histories.mjs`）が粗く、**raceNumber も finish も含まない**。同日同場同馬名の2 raw 行が**同一 key で衝突**し、誤行と正行を区別できない。
- **B 除外**: 別レース/別年への誤突合ではない（results に当該日・当該馬が実在）。
- **C 除外**: `yearInferred=false`、date 推定起因ではない。
- 補足: generator は matched 時に **finish/jockey/time/bodyWeight を racebook raw のまま保持**し、raceName/raceNumber/horseNumber のみ results 側で補完する（`enrich:283-310`）。**racebook raw の finish/jockey が results 正本の rank/jockey と一致するか検証していない**ため、誤行にも `resultMatched:true` が付いてしまう。

#### 単純 dedup を禁止する理由（実証）
- duplicateDate を **date だけで単純 dedup してはいけない**。
- 配列順では**誤行が先に来る場合がある**（ノーヴ/マサノとも誤行が前）。date 単独 dedup は**正しい行を捨て、誤行を残す**危険がある。
- 正誤判定には **results 正本の rank/jockey との突合**が必須。
- **表示側で隠さず、generator 側で正本突合により根治**する。

#### Phase B 表示への影響
- AK/KI 取り込み済み `2026-06-04-FUN.json` にも**同一の重複が存在**（shared verbatim）。
- whitelist に含まれる `date` / `rank(finish)` / `jockey` だけでも**矛盾が見える**（内部キーは漏れないが、同一日付で異なる着順・騎手が2行並ぶ）。
- **Phase B の馬詳細表示拡張前に duplicateDate 根治を優先**する。**PR-4/PR-5（AK/KI 表示拡張）は duplicateDate 根治後**に進める。

#### 今後の修正方針案（実装はしない・次タスクで設計）
- **generator 側で修正**する。表示側 AK/KI の場当たり対応・shared JSON 手編集はしない。
- matched 時に **racebook raw の finish/jockey（正規化）を results 正本の rank/jockey と突合**し、
  - **案(a)**: 不一致行を除外、または `resultMatched:false` ＋ `result-mismatch` suspect フラグ化（正本優先で誤行を落とす）。
  - **案(b)**: matched 時は finish/jockey/time/bodyWeight も results 正本で上書きし、同一化した行を dedup。
  - どちらを採用するかは**次タスクで設計**（案(a) が安全側）。
- 補助的に **resultMatchKey へ raceNumber / finish を加えて衝突解消**することも検討。
- generator 修正後、**対象日を再生成 → validate → shared PUT → 同一 artifact dispatch** の通常手順（§19/§20）で反映する。

### 17.y duplicateDate generator根治の実装前設計 (2026-06-05)

§17.x（PR-3 read-only監査）の結論を受けた **実装前設計**。本節は設計の docs 化のみで、**generator 実装・JSON 再生成・shared PUT・dispatch は未実施**。実装は後続 PR（下記 PR-B 以降）で行う。

#### 1. 根治対象（一般化）
直接の対象は **2026-06-04 FUN**（R5 ノーヴヒーロー: 2026-03-10 / R7 マサノプレジオーソ: 2026-05-06）。ただし**この2頭の個別対応ではなく、同型の racebook 混入（別馬近走の誤混入による同日重複）が将来どの日・どの場で起きても検出・抑制できる generator 側の一般化対応**として設計する。

#### 2. 原因の再整理
- racebook raw `pastRaces` に、**同一馬・同一日付の複数行**が存在する。
- そのうち一部は**別馬由来の近走が混入した誤行**。
- **results 正本には該当馬の正しい1行だけ**が存在する。
- 現状 generator は raw の **finish / jockey / time / bodyWeight を保持**し、**raceName / raceNumber / horseNumber を results で補完**している（`enrich:283-310`）。
- `resultMatchKey = date|venueCode|horseName` の**粗い粒度**で、誤行と正行を区別できない。
- **raw finish/jockey と results rank/jockey の一致検証がない**ため、誤行にも `resultMatched:true` が付く。

#### 3. 採用する基本方針
- **generator 側で根治する**。AK/KI 表示側では対応しない。
- **shared JSON 手編集はしない**。
- **date 単独 dedup はしない**。
- **results 正本との突合で誤行を判定する**。matched 時に **raw finish/jockey を results rank/jockey と照合**する。
- 不一致行は **recentRaces から除外**するか、少なくとも **`resultMatched:false` ＋ `dataQualityFlags` に `result-mismatch` を付与**する。
- **現時点の推奨は「除外優先（案A）」**。
  - 理由: ①Phase B 表示で矛盾行を出さない ②results 正本に正しい1行がある場合、誤行を残す価値が低い ③suspect 表示や UI 側隠しは表示側責務を増やすため避ける。
- ただし**完全に消す場合のリスク**も併記:
  - results 正本が欠損している日では**除外しすぎる危険**がある。
  - そのため**一致検証は `resultMatched:true` の行に限定**する。
  - **results 正本が見つからない行は現行どおり raw 扱いに留め、安易に除外しない**。

#### 4. 判定条件案
**4.1 正常行（通常採用）**
```
resultMatched=true
かつ raw finish == results rank
かつ (raw jockey == results jockey〔正規化後〕 または jockey欠損で比較不能)
```
**4.2 誤行候補**
```
resultMatched=true
かつ (raw finish != results rank  または  raw jockey が results jockey と明確に不一致)
→ 案A: recentRaces から除外する（Phase B前の根治として第一候補）
→ 案B: resultMatched=false に落とし dataQualityFlags に result-mismatch を付ける
```
**4.3 比較不能（安易に除外しない・現行挙動維持）**
```
results側に該当馬が存在しない / raw finish欠損 / results rank欠損 /
jockey表記が欠損・短縮・異体字などで比較不能
→ 現行挙動を維持。必要なら dataQualityFlags に match-uncertain を付ける（設計候補）
```

#### 5. resultMatchKey 改善案
- 現状 `date|venueCode|horseName` は **raceNumber/finish/jockey を含まず**、同一日同馬の raw 複数行を区別できない。
- 改善方針:
  - **既存 `resultMatchKey` は当面ログ・監査用として保持**（意味を変えると下流監査に影響するため）。
  - **実判定は resultMatchKey 単独に依存しない**。
  - matched 候補には **results 側の raceNumber / rank / jockey / horseNumber を保持**して照合に使う。
  - 必要なら **`resultMatchKeyV2 = date|venueCode|horseName|raceNumber|rank`** を**追加フィールドとして**検討（既存 key の破壊的変更はしない）。

#### 6. validator 強化案
- **duplicateDate は引き続き WARN**。
- ただし **`resultMatched=true` の同一日重複で finish/jockey が矛盾する場合は将来的に FAIL 候補**。
- generator 根治後、**06-04 FUN の duplicateDate=2 が 0 になること**を期待値にする。
- **duplicateDate を date 単独で機械的に FAIL にしない**。

#### 6.5 PR-B 実装済み (2026-06-05)
案A（finish 主判定・jockey 照合なし）を最小実装。
- `matchPastRaceToResult`: MATCHED 候補で `past.finish != null && cand.row.rank != null && Number(past.finish) !== Number(cand.row.rank)` のとき新ステータス **`RESULT_MISMATCH`** を返す（比較不能は MATCHED 維持。NO_FILE/HORSE_ABSENT/AMBIGUOUS 等は不変＝results 欠損行は除外しない）。
- `buildRecentHorseHistories`: 同日/未来日除外と同型に **`RESULT_MISMATCH` を `excludedResultMismatch++; continue;`** で除外（date単独dedupではない）。
- summary / printSummary に `excludedResultMismatch` を追加。validator は不変更。
- 検証（write-local→tmp、shared PUT/dispatch なし）: **06-04 FUN で excludedResultMismatch=2・duplicateDate 2→0・recentRaces 479→477（-2）・validator PASS**。ノーヴヒーローは 2026-03-10 着8のみ／マサノプレジオーソは 2026-05-06 着6のみ残存（各着7誤行を除外）。横展開（06-02/06-03/06-05 FUN・05-22 OOI・05-29 URA）は **mismatch=0・全 PASS・duplicateDate 0・maxLen≤5** で過剰除外なし。
- shared PUT / dispatch / AK・KI 反映は **PR-D 以降**（本実装では未実施）。

#### 6.6 push script 上書きPUT対応 (2026-06-05)
PR-D で既存 shared ファイル（例 06-04 FUN）へ修正版を反映するため、`push-recent-horse-histories.mjs` に update PUT 経路を追加。
- **デフォルトは create-only**（既存ファイルがあると従来どおり中止）。誤上書き防止のため挙動を変えない。
- **既存ファイル更新は 2段ガード必須**: `--allow-overwrite` ＋ `--confirm-overwrite=recent-horse-histories-update` の**両方**が揃ったときだけ update を許可（片方のみは WARN＋create-only 扱いで中止）。
- **update PUT は GitHub Contents API の sha を使う**: 既存確認 GET で `sha` を取得し、PUT body に含めて更新（HTTP200）。create は従来どおり sha なし（HTTP201）。
- **token 値は表示しない**（Authorization / base64 body / env 値も非表示）。
- **update 後も保存後 GET=200・内容一致=true・parse 可・path 一致を確認**（create と同じ安全確認）。
- **06-04 FUN のような既存 shared 修正版の反映は、この上書き経路を使う**（PR-D）。dry-run では PUT せず、update 予定・sha取得済みを表示するのみ。
- 検証（dry-run のみ・実PUTなし）: フラグなし=中止／確認文字列のみ=WARN＋中止／2段揃い=「既存あり（update 予定・sha取得済み）」で PUT せず PASS、を確認。

#### 7. 実装PR分割案（PR-B 以降はまだ実施しない）
```
PR-A: docs設計確定（今回）
PR-B: generatorに raw vs results の finish/jockey一致検証を追加
PR-C: validator期待値・fixtureまたは検証コマンド整備
PR-D: 06-04 FUNを再生成 → validate → shared PUT → 同一artifact dispatch
PR-E: AK/KI取り込み確認
```

#### 8. 回帰確認項目
- 2026-06-04 FUN の duplicateDate が **0** になること
- ノーヴヒーローは **2026-03-10 着8 行のみ**残ること
- マサノプレジオーソは **2026-05-06 着6 行のみ**残ること
- 同日/未来日が **0** のまま
- 順序乱れ **0** のまま
- maxLen **<=5** のまま
- recentRaces 総数の減少が**想定範囲**であること
- 他日 FUN / OOI / KAW / URA に**副作用がない**こと
- featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目に**影響しない**こと
- **horse.recentRaces を変更しない**こと
- AK/KI 表示側に**内部キーが漏れない**こと

#### 9. 禁止事項
- AK/KI 表示側で重複を隠すだけの対応
- shared JSON 手編集
- date 単独 dedup
- resultMatchKey だけを根拠にした削除
- JRA horseHistories への影響
- featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目 変更
- horse.recentRaces 変更
- 一括 dispatch / updates 配列

### 非接続維持
generator のみ変更。featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目 / horse.recentRaces / shared / AK / KI は不変更。shared PUT・dispatch・workflow 実行なし。

---

## 18. Phase D admin 自動 dispatch 配線 設計方針 (2026-06-05)

Phase C は **C-7 まで完了**（shared 6件 PUT → AK/KI 同期 → 本番確認）。本節は今後 shared recentHorseHistories を PUT した後に AK/KI へ安全に同期する配線（Phase D）の**設計方針を実装前に明文化**したもの。**本節時点では実装変更なし（docs記録のみ）。**

### Phase C 同期の最終状態（前提）
- shared / AK / KI とも対象6件（05-22 OOI・05-29 URA・06-02/06-03/06-04/06-05 FUN）が validator PASS。同日0・未来日0・順序乱れ0・maxLen≤5。
- 06-03 テンカハル（→2025-06-03）・06-04 ケイアイメビウス（→2025-06-04）の同日混入は本番反映まで是正済。

### Phase C-6 で起きた concurrency 事故（記録）
6 date × 2 repo を**一括 dispatch**した結果、GitHub Actions の concurrency により**中間 run が cancelled** になった。
- **原因**: AK/KI の import workflow が**単一 concurrency group**（`archive-recent-horse-histories-nankan-update`）。`cancel-in-progress: false` でも、**キュー中の pending run は最新1件のみ残り中間 run が cancel される**（GitHub 仕様）。そのため一括 dispatch では全 date の取り込みが保証されない（1 repo あたり実走は約2 run のみ）。
- **解決**: 未取込分を **1件ずつ逐次 dispatch**（1 dispatch → 当該 run `completed success` を単発確認 → 次）。最終的に AK/KI 両方で全6件 PASS（§12 Phase C-6c）。`gh run watch` / sleep / 長時間監視は不使用。

### 採用方針
- **方式A（admin から単発 opt-in dispatch）を基本**とする。通常運用（1日1場）は単一 dispatch で済むため concurrency 衝突が起きない。
- **バックフィル・複数日同期では方式B（逐次手動 / 逐次ドライバ）を併用**する（1件 dispatch → completed 確認 → 次。pending/in_progress があれば次を投げない）。

### 採用理由
- 既存 `netlify/lib/dispatch.mjs` の `dispatchToTargets(eventType, payload)`（AK+KI 並列 POST・save-* 系で実績）を再利用できる。
- JRA `scripts/jra/auto-fetch-horse-histories.mjs` の `--dispatch` + `--confirm-dispatch=<event>` 二段階確認と思想が一致。
- AK/KI workflow を大きく変えずに済む。

### 不採用方針とその理由
- **updates 配列方式**: 不採用（AK/KI workflow は `client_payload.date`（単一）+ `venues`（CSV）のみ対応。import script も単一 date。対応には両 repo 改修が必要）。
- **一括 dispatch**: 不採用（Phase C-6 で中間 run cancel を発生させた）。
- **concurrency group の date 別分割**: 現時点で不採用（同時 push/commit 競合・reset-hard リトライ機構との相性リスク）。
- **AK/KI workflow / import script 改修**: 現時点で不採用（影響範囲が広がる。得る並列性に見合わない）。

### 実装時の最小差分案（Phase D-2・未着手）
- **admin のみ変更**。AK/KI は不変更。
- shared PUT（`--execute` 成功）後のみ、opt-in `--dispatch` + `--confirm-dispatch=recent-horse-histories-nankan-updated`（二段階確認）で `dispatchToTargets('recent-horse-histories-nankan-updated', { date, venues:[venue], source:'nankan-recent-horse-histories' })` を**単一 date/venues**で呼ぶ。
- **複数日指定時の一括 dispatch はコードで禁止**。バックフィルは逐次ドライバ（1件→completed確認→次）または手動運用に分離。
- 正しい payload: `{ "date":"YYYY-MM-DD", "venues":["FUN"], "source":"nankan-recent-horse-histories" }`。`updates` 配列は使わない。
- dispatch 前に validator PASS を必須ゲートとし、誤配信を防ぐ。

### token 注意（実装前に確定）
- dispatch token / GitHub token の**値は表示しない**。
- 使用 token は `ANALYTICS_KEIBA_TOKEN` / `KEIBA_INTELLIGENCE_TOKEN`（無ければ `GITHUB_TOKEN_KEIBA_DATA_SHARED` にフォールバック）だが、**専用 dispatch token は Claude シェルに届かないことがある**（Phase C-6c は gh keyring=repo scope で代替成功）。`GITHUB_TOKEN_KEIBA_DATA_SHARED` が AK/KI へ dispatch 権限を持つかは未検証。
- **token 権限が未確定のまま自動 dispatch 実装に入らない**。実行主体（マコさん手動 / gh keyring）と token 経路を Phase D-2 着手前に確定する。
- 誤 dispatch 時は AK/KI 側に commit が発生するため admin からは戻せない（rollback は AK/KI 側 revert）。事前 validator PASS を必須とする。

### 触ってはいけない範囲
AK/KI の workflow / import script / concurrency 設定・shared JSON・push スクリプトの create-only 安全ゲート・featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目 / horse.recentRaces。

---

## 19. Phase D-2 単発 dispatch 専用 script 実装 (2026-06-05)

§18 の方式A（admin 単発 opt-in dispatch）を最小実装。**admin に新規 script を1本追加するのみ。AK/KI / keiba-data-shared / push スクリプト / generator / validator は不変更。**

### 追加した script
- `scripts/dispatch-recent-horse-histories-nankan.mjs`（送信専用。shared PUT はしない）。
- 既存 `netlify/lib/dispatch.mjs` の `dispatchToTargets` は**使わない**。理由:
  - token フォールバック（`GITHUB_TOKEN_KEIBA_DATA_SHARED`）があり、**片側だけ skipped になる事故**が起こり得るため。
  - AK/KI **両方の専用 token を必須**にして、欠ければ明示 fail させたいため。
  - JRA CLI（`scripts/jra/auto-fetch-horse-histories.mjs`）に近い**厳格な多段ゲート**を採用するため。

### event / payload（南関専用・JRA とは別）
- event 名: `recent-horse-histories-nankan-updated`（定数ハードコード固定）。
- JRA 用 `horse-histories-updated` は**使用しない**（コード上は注記のみで、定数・payload・送信先に不在）。
- payload は**単一 date / venues 配列**:
  ```json
  { "date": "2026-06-05", "venues": ["FUN"], "source": "nankan-recent-horse-histories" }
  ```
- `updates` 配列は**使わない**。**複数日一括 dispatch は禁止**（1 ファイル = 単一 date / 単一 venue）。
- 送信先は `apol0510/keiba-intelligence` / `apol0510/analytics-keiba` の **2 repo 固定**。

### byte 一致 gate の運用前提（採用方針＝案ア）
```
byte一致gateは「shared PUTに使った同一artifactをdispatchする」ための安全確認である。
後からgeneratorで再生成したtmpとshared現物を比較する用途ではない。
meta.generatedAt は生成ごとに変わるため、事後再生成tmpではbyte一致しないことがある。
そのため運用は generate → validate → shared PUT → 同一artifact dispatch を前提とする。
```
- 検証時、`2026-06-05 FUN` を**事後再生成**した tmp は shared 現物と byte 不一致だった。差分は (1) `meta.generatedAt`（毎回変わる metadata・benign）、(2) 1頭（R4 タカラバディウス）の recentRaces 4走の**並び順のみ**（中身は同一・shared 側が過去生成時点の未ソート artifact）。**これは想定内**で、gate を `generatedAt 除外` 等で緩める案イは**採用しない**（厳格 byte 一致を維持し、PUT したバイトそのものを流す）。

### 多段ゲート（すべて満たした時だけ実送信）
1. `--dispatch` 指定（opt-in。無ければ常に dry-run・送らない）。
2. `--dry-run` 未指定（`--dry-run` は最優先で実送信を止める）。
3. `--confirm-dispatch=recent-horse-histories-nankan-updated` の**完全一致**（二段階確認。JRA event 名なら不一致で中止）。
4. validator **PASS**（FAIL=exit2 / HOLD=exit3 は dispatch 禁止）。
5. validator **WARN 0**、または `--allow-validator-warn` 明示（WARN は exit code を持たず stdout の `⚠ WARN:` 行で検出。許可時も WARN 理由をログに明示し、人間確認を前提とする）。
6. shared **GET=200 かつ tmp と byte 一致**（PUT 成功済みの確証）。
7. `ANALYTICS_KEIBA_TOKEN` 存在。
8. `KEIBA_INTELLIGENCE_TOKEN` 存在。
- 1つでも欠ければ POST に到達せず中止（送信モードでも `failedGates` で一括停止＝**片側送信を物理的に防止**）。

### token 方針
- dispatch 用 token は `ANALYTICS_KEIBA_TOKEN` / `KEIBA_INTELLIGENCE_TOKEN` の**両方必須**。
- `GITHUB_TOKEN_KEIBA_DATA_SHARED` を **dispatch 用フォールバックにしない**（shared GET 確認専用）。
- token 値は**ログに出さない**。**OK / MISSING のみ**表示。
- 実 dispatch は**マコさん直接ターミナル実行**前提（専用 token が Claude シェルに届かないため。Phase C-6c と同運用）。

### この PR で実施しないこと
- 実 dispatch しない / shared PUT しない / AK・KI を変更しない / workflow を変更しない / JSON 手動編集しない。
- dry-run 確認のみ実施（help / 素 dry-run / confirm 一致・不一致 / WARN gate / token MISSING 時の送信前中止 / `--dry-run` 強制停止 / 正常系 validator PASS）。

### 触ってはいけない範囲（再掲）
AK/KI の workflow / import script / concurrency 設定・shared JSON・push スクリプトの create-only 安全ゲート・generator・validator・featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目 / horse.recentRaces。

---

## 20. Phase D-2 実 dispatch 運用テスト成功 (2026-06-05)

§19 の dispatch script を使い、**新規1件**で `generate → validate → shared PUT → 同一 artifact dispatch → AK/KI 取り込み確認` のエンドツーエンド実運用フローを初めて通し、成功した記録。**マコさん直接ターミナル実行**（dispatch 用 token は Claude シェルに届かないため。[[feedback_dispatch_token_runtime]] 同様）。

### 対象（1件のみ）
- **2026-06-01 FUN**（複数日・複数場・一括は禁止。1件で実施）

### 結果
| 工程 | 結果 |
|---|---|
| generator（write-local） | 成功（C-2後 generator） |
| validator | **PASS / WARN 0** |
| shared PUT（`push-recent-horse-histories.mjs --execute`・create-only） | **HTTP status=201** |
| 保存後 GET | **200 / 内容一致=true** |
| dispatch（同一 artifact） | event=`recent-horse-histories-nankan-updated` |
| payload | `{ "date":"2026-06-01", "venues":["FUN"], "source":"nankan-recent-horse-histories" }`（updates 配列なし・JRA event 不使用） |
| AK/KI dispatch 応答 | 両方 **status=204** |
| AK/KI workflow | `gh run list` 上で **success** |
| 取り込み | AK/KI 両 repo に対象 JSON 取り込み確認済み |

取り込み先（両 repo 同一パス）:
```
analytics-keiba   : astro-site/src/data/recentHorseHistories/nankan/2026/06/2026-06-01-FUN.json
keiba-intelligence: astro-site/src/data/recentHorseHistories/nankan/2026/06/2026-06-01-FUN.json
```

### 確認できたこと
- **byte一致gate は「PUT した同一 artifact」をそのまま dispatch することで通過**（再生成すると `meta.generatedAt` が変わり通らない＝§19 案ア の運用が正しいと実証）。
- AK/KI 両方へ単発 dispatch（status=204）→ それぞれの workflow が success → 両 repo に取り込み、まで一気通貫で成功。

### 運用ルール（実証済み・厳守）
- **複数日一括 dispatch は禁止**（concurrency cancel 再発防止。§18 Phase C-6 事故参照）。
- 実運用は必ず **1件ずつ**: `generate → validate(PASS/WARN0) → push(--execute, create-only) → 同一 artifact を dispatch → AK/KI workflow success を単発確認`。
- dispatch 前に **tmp を再生成しない**（同一 artifact を使う）。
- dispatch は **マコさん直接ターミナル**で `ANALYTICS_KEIBA_TOKEN` + `KEIBA_INTELLIGENCE_TOKEN`（両方必須）を設定して実行。token 値は出さない。
- `gh run watch` / sleep / 長時間監視はしない（単発確認のみ）。

### この記録で実施していないこと
- 本 docs 追記以外の実 dispatch / shared PUT / workflow 実行 / AK・KI 変更 / JSON 手動編集はなし。

---

## 21. Phase B：南関馬詳細表示の実装前契約 (2026-06-05)

Phase C/D-2 完了後の read-only 監査（admin/shared/AK/KI 4 repo）を踏まえ、**実装に入る前に**「実装方針・表示責務・禁止事項・PR 分割」を確定する契約節。**この節は docs のみ。実装・scripts・JSON・AK/KI 変更は含まない。**

### 21.1 Phase B の目的
- `recentHorseHistories` を使い、南関の**近走・馬詳細表示を安全に拡張**する。
- **計算系・予想系には接続しない**（featureScores / generateAdvancedMetrics / AI指数 / 印 / 買い目）。
- **`horse.recentRaces` は上書きしない**。表示専用フィールド **`recentRacesFromHistoriesNankan`** のみを使う。
- 表示は必ず **表示 wrapper `getDisplayRecentRacesForNankan()` 経由**（生 JSON を直接テンプレート展開しない）。

### 21.2 shared/admin 側の責務
- `recentHorseHistories` は**表示専用契約**（`schemaVersion: nankan-recent-horse-histories-v0`、構造 `races[].horses[].recentRaces[]`、最大5走）。
- 責務分担:
  - generator = `scripts/enrich-recent-horse-histories.mjs`
  - validator = `scripts/validate-recent-horse-histories.mjs`（PASS=0 / FAIL=2 / HOLD=3、WARN は exit code なし）
  - push（create-only PUT）= `scripts/push-recent-horse-histories.mjs`
  - dispatch（送信専用）= `scripts/dispatch-recent-horse-histories-nankan.mjs`（§19）
- `source` / `diagnostic` / `dataQualityFlags` などの**内部キーを UI に出さない**（whitelist で除去。21.6 参照）。
- **既存 shared JSON の手編集は禁止**（GitHub Web UI 手動追加も不採用）。
- **`duplicateDate` は単純 dedup しない**（21.4 参照）。

### 21.3 AK 側の責務
- AK は **latest-only / `prerender = true`（build 時読み込み）** 前提。日付別ルートは現状なし。
- 読み込み: `lib/loadRecentHorseHistoriesNankan.js` → `injectRecentHorseHistoriesNankan.js`（`horse.recentRacesFromHistoriesNankan` へ注入）→ 表示 wrapper `lib/getDisplayRecentRacesForNankan.js` 経由。
- 表示候補: `components/HorseMainCard.astro` / `RaceHorseSection.astro` / `pages/free-prediction/nankan.astro` / `premium-prediction/nankan.astro`、または新規 `components/NankanHorseDetail.astro`。
- **既存 3項目評価・買い目（三連複）・印・AI指数には接続しない**。
- **AK 専用 UI として設計**し、KI と無理に統一しない（UI 差は正常）。
- AK は prerender=true のため **included_files 制約の影響を受けない**（build 時にデータ同梱）。

### 21.4 KI 側の責務
- KI は**日付別ページ（`free-prediction/nankan/[slug].astro`＝prerender=true）と SSR ページ（`prediction/nankan/index.astro`・`free-prediction/nankan/index.astro`＝prerender=false）が混在**。
- 読み込み: `utils/loadRecentHorseHistoriesNankan.js` → `utils/injectRecentHorseHistoriesNankan.js`（`recentRacesFromHistoriesNankan`）→ `utils/getDisplayRecentRacesForNankan.js`（KI は新→古に reverse）。
- **Feature Importance 6項目（`utils/featureScores.js` の `generateAdvancedMetrics`）とは混同しない**。6項目は `horse.recentRaces` のみ使用。
- **`recentHorseHistories` を `generateAdvancedMetrics` に渡さない**。
- ⚠️ **SSR ページでは included_files 問題の実機確認が必要**: `astro-site/netlify.toml` の `included_files` は現状 `["src/data/horseHistories/**", "src/data/featureScores/**"]` で **`src/data/recentHorseHistories/**` を含まない**。`prerender=false` の 2 ページは本番 Function bundle にデータが同梱されず**注入が黙って失敗→`horse.recentRaces` にフォールバック**する疑い。Phase B でリッチ表示を載せる前に**本番実機で表示有無を確認**し、必要なら included_files 追加を別 PR（PR-2）で行う。`[slug].astro`（prerender=true）は build 時読み込みで機能する。
- **KI 専用 UI として設計**し、AK と無理に統一しない。

### 21.5 Phase B で表示してよい項目（whitelist）
`date` / `venueName` / `venueCode` / `raceNumber` / `raceName` / `distance` / `distanceMeters` / `surface` / `trackCondition` / `headCount` / `horseNumber` / `rank`（shared の `finish` を表示時 `rank` へマップ）/ `finishStatus` / `popularity` / `bodyWeight` / `jockey` / `carriedWeight` / `time` / `passingOrder` / `last3f` / `margin`

- 新フィールドを足す場合は**各サイトの `getDisplayRecentRacesForNankan.js` の whitelist を更新したうえで wrapper 経由でのみ参照**する。

### 21.6 Phase B で表示してはいけない項目（内部キー）
`yearInferred` / `resultMatched` / `source` / `sourcePriority` / `resultMatchKey` / `dataQualityFlags` / `diagnostic` / `_status` / `_timeFail` / `_unknownVenue` / `opponentName` / その他内部監査用キー

- これらは shared 実データの `recentRaces[]` に**実在**するため、生 JSON を直接展開すると漏洩する。whitelist が唯一の防御線。

### 21.7 PR 分割方針
| PR | 内容 | 対象 repo |
|---|---|---|
| **PR-1** | **docs 契約確定のみ（本節）** | admin |
| PR-2 | KI included_files 実機確認、必要なら設定修正 | keiba-intelligence 単独 |
| PR-3 | duplicateDate 精密判別の read-only 監査 | admin（監査）|
| PR-4 | AK 表示拡張 | analytics-keiba 単独 |
| PR-5 | KI 表示拡張 | keiba-intelligence 単独 |

- **AK/KI は別 repo・別 PR**。片側に寄せた共通契約変更はしない。

### 21.8 禁止事項
- AK/KI 片側寄せの共通契約変更
- `horse.recentRaces` 上書き
- `featureScores` 変更 / `generateAdvancedMetrics` 変更
- AI指数 / 印 / 買い目 変更
- JRA `horseHistories`（別ディレクトリ・別ローダー・別フィールド `recentRacesFromHistories`）との混同
- shared JSON 手編集 / GitHub Web UI 手動追加
- 一括 dispatch（複数日・複数場）
- `updates` 配列の使用
- JRA 用 `horse-histories-updated` event の使用（南関は `recent-horse-histories-nankan-updated` 固定）

### 21.9 回帰確認項目
- 内部キー（`dataQualityFlags` / `_status` 等）が UI に出ない
- `horse.recentRaces` が不変
- `featureScores` / 6項目 / 3項目評価 が不変
- AI指数 / 印 / 買い目 が不変
- JRA `horseHistories` 表示に影響なし
- AK latest-only 仕様維持
- KI SSR / prerender 差分を確認（included_files 起因のフォールバック有無）
- `duplicateDate` を誤って消さない

### 21.10 監査で判明した実装前の前提（要対応）
- **KI included_files 欠落**（21.4）: KI SSR 2 ページで recentHorseHistories が本番表示されているか未確認。PR-2 で実機確認・修正判断。
- **06-04 FUN duplicateDate=2**: R5 ノーヴヒーロー / R7 マサノプレジオーソ が「同一馬・同一日・同一レース名で `finish` が 7着/8着 と矛盾」する results-enriched 由来重複。**単純 dedup も無編集リッチ表示も両方危険** → PR-3（精密判別 read-only 監査）を Phase B 表示拡張の前提とする。
- これら 2 点を解消するまで **PR-4/PR-5（実表示拡張）には進まない**。

---

## 22. Phase B-0: プロフィール先行表示（スコープ確定）(2026-06-10)

Phase B（中央版相当の馬詳細表示）を一度に実装すると影響範囲が広い（§7）。そこで Phase B を段階化し、
**最も低リスクな「プロフィール先行表示」を Phase B-0 として切り出す**。本節はそのスコープ・責務・禁止事項を
docs に固定する契約節であり、**実装・admin/shared データ生成・AK/KI コード変更は含まない（docs-only）**。

> **位置づけの注意（2026-06-10 追記）**: Phase B-0 は**表示側の補助**（既存 horse 由来 5 項目の整理表示）であり、
> Phase B の**最終目的ではない**。中央JRA 相当の **通算成績・条件別成績・直近10走**は、表示の問題ではなく
> **「各馬の全競走履歴データを南関でも持つ」というデータ供給の問題**であり、別途
> [nankan-horse-histories-detail-contract.md](nankan-horse-histories-detail-contract.md)（PR-D 系列）で
> **新パス `nankan/horseHistories/`** の取得・保存契約として設計する。本書 §22 の Phase B-0 とは別系列。
> なお、AK 南関の本命/対抗/単穴カードは既にプロフィール 5 項目を表示済みのため、**下位馬 meta への父/性齢追加だけの
> PR-B1 は目的とズレるため不採用**とし、PR-D 系列（horseHistories 詳細契約）を本筋とする。

### 22.0 前提状況（Phase B-0 着手可能になった理由）
§21.10 の「実装前の前提（要対応）」2 点は、いずれも解消済み:
- **KI included_files 欠落** → **解消**。`keiba-intelligence` PR #31（`netlify.toml` の `included_files` に
  `src/data/recentHorseHistories/**` を追加・1 行）が merge 済み（main `ba4d382`）。
  ※ ただしこれは recentHorseHistories（過去走）用の bundle 整備であり、**プロフィール先行は recentHorseHistories
  非依存**（22.2）のため、本前提は Phase B-0 の必須条件ではない。
- **06-04 FUN duplicateDate=2** → **解消**。shared / AK / KI とも是正版（generatedAt 2026-06-06・duplicateDate=0・
  ノーヴヒーロー=3-10 着8 のみ / マサノプレジオーソ=5-6 着6 のみ）に揃っている。

### 22.1 目的
南関でも中央版（JRA）のように、馬ごとの詳細表示に**プロフィール情報**を出す。ただし Phase B-0 では
**既存 horse object に安定して存在する 5 項目のみ**を対象とし、通算成績・条件別成績・直近10走には**まだ入らない**。

### 22.2 今回出す候補（既存 horse 由来の 5 項目に限定）
| 表示項目 | horse フィールド | 供給源 | 備考 |
|---|---|---|---|
| 性齢 | `age`（例 "牝7" / "騸8"・結合済文字列） | racebook / 予想 horse object | **JRA と異なり分解不要**。`parseSexAge` は流用しない |
| 父 | `sire` | 同上 | AK 南関は既に inline 表示あり（22.7 重複注意） |
| 騎手 | `jockey` | 同上 | KI 南関は既に表示あり |
| 斤量 | `weight`（表示時 `kg` 付与） | 同上 | |
| 調教師 | `trainer` | 同上 | KI 南関は既に表示あり |

- **`recentHorseHistories` 由来ではない**。プロフィールの供給源は **racebook / 予想 horse object**
  （AK/KI が既存の予想表示で読み込み済みの horse オブジェクト）。
- `recentHorseHistories` horse は `horseName` / `horseNumber` / `recentRaces` のみで**プロフィールを持たない**（§5.1 / 実測確認済）。

### 22.3 recentHorseHistories whitelist（§21.5）との責務分離
- §21.5 の **whitelist 22 項目は `recentRaces[]`（過去走行）用**であり、**horse レベルのプロフィールとは別責務**。
- プロフィール 5 項目は horse オブジェクトを**直接**参照する（`recentHorseHistories` の load/inject/whitelist 経路を通らない）。
- したがって Phase B-0 は **included_files / 内部キーリーク / duplicateDate / byte 一致 dispatch とは無関係**。
  これらの懸念は recentHorseHistories（過去走表示）側に閉じる。

### 22.4 今回対象外（Phase B-0 では出さない）
- 母（`dam`）
- 母父
- 馬主
- 生産者
- 通算成績（通算 / 勝率 / 連対率 / 3着内率）
- 条件別成績（ダート / 同距離 / 同会場）
- 直近10走（最大5走を超える履歴）

### 22.5 対象外理由
- **母 / 母父 / 馬主 / 生産者**: AK/KI の horse object に**安定供給されていない**（`dam` は shared racebook には存在するが、
  予想 horse への変換過程で脱落し AK/KI 側 horse には乗らない。母父・馬主・生産者は供給元自体が未整備）。
  出すには admin/shared のデータ生成・受け渡しの変更が必要 → 本タスクのスコープ外。
- **通算成績 / 条件別成績 / 直近10走**: `recentHorseHistories`（最大5走）だけでは不足し、
  **admin/shared 側の新規データ契約・集計設計（results / archiveResults 集計 or 新規生成パイプライン）が必要**（§8 / §13）。
  影響範囲が大きいため Phase B-0 とは分離し、後続（PR-B3 以降）で設計する。

### 22.6 AK/KI 実装方針
- **AK / KI は別 PR**（別 repo・別 PR。§21.7 の PR-4/PR-5 分割を踏襲）。
- **片方に寄せた共通化をしない**（UI 差は正常。AK=カード内 / KI=アコーディオン等、無理に統一しない）。
- **既存表示との重複を避ける**（22.7）。
- **欠損値は空欄固定ではなく条件付き非表示**（`horse.sire &&` 等。値が無い項目は行ごと出さない）。

### 22.7 既存表示との重複（実装前に各 repo で決める論点）
- **AK 南関**: 本命カードで `sire`(父) を既に inline 表示（`free-prediction/nankan.astro` / `premium-prediction/nankan.astro`）。
- **KI 南関**: `jockey`(騎手) / `trainer`(調教師) を既に表示（`prediction/nankan/index.astro` / `free-prediction/nankan/index.astro`）。
- → プロフィールブロックを足すと**二重表示**になりうる。各 repo で **「既存表示を残し不足項目だけ足す」か「グリッドに集約する」か**を
  実装 PR の冒頭で決める（集約は既存表示に手を入れるため回帰リスクがやや上がる）。
- **実装前にフィールド充足率を複数ファイルで確認**（1 サンプルだけで判断しない。欠損は条件付き非表示で吸収）。

### 22.8 禁止事項
- `featureScores` / `generateAdvancedMetrics` 非接続
- AI指数 非接続
- 印・買い目 非接続
- 穴馬抽出ロジック 非接続 / `dark-horse.mjs` 非接続
- JRA 既存プロフィール表示 非変更（南関は別ブロックとして実装）
- `horse.recentRaces` 非上書き
- `recentHorseHistories` の load/inject/whitelist 経路にプロフィールを混ぜない
- AK/KI 片寄せの共通契約変更 / shared JSON 手編集

### 22.9 PR 分割（Phase B-0 系列）
| PR | 内容 | 対象 repo |
|---|---|---|
| **PR-B0** | **docs でプロフィール先行スコープ確定（本節）** | admin |
| PR-B1 | AK 南関プロフィール表示（5 項目・条件付き非表示・既存重複の扱いを冒頭で決定） | analytics-keiba 単独 |
| PR-B2 | KI 南関プロフィール表示（同上・JRA `.dhc-profile-grid` 流用可） | keiba-intelligence 単独 |
| PR-B3 以降 | 通算成績 / 条件別成績 / 直近10走 の admin/shared データ契約・集計設計 | admin（契約）→ 後続 |

- PR-B1 / PR-B2 の先後はどちらでも可（確認容易性から AK 先行を推奨）。**片側だけ長期間放置しない**。

### 22.10 回帰確認項目（PR-B1 / PR-B2 実装時）
- プロフィール 5 項目（性齢/父/騎手/斤量/調教師）が表示され、欠損項目は**行ごと非表示**（空欄固定でない）。
- 既存表示（AK の sire inline / KI の jockey・trainer）と**二重表示になっていない**。
- `featureScores` / 6項目 / 3項目評価 / AI指数 / 印 / 買い目 / 穴馬抽出 が**不変**。
- `horse.recentRaces` / `recentHorseHistories` 表示（5走）が**不変**。
- JRA 既存プロフィール表示に**影響なし**。
- 母 / 母父 / 馬主 / 生産者 / 通算 / 条件別 / 10走 が**出ていない**（スコープ厳守）。

---

## 23. Phase B-1: 全履歴保留中の南関馬詳細表示・暫定スコープ (2026-06-11・PR-E0)

全履歴 `history[]` 路線（中央JRA 同等の通算/条件別/直近10走を全履歴から再集計する方式）は、
取得元 **nankankeiba.com `uma_info` の利用条件・運用方針を確認しながら進める**段階のため当面スコープ外
（[nankan-horse-histories-detail-contract.md](nankan-horse-histories-detail-contract.md) §12.10）。
本節は、その間に **「既存データでできる範囲」の南関馬詳細表示**スコープを docs で固定する契約節である。
なお entries の継続供給は **自動取得 first / 手作業 fallback** 方針で進める（§27・PR-F0）。
**docs-only・実装/取得/スクレイプ/generator/dry-run なし。** AK/KI への実装は本節を前提に PR-E1/E2 で別途判断する。

### 23.1 現在地
- **全履歴 `history[]`（`uma_info` 由来）は当面スコープ外**（利用条件・運用方針を確認しながら進める。今回 PR-F の自動取得対象には含めない）。
- **keiba.go.jp `HorseMarkInfo` は `/KeibaWeb/DataRoom/` robots Disallow により対象外**。
- **entries は全履歴の正本ではなく補完源**（`recentRaces` 最大5走）。**供給は 自動取得 first / 手作業 fallback**（§27）。
- **B方針＝当面は既存データ＋ entries でできる範囲の表示に限定する**。

### 23.2 既存データで表示可能な項目（＋カバレッジ）
| 区分 | 項目 | 供給源 | 最新日の可否 |
|---|---|---|---|
| **基本プロフィール** | 性齢 / 父 / 騎手 / 斤量 / 調教師 | predictions / racebook | **○ 常時**（AK 本命/対抗/単穴カードで既に表示済・§22） |
| **血統拡張（entries限定）** | 母父 `bms` / 馬主 `owner` / 生産者 `breeder` / 毛色 `coat` / `bestTime` | **entries のみ** | **△ entries がある日のみ** |
| **通算成績（entries限定）** | `record.total`（出走/勝/連対/3着内＋勝率/連対率/3着内率） | **entries のみ** | **△ entries がある日のみ** |
| **条件別成績（entries限定）** | `record.left`(左回り) / `record.right`(右回り) / `record.venue`(同会場) / `record.distance`(同距離) | **entries のみ** | **△ entries がある日のみ** |
| **直近走** | recentHorseHistories（最大5走）／ racebook `pastRaces`（3〜4走） | recentHorseHistories / racebook | **△ recentHorseHistories がある日は最大5走・最新日は racebook 3〜4走が主** |

- **重要なカバレッジ制約**: entries は **7 ファイル・2026-03-30〜04-07 で停止**しており、**最新日には存在しない**。
  recentHorseHistories も backfill の限定日のみ。**最新日に確実に在るのは racebook / predictions だけ**（＝基本プロフィール）。
- **AK/KI は entries を未取込**（`src/data/entries` 無し）。

### 23.3 既存データで表示不可な項目
- **全履歴 `history[]`** / **6走前以降** / **JRA 式の全履歴から再集計する通算・条件別** / **`uma_info` 由来の全出走履歴**。
- **母名 `mother`** / **生年月日 `birthdate`**（entries にも無い）。
- **最新日における安定した entries 由来の通算/条件別表示**（entries が 2026-04-07 で停止しているため）。

### 23.4 表示上の禁止表現
- **「全履歴」と表記しない。**
- **「JRA同等」と表記しない。**
- **「直近10走」と表記しない。**
- **「horseHistories 完全対応」と表記しない。**
- **「通算/条件別が全馬常時表示される」と誤認させない。**

### 23.5 表示名の推奨
- 「プロフィール」 / 「通算成績」 / 「条件別成績」 / 「直近5走」 / 「出馬表由来データ」 / 「データがある場合のみ表示」。

### 23.6 フォールバック方針
- **entries が無い日**: 基本プロフィールのみ表示。通算成績・条件別成績・血統拡張は**表示しない**（「データ不足」または非表示）。
- **entries はあるが record が無い場合（自動取得由来等）**: profile / recentRaces は表示し、**通算成績・条件別成績は非表示または「データ未取得」**。**「0戦」「成績なし」と表示しない**（record optional 方針・§28.5）。
- **recentHorseHistories が無い日**: racebook `pastRaces` 3〜4走にフォールバック。
- **entries も recentHorseHistories も無い日**: **既存の現行表示を維持**。**空枠を出さない・推測値を出さない**。

### 23.7 entries 供給との関係
- entries の **通算/条件別/血統拡張を実用表示するには、entries が最新日に継続供給される**ことが前提。
- 供給方針は **自動取得 first / 手作業 fallback**（§27・PR-F0）。**手作業運用（`entries-manager`）は fallback として維持する**。
- **entries の自動取得は、出馬表ページ系を対象に、小規模・低負荷・停止可能な設計で進める**（§27.3）。
- **`uma_info` の全履歴取得・keiba.go.jp DataRoom 取得には進まない**（自動取得対象は entries 相当の出馬表データに限定・§27.2）。

### 23.8 AK/KI 実装へ進む条件
- 本節（PR-E0）で**暫定スコープを docs 固定**。
- **entries を取り込むか判断** / **entries 運用再開の有無を判断**。
- **AK と KI で同じデータ契約を読む**（entries の同一スキーマ）。
- **AK/KI 片側だけの独自集計をしない**。
- **「全履歴表示」とは表記しない**（§23.4）。

### 23.9 PR 分割（Phase B-1 系列）
| PR | 内容 | 対象 |
|---|---|---|
| **PR-E0** | **docs-only 暫定表示スコープ固定（本節）** | admin docs |
| PR-E1 | AK 側 read-only 設計 または最小実装検討 | analytics-keiba 単独 |
| PR-E2 | KI 側 read-only 設計 または最小実装検討 | keiba-intelligence 単独 |
| （別途） | entries 運用再開が必要なら runbook / 運用docs | admin |

### 23.10 禁止事項
- `featureScores` / AI指数 / 印 / 買い目 / 穴馬抽出 / `dark-horse.mjs` に**触らない**。
- JRA `horseHistories` に**触らない**。
- `nankan/recentHorseHistories` の既存仕様を**壊さない**。
- shared データ / AK・KI / scripts を**変更しない**。
- generator / dry-run スクリプトを**作らない**。
- `uma_info` を**取得しない** / keiba.go.jp DataRoom を**取得しない**。

---

## 24. Phase B-1 / AK 側 設計（read-only・PR-E1a）(2026-06-11)

§23（Phase B-1 暫定表示スコープ）を踏まえた **analytics-keiba（AK）側の設計**を docs で固定する。
**read-only 設計のみ。AK 実装ファイル・shared・workflow・UI は変更しない。** 実装（PR-E1b/E1c）は
**entries 運用再開の判断とセット**で別途行う（§24.8）。AK は read-only 参照のみで確認した。

### 24.1 AK 現在地
- AK 南関 `free/premium-prediction/nankan.astro` は **`prerender = true`（latest-only SSG・ビルド時読込）**。
  → **KI のような `included_files`/Lambda 問題は AK には基本ない**（`src/data` 同梱でビルド時に読める）。
- **entries は未取込**（`src/data/entries` 無し）。**entries import workflow も無し**。
- 雛形になる既存資産: `loadRecentHorseHistoriesNankan.js` / `injectRecentHorseHistoriesNankan.js` /
  `getDisplayRecentRacesForNankan.js`（南関過去走）、`loadHorseHistoriesJra.js`（JRA詳細UI）、
  `import-recent-horse-histories-nankan-on-dispatch.yml`（import workflow 雛形）。

### 24.2 AK で既に表示済みの項目（重複回避の基準）
- **本命/対抗/単穴カード**: 性齢・父・騎手・斤量・調教師・枠番（基本情報ブロックで表示済・§22）。
- **下位馬 meta**: 騎手・厩舎(調教師)・斤量・指数。
- **直近走**: `getDisplayRecentRacesForNankan(horse)` 経由で recentHorseHistories（最大5走）or racebook `pastRaces`。
- **featureScores 表示（3項目）とは別責務**。
- → **基本プロフィール5項目は既出**。entries で新規に増やせるのは **母父/馬主/生産者/毛色/bestTime と 通算/条件別成績**。

### 24.3 entries import 配線案（recentHorseHistories と同型）
- **保存先案**: `astro-site/src/data/entries/nankan/YYYY/MM/YYYY-MM-DD-{VENUE}.json`
  （recentHorseHistories と同じ `src/data/{種別}/nankan/...` 構成に合わせる）。
- **loader 案**: `loadEntriesNankan.js`（読込）。
- **inject 案**: `injectEntriesNankan.js`（horse へ別フィールド注入）。
- **注入フィールド案**:
  - `horse.entriesProfile`（bms / owner / breeder / coat / bestTime）
  - `horse.entriesRecord`（record.total / left / right / venue / distance）
  - 必要なら `horse.entriesRecentRaces`（最大5走）
- **`recentRacesFromHistoriesNankan` とは混ぜない**。**recentHorseHistories とは責務を分ける**（別ローダー・別注入フィールド）。
- import 経路案: 新規 `import-entries-nankan-on-dispatch.yml`（recentHorseHistories workflow の複製）。
  AK は prerender=true のため **included_files 不要**。

### 24.4 join key 案
- **主キー = `date + venue + raceNumber + horseNumber`**。
- **`horseName` は照合・警告用の従キー**（表記ゆれ検出のみ）。
- **`horseName` 単独 join は禁止**（同名馬対策）。
- **entries は同一開催・同一日・同一会場の出馬表由来であることを前提**にする。
  **entries が別日・別会場なら join しない**（誤接続防止）。
- 雛形（recentHorseHistories inject）の join も `{ raceNumber, horseNumber(主), horseName(従) }` で同型。

### 24.5 entries がある日にだけ表示する項目
- **`entriesProfile`**: bms（母父）/ owner（馬主）/ breeder（生産者）/ coat（毛色）/ bestTime。
- **`entriesRecord`**: total / left / right / venue / distance（各 `{wins, seconds, thirds, unplaced}`）。
- **`entriesRecentRaces`**: 最大5走。
  - **ただし recentHorseHistories / racebook と二重表示しない設計が必要**（直近走の供給源を一本化・§24.8）。

### 24.6 JRA UI 流用方針
- **JRA の詳細UI（アコーディオン/グリッド）構造は参考にしてよい**。
- **ただし JRA の `history[]` 集計ロジック（`buildHistoryAccordionContext`）は流用しない**。
  JRA は history から通算/条件別を**計算**するが、**entries.record は事前集計済**なので **record を直接マップ**する。
- **条件別カテゴリは JRA 式ではなく南関向け**:
  - 左回り（record.left）/ 右回り（record.right）/ 同会場（record.venue）/ 同距離（record.distance）。
  - **「芝/ダート」分割は南関では主目的にしない**（南関はダート主・左右回りが意味を持つ）。

### 24.7 表示名・禁止表現
- **表示名**: 「プロフィール」「通算成績」「条件別成績」「直近5走」「出馬表由来データ」。
- **禁止表現**: 「全履歴」「JRA同等」「直近10走」「horseHistories完全対応」「全馬常時表示」。
- **entries が無い日は非表示または「データ不足」**。**空枠・推測値を出さない**。

### 24.8 実装前に必要な判断
1. **entries 運用再開の是非**（最重要）。entries は最新日に無い（§23.2）ため、運用再開が無ければ最新ページは常にフォールバック。
2. **entries import workflow を作るか**（新規 or 当面手動 backfill）。
3. **`entries.recentRaces` と recentHorseHistories の優先順位**（直近走の二重表示回避・どちらを採用するか）。
4. **AK/KI で同一フィールド名・同一契約にすること**（片寄せ・独自集計禁止）。
5. **PR-E1b/E1c へ進む前に、entries が最新日に供給される運用があるか判断**すること。

### 24.9 PR 分割案
| PR | 内容 | 対象 |
|---|---|---|
| **PR-E1a** | **AK docs-only 設計（本節）** | admin docs |
| PR-E1b | entries import 配線のみ（`src/data/entries/nankan` 取込＋workflow） | analytics-keiba 単独 |
| PR-E1c | entries がある日の条件付き表示 | analytics-keiba 単独 |
| PR-E2a | KI docs-only 設計 | admin docs |
| PR-E2b/E2c | KI import / 表示 | keiba-intelligence 単独 |

- PR-E1b/E1c は **entries 運用再開が決まってから**着手（でないと最新日に効かない）。

### 24.10 禁止事項
- AK 実装ファイルを**変更しない** / UI を**変更しない**。
- shared データ / import workflow を**変更しない**。
- `featureScores` / AI指数 / 印 / 買い目 / 穴馬抽出 / `dark-horse.mjs` に**触らない**。
- JRA 表示を**変更しない**。`nankan/recentHorseHistories` の既存仕様を**壊さない**。

---

## 25. Phase B-1 / KI 側 設計（read-only・PR-E2a）(2026-06-11)

§23（暫定スコープ）・§24（AK 設計）を踏まえた **keiba-intelligence（KI）側の設計**を docs で固定する。
**AK §24 と同一のデータ契約**を前提とし、**KI 固有の SSR / included_files / Netlify Functions 同梱の注意**を明記する。
**read-only 設計のみ。KI 実装ファイル・Netlify設定・workflow・shared・AK は変更しない。** 実装（PR-E2b/E2c）は
**entries 運用再開の判断とセット**で別途行う（§25.9）。KI は read-only 参照のみで確認した。

### 25.1 KI 現在地
- **KI は AK と違い SSR がある**: 南関 `prediction/nankan/index.astro`・`free-prediction/nankan/index.astro` は
  **`prerender = false`（SSR・Netlify Functions）**、`free-prediction/nankan/[slug].astro` は **`prerender = true`（static）**。
  → **SSR ページは Netlify Functions 同梱（included_files）の注意がある**（§25.4）。AK のように prerender=true 前提で進めない。
- **entries は未取込**（`src/data/entries` 無し）。**entries import workflow も無し**。
- 雛形: `loadRecentHorseHistoriesNankan.js` / `injectRecentHorseHistoriesNankan.js` /
  `getDisplayRecentRacesForNankan.js`（南関過去走）、`loadHorseHistoriesJra.js`（JRA詳細UI）、
  `import-recent-horse-histories-nankan-on-dispatch.yml`（import workflow 雛形）。
- **included_files の前例あり**: `astro-site/netlify.toml` は現状
  `["src/data/horseHistories/**", "src/data/featureScores/**", "src/data/recentHorseHistories/**"]`
  （recentHorseHistories は PR-2／#31 で追加済）。**runtime-fs 読み込みデータは included_files 登録が前提**という前例が確立している。

### 25.2 KI で既に表示済みの項目（重複回避の基準）
- **南関の基本プロフィール**（性齢/父/騎手/斤量/調教師 等。jockey/trainer は `dhc-jockey-trainer` ブロックで表示済・§22）。
- **直近走**: `getDisplayRecentRacesForNankan(horse)` 経由で recentHorseHistories（最大5走・新→古 reverse）or racebook。
- **JRA horseHistories 表示**（`prediction/jra/index.astro` の `<details class="dhc-history-details">` 内・`.dhc-profile-grid`）。
- **featureScores 表示（6項目）とは別責務**（`generateAdvancedMetrics` に entries を渡さない）。
- → **既出項目と重複しない**こと。entries で新規に増やせるのは **母父/馬主/生産者/毛色/bestTime と 通算/条件別成績**。

### 25.3 entries import 配線案（AK §24.3 と同一契約・recentHorseHistories と同型）
- **保存先案**: `astro-site/src/data/entries/nankan/YYYY/MM/YYYY-MM-DD-{VENUE}.json`
  （KI の `src/data/{種別}/nankan/...` 実構成＝recentHorseHistories と同じに合わせる）。
- **loader 案**: `loadEntriesNankan.js`（読込）。**inject 案**: `injectEntriesNankan.js`（horse へ別フィールド注入）。
- **注入フィールド案**（AK と同名・同契約）:
  - `horse.entriesProfile`（bms / owner / breeder / coat / bestTime）
  - `horse.entriesRecord`（record.total / left / right / venue / distance）
  - 必要なら `horse.entriesRecentRaces`（最大5走）
- **`recentRacesFromHistoriesNankan` とは混ぜない**。**recentHorseHistories とは責務を分ける**（別ローダー・別注入フィールド）。

### 25.4 SSR / included_files 注意（KI 固有・最重要）
- KI の SSR ページ（prerender=false）でローダーが **`readFileSync`（実行時 fs 読込）**する場合、
  **`src/data/entries/**` を `netlify.toml` の `included_files` に追加しないと、本番 Netlify Functions bundle に同梱されず読めない**。
- **JRA `horseHistories` / `recentHorseHistories` の included_files 対応が前例**（recentHorseHistories は PR-2／#31 で追加）。
  **entries も同様に `src/data/entries/**` を included_files に追加**する必要がある。
- **included_files 漏れがあると、本番 SSR で entries が黙って読めずフォールバック**する（PR-2 と同型の落とし穴）。
- `[slug].astro`（prerender=true）はビルド時読込で機能するが、**SSR 2 ページは included_files が必須**。
- → **AK のように prerender=true 前提で進めない**。PR-E2b で included_files 追加と本番 SSR 実機確認を行う。

### 25.5 join key 案（AK §24.4 と同一）
- **主キー = `date + venue + raceNumber + horseNumber`**。**`horseName` は照合・警告用の従キー**。
- **`horseName` 単独 join は禁止**（同名馬対策）。
- **entries は同一開催・同一日・同一会場の出馬表由来であることを前提**。**別日・別会場なら join しない**。

### 25.6 entries がある日にだけ表示する項目（AK §24.5 と同一）
- **`entriesProfile`**: bms（母父）/ owner（馬主）/ breeder（生産者）/ coat（毛色）/ bestTime。
- **`entriesRecord`**: total / left / right / venue / distance（各 `{wins, seconds, thirds, unplaced}`）。
- **`entriesRecentRaces`**: 最大5走。
  - **ただし recentHorseHistories / racebook と二重表示しない設計が必要**（直近走の供給源を一本化・§25.9）。

### 25.7 JRA UI 流用方針（AK §24.6 と同一）
- **JRA の詳細UI（`.dhc-profile-grid` 等）構造は参考にしてよい**。
- **ただし JRA の `history[]` 集計ロジックは流用しない**。**entries.record は事前集計済**なので **record を直接マップ**する。
- **条件別カテゴリは南関向け**: 左回り（record.left）/ 右回り（record.right）/ 同会場（record.venue）/ 同距離（record.distance）。
  **「芝/ダート」分割は南関では主目的にしない**。

### 25.8 表示名・禁止表現（AK §24.7 と同一）
- **表示名**: 「プロフィール」「通算成績」「条件別成績」「直近5走」「出馬表由来データ」。
- **禁止表現**: 「全履歴」「JRA同等」「直近10走」「horseHistories完全対応」「全馬常時表示」。
- **entries が無い日は非表示または「データ不足」**。**空枠・推測値を出さない**。

### 25.9 実装前に必要な判断
1. **entries 運用再開の是非**（最重要・entries は最新日に無い＝§23.2）。
2. **entries import workflow を作るか**。
3. **KI SSR で `src/data/entries` をどう同梱するか**（included_files 追加・本番 SSR 実機確認＝§25.4）。
4. **`entries.recentRaces` と recentHorseHistories の優先順位**（直近走の二重表示回避）。
5. **AK/KI で同一フィールド名・同一契約にすること**（片寄せ・独自集計禁止）。
6. **PR-E2b/E2c へ進む前に、entries が最新日に供給される運用があるか判断**すること。

### 25.10 PR 分割案
| PR | 内容 | 対象 |
|---|---|---|
| **PR-E2a** | **KI docs-only 設計（本節）** | admin docs |
| PR-E2b | KI entries import 配線のみ（`src/data/entries/nankan` 取込＋**included_files 追加**＋workflow） | keiba-intelligence 単独 |
| PR-E2c | KI entries がある日の条件付き表示 | keiba-intelligence 単独 |
| PR-E1b/E1c | AK import / 表示（**entries 運用再開後**） | analytics-keiba 単独 |

- PR-E2b/E2c は **entries 運用再開が決まってから**着手（でないと最新日に効かない）。

### 25.11 禁止事項
- KI 実装ファイルを**変更しない** / Netlify設定を**変更しない** / workflow を**変更しない**。
- shared データ / AK を**変更しない**。
- `featureScores` / AI指数 / 印 / 買い目 / 穴馬抽出 / `dark-horse.mjs` に**触らない**。
- JRA 表示を**変更しない**。`nankan/recentHorseHistories` の既存仕様を**壊さない**。

---

## 26. entries 手作業 fallback runbook（read-only・PR-E3a / PR-F0 で fallback 位置づけに更新）(2026-06-11)

§24（AK 設計）/§25（KI 設計）の実装（PR-E1b/E1c・E2b/E2c）は **entries が最新日に供給される運用**が前提
（entries は 2026-04-07 で停止・最新日に無い＝§23.2）。**供給方針は 自動取得 first / 手作業 fallback**（§27・PR-F0）。
本節は、その **fallback 経路＝`entries-manager` 手作業コピペ運用**の手順・負荷・注意・AK/KI 反映条件を read-only で整理する。
自動取得（first）の設計は §27 にまとめる。**手作業運用は fallback として維持し、自動取得に問題が出た場合に戻せるようにする**。
**docs-only・実保存なし・実取得なし・AK/KI 実装に進まない。** entries-manager.astro / save-entries.mjs は read-only 参照のみ。

### 26.1 entries-manager 現在地
- **`src/pages/admin/entries-manager.astro` は現存・動作構造あり**。
- **入力方式＝公式出馬表テキストの手作業コピペ＋ブラウザ内パース**（**自動取得・スクレイプではない**）。
- Step 構成:
  - **Step 1**: 開催日（date 入力）＋ 競馬場（dropdown・南関は大井/川崎/船橋/浦和）。
  - **Step 2**: 出走表テキスト貼付（textarea・複数レース対応）＋「🔍 自動解析」（`parseEntries`）。
  - **Step 3**: 「🚀 保存してGit Push」（`saveToGit`）。
  - **Step 4**: プレビュー / JSON 確認。
- **raceNumber** はテキスト内の「第N競走」から parse（手指定不要）。**date / venue は UI で指定**。
- **クライアント側に token は露出しない**（保存は server 側）。

### 26.2 save-entries の保存仕様
- **POST 先**: `/.netlify/functions/save-entries`。
- **POST 形式**: `raceDate` / `venue` / `venueCode` / `category` / `data`(parsedResult)。
- **保存先**: `nankan/entries/YYYY/MM/YYYY-MM-DD-{OOI|KAW|FUN|URA}.json`。
- **token**: `GITHUB_TOKEN_KEIBA_DATA_SHARED`（**server 側で使用**）。
- **`repository_dispatch` は無い** → **保存しても AK/KI へは自動反映されない**。

### 26.3 保存データ構造
- **top-level**: `version` / `createdAt` / `lastUpdated` / `date` / `venue` / `venueCode` / `category` / `totalRaces` / `races`。
- **horse keys**: `postPosition` / `number` / `name` / `gender` / `age` / `coat` / `weight` / `jockey` / `jockeyAffiliation` /
  `trainer` / `trainerAffiliation` / `owner` / `breeder` / `sire` / `bms` / `record` / `bestTime` / `recentRaces`。
- **record**: `total` / `left` / `right` / `venue` / `distance`（各 `{wins, seconds, thirds, unplaced}`）。
- **recentRaces**: 最大5走。
- **ない項目**: `mother`（母名）/ `birthdate`（生年月日）/ `horseId` / `uma_info` ID / **全履歴 `history[]`**。

### 26.4 手作業運用手順案
1. 対象開催日の**出馬表確定後**に作業する。
2. `/admin/entries-manager` を開く。
3. **開催日と競馬場**を指定する。
4. **南関公式の該当日・該当会場の出馬表**を開く。
5. 各レースの出走表テキストをコピーする。
6. textarea に貼り付ける（複数レースまとめて可）。
7. 「🔍 自動解析」を実行する。
8. プレビュー / JSON で確認する（race 数・頭数・record/recentRaces 充足）。
9. 「🚀 保存してGit Push」する。
10. shared `nankan/entries/...` に保存されたことを確認する（HTTP 201/200）。
11. **ただしこの時点では AK/KI には出ない**（dispatch 無し・import 未実装）。

### 26.5 1日あたりの作業負荷
- 南関は **1日1〜複数場開催がある**（例: 6/29 大井・船橋の2場）。
- **1会場あたり概ね12レース**。**会場ごとに出馬表テキスト収集が必要**（複数会場時は会場数に比例）。
- textarea は複数レース対応だが、**元テキスト収集は人手**。
- **実質負荷は1会場あたり数十分程度**と見積もる。
- **2場/3場なら負荷は会場数に比例増**。
- **毎開催日作業が必要**。**運用が止まると再び最新日に entries が欠ける**（2026-04-07 停止の再来）。

### 26.6 運用上の注意
- **公式表示テキストの転記・保存・再利用は、手作業運用でも外部サイト由来テキストの扱いには注意する**。
- nankankeiba.com 利用規約精査（[nankan-horse-histories-detail-contract.md] §12.10）では、
  **利用範囲の解釈には確認余地がある**と整理済み。**利用条件・運用方針は確認しながら進める**（運用を止める理由ではなく運用上の注意）。
- **shared 保存・AK/KI 表示・サービス内利用は、保存・表示・再利用の扱いを必要に応じて確認する**。
- 貼り付けミス / date・venue 間違い / raceNumber parse ミス → **プレビュー確認は必須**。
- **entries 保存だけでは AK/KI 反映されない**（shared 保存後も AK/KI には自動反映されない）。AK/KI 反映には **PR-F4/PR-F5（旧 PR-E1b/E2b/E1c/E2c）が別途必要**。

### 26.7 AK/KI 実装へ進む条件
- **entries が最新日に継続供給される**こと（自動取得 first / 手作業 fallback・§27）。
- **外部データ利用方針を確認する**。
- **最新日 entries を最低1日分作成できること**。
- **shared に `nankan/entries` が保存されること**。
- **AK/KI import 配線を作る価値があること**（継続運用の見込み）。
- **保存後の AK/KI import 方式を決めること**: `workflow_dispatch` / `repository_dispatch` / 手動 import のいずれか。

### 26.8 実装フェーズの分岐
- **entries が継続供給される場合**（自動取得 first・問題時は手作業 fallback）:
  - PR-F4: AK/KI entries import 配線（KI は included_files に `src/data/entries/**` 追加・§25.4）。
  - PR-F5: AK/KI 条件付き表示。
- **供給が安定しない場合**:
  - 実装は保留。現行表示維持。**全履歴 `history[]` 路線は uma_info の利用条件・運用方針が固まるまで本格展開しない**（§12.10）。

### 26.9 禁止事項
- `entries-manager.astro` を**変更しない** / `save-entries.mjs` を**変更しない**。
- **実際に保存しない** / shared データを**変更しない** / AK・KI を**変更しない**。
- workflow / scripts を**変更しない** / generator・dry-run スクリプトを**作らない**。
- `uma_info` を**取得しない** / keiba.go.jp DataRoom を**取得しない**。
- `featureScores` / AI指数 / 印 / 買い目 / 穴馬抽出 / `dark-horse.mjs` に**触らない**。

---

## 27. entries 供給方針：自動取得 first / 手作業 fallback（PR-F0・docs-only）(2026-06-11)

南関 entries（出馬表由来データ）の最新日継続供給について、方針を **自動取得 first / 手作業 fallback の両対応**へ更新する。
本節は方針の docs 固定のみで、**実装なし・実取得なし・保存なし・shared/AK/KI/workflow 変更なし**。

### 27.1 供給方針（基本）
- **第一候補＝自動取得**。entries 相当の出馬表データを最新日に継続供給することを目的にする。
- **fallback＝`entries-manager` 手作業コピペ運用**（§26）。自動取得に問題が出たら手作業へ戻せるようにする。
- **保存形式は両者で同一**にする（自動取得でも手作業でも、出力 JSON schema を同一にする）。
- **保存先は既存と同一**: `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json`（VENUE = OOI/KAW/FUN/URA）。
- **AK/KI は取得方法を意識しない**。同じ `nankan/entries` JSON だけを読む。

### 27.2 自動取得の対象（スコープ限定）
- **`uma_info` の全履歴取得ではない**。全履歴 `history[]` 取得には進まない。
- **keiba.go.jp DataRoom ではない**（robots Disallow・対象外を維持）。
- **目的は entries 相当の出馬表データ供給**。取得対象は **出馬表ページ系に限定**する。
- 通算/条件別/血統拡張/recentRaces（最大5走）は、現行 entries schema（§26.3）の範囲で供給する。

### 27.3 自動取得の安全設計
- **まずは保存なし dry-run**から始める。
- **初回 dry-run は1会場単位でよい。ただし設計は1日複数会場（OOI/KAW/FUN/URA）対応**とする。
  - 南関は **1日1〜複数場開催がある**（例: 6/29 大井・船橋の2場）。「1日1会場のみ」「複数指定はエラー」は前提にしない。
  - **1会場あたり概ね12レース想定。複数会場時は会場数に比例**。
  - **1実行=1venue を基本単位**にしてよいが、**同一 date で複数 venue を順次処理できる構造**にする（会場ごとに独立して fetch/parse/schema検証/output）。
  - CLI は `--date=YYYY-MM-DD --venue=OOI` の単一指定を基本実行単位にしつつ、**将来 `--venues=OOI,FUN` の複数指定を塞がない**設計にする（`--url=<出馬表ページURL>` も可）。
- **対象URLと取得件数をログに出す**（date / venue / venueCode / target URL / race count / horse count / venue ごとの成功・失敗 / 複数 venue 時の summary）。**token 値は出さない**。
- **アクセス間隔を置く**（低負荷）。**retry を過剰にしない**。
- **失敗時は途中停止**する。**1会場が失敗しても他会場の処理可否を summary に出せる設計**にする。
- **schema 不一致なら保存しない**。
- **venue ごとに `parsedResult` を作る**（`totalRaces` / `races` は venue 単位）。**1日複数 venue を1JSONに混ぜない**。出力は venue ごとに1ファイル（保存時の命名は §27 下記）。
- **`featureScores` / AI指数 / 印 / 買い目 / 穴馬抽出には接続しない**。
- 設計の基本は **小規模・低負荷・停止可能**。

#### 27.3.1 venue ごとの保存先（将来 PR-F3 以降）
1日複数会場時も **venue ごとに1ファイル**に分けて保存する（PR-F1 は保存しない・パスは将来の保存先設計）:
- `nankan/entries/YYYY/MM/YYYY-MM-DD-OOI.json`
- `nankan/entries/YYYY/MM/YYYY-MM-DD-FUN.json`
- `nankan/entries/YYYY/MM/YYYY-MM-DD-KAW.json`
- `nankan/entries/YYYY/MM/YYYY-MM-DD-URA.json`

### 27.4 手作業 fallback 設計
- 自動取得に失敗した場合は **`entries-manager` 手作業コピペへ戻す**（§26 の手順）。
- 手作業でも **同じ `save-entries.mjs` / 同じ shared path** に保存する。
- **AK/KI の import・表示は取得方法に依存しない**。fallback 時も出力 JSON は同じ。
- 自動取得と手作業の差分は **`source` / `meta` 等に記録してもよい**が、**UI 表示には使わない**。

### 27.5 既存 docs 表現の更新方針（本 PR で反映）
| 旧（停止寄り） | 新（実務寄り） |
|---|---|
| 自動取得しない | 自動取得は小規模・低負荷・停止可能な設計で進める |
| 自動化は uma_info 許諾確認なしに行わない | （uma_info 全履歴とは別物。entries 出馬表の自動取得は §27.3 の安全設計で進める） |
| 手作業運用が前提 | 手作業運用は fallback として維持する |
| PR-D2 は許諾確認まで保留 | 自動取得 first / 手作業 fallback 方針で再設計する |
| 要許諾 | 利用条件・運用方針は確認しながら進める |
| 規約リスク | 外部サイト由来データの扱いには注意する |
| 不可寄り | 現時点では採用未決定 |

### 27.6 今後の PR 分割（F系）
- **PR-F0**: docs 方針変更（**本 PR**）。
- **PR-F1**: 保存なし dry-run parser（出馬表ページ系・**初回1会場単位／複数会場対応設計**・venue ごとに1JSON・ログのみ）。
  - **PR-F1a**: テキスト→parsedResult（`src/lib/nankan/entries-parser.mjs`＋`scripts/nankan/dry-run-parse-entries.mjs`）。
  - **PR-F1b**: 出馬表ページ取得 dry-run（案b＝**HTML→parsedResult 直接マッピング**）。`src/lib/nankan/entries-html-to-parsed.mjs`（cheerio・純粋・fetch/fs なし）＋`scripts/nankan/dry-run-fetch-entries-page.mjs`（1URL・Shift_JIS→UTF-8・F2検証・stdout/tmp・sharedガード）。
    - 取得元: `syousai/{raceID}.do` → 302 → `uma_shosai/{raceID}.do`（出馬表・**静的HTML・JS不要・Shift_JIS**）。ID=`YYYYMMDD+jyo2+kai2+nichi2+R2`。**uma_info（馬単体・全履歴）は対象外・拒否**。
    - 取得項目: raceName/距離/馬場/向き/発走/頭数・number/name/性齢/毛色/騎手(所属)/斤量/調教師(所属)/父/母父・**recentRaces 最大5（着順/日付/会場/距離/人気/馬体重/騎手/タイム/上り3F/通過順/着差/勝ち馬）= coverage 100%**。
    - **未取得: `record`（着別 total/left/right/venue/distance）は uma_shosai に無い**（会場別/条件別の勝率・平均で別形式）。F1b は record を 0 埋め（validator は **error にせず継続**・**record coverage 0% を明示**）。**補完源 read-only 調査の結論と record optional 方針は §28 を参照**。
- **PR-F2**: entries schema validator（自動/手作業の出力同一性を検証）。
  - 実装: `src/lib/nankan/entries-schema-validator.mjs`（純粋・`validateNankanEntriesData(data,options)` / `summarizeNankanEntriesData(data)` を export・取得/保存/fs なし）。
  - 検証: top-level 必須キー・`category==='nankan'`・`totalRaces===races.length`・venueCode∈OOI/KAW/FUN/URA・venue名整合・1 JSON=1 venue／race(raceNumber数値・horses非空・headCount整合)／horse(number・name・record・recentRaces≤5)／record(total/left/right/venue/distance × wins/seconds/thirds/unplaced 数値・NaN不可)／recentRaces(order・finish|finishStatus・date等)。**error→保存停止(exit 1)・warning→継続**。
  - 利用: dry-run script（PR-F1a）の簡易 check を本 validator に置換。read-only CLI `scripts/nankan/validate-entries-json.mjs` で既存 JSON を検証可。shared 実例7件は **schema OK**（warning のみ）を確認済み。
- **PR-F2a**: **record optional 方針 docs 固定（本 PR・§28）**。record 補完源 read-only 調査の結論＋自動取得 entries の record 扱いを docs に確定（docs-only）。
- **PR-F2b**: validator を **record optional / 0埋め禁止**へ修正（§28.4・**実装済**）。`entries-schema-validator.mjs`＝record 欠落/null は **warning（error にしない）**・record 構造は従来チェック（NaN/部分欠損は error）・**0埋め＋未取得コンテキスト（`sourceMeta.recordSourced===false` or `missingRecordReason`）は error**・0埋め＋sourceMeta無しは warning（0戦の新馬等）。`sourceMeta`（optional）は `sourceType`/`sourcePageType`/`recordSourced`/`recordCoverage`/`missingRecordReason` を summary に反映。`entries-html-to-parsed.mjs`＝record を **0埋めせず null** にし `sourceMeta`（auto/uma_shosai/recordSourced:false/missingRecordReason:`uma_shosai_no_record`）を付与。shared 実例7件は引き続き **schema OK**。
- **PR-F3**: opt-in shared 保存（dry-run → schema PASS 時のみ・opt-in・**record 有無のメタ情報を保存・§28.4**・**実装済**）。`dry-run-fetch-entries-page.mjs` を拡張。**既定は保存なし dry-run**／`--push`＝保存計画（no-op・実 PUT しない）／**`--push --execute`＝実 shared PUT（二段 opt-in）**。保存先 `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json`（**1 venue=1 JSON**・GitHub Contents API・save-entries.mjs と同一規約・token=`GITHUB_TOKEN_KEIBA_DATA_SHARED`＋gh auth fallback・**token 値は出さない**）。**保存ガード**＝validator schema PASS（error 0）／`sourceMeta`(auto/uma_shosai/recordSourced:false/missingRecordReason/recordCoverage:0%)一致／date・venue・venueCode・totalRaces===races.length・horses 非空／**record 0埋め含むなら拒否**。**既存ファイルは create-only**（上書きは `--force`・既存 SHA 確認）。**`repository_dispatch` しない**（AK/KI import は F4）。`sourceMeta`/coverage を保存 JSON に残す。
- **PR-F4**: AK/KI import（KI は included_files に `src/data/entries/**` 追加）。
- **PR-F5**: 条件付き表示（取得方法非依存・**record がある場合のみ通算/条件別を表示・§28.5**・§23.4 禁止表現を守る）。

### 27.7 維持する禁止事項（本 PR-F0）
- 今回は **実装しない / 実取得しない / 保存しない**。
- **shared データ / AK / KI / workflow を変更しない**。
- **`entries-manager.astro` / `save-entries.mjs` を変更しない**。
- **JRA `horseHistories` に触らない** / `nankan/recentHorseHistories` 既存仕様を**壊さない**。
- **`featureScores` / AI指数 / 印 / 買い目 / 穴馬 / `dark-horse.mjs` に触らない**。
- **keiba.go.jp DataRoom を取得しない** / **`uma_info` の全履歴取得には進まない**。
- **git 履歴を書き換えない**。

---

## 28. record optional 方針（PR-F2a・docs-only）(2026-06-11)

自動取得 entries（出馬表ページ由来）の `record`（着別 5分割）について、**案(2)＝record を optional 扱い**にする方針を docs に固定する。本節は方針の docs 固定のみで、**実装なし・実取得なし・保存なし・shared/AK/KI/workflow/scripts 変更なし**。

### 28.1 record 補完源 read-only 調査の結論
同一レースID（`2026061020040301` / programID `20260610200403`）を基準に、各候補ページを最小・低負荷で read-only 確認した結論:

- **`uma_shosai/{raceID}.do`（出馬表）**: profile + recentRaces（最大5）は**あり**。**record 着別 5分割（total/left/right/venue/distance × wins/seconds/thirds/unplaced）は無い**。当ページの成績欄（`cs-ord1`着順(距離別)/`cs-ord2`着順(場別)/`cs-recCond`馬場状態別/`cs-recJky1`騎手別 等）は **平均着順・勝率（％）で別形式**、`1着/2着/3着` 表記は賞金・番組ポイント・予想印チェックボックスのUI。
- **`program/{14桁}.do`（番組）**: 馬番/馬名/騎手中心の軽量版。record・recentRaces とも**無し**。
- **`result/{16桁}.do`（成績・払戻金）**: レース結果中心。検出した `N-N-N-N` は**通過順**で着別ではない。着別 record **無し**。
- **`repay`系**: result（成績・払戻金）に内包＝別取得不要。着別 record **無し**。
- **`uma_info/{horseID}.do`（馬単体）**: 着別/条件別の候補だが**今回スコープ外**（馬単体・全履歴方向）。**取得しない**。
- **keiba.go.jp DataRoom**: **対象外**。取得しない。

→ **着別 record の補完源は出馬表系（uma_shosai/program/result/repay）に存在しない**。公開ページで残る候補は uma_info（対象外）のみ。

### 28.2 採用方針（案2＝record optional）
- 自動取得 entries は **profile + recentRaces を中心**とする。
- **record は optional**。取れない場合がある前提で設計する。
- **record 0埋め保存は禁止**（0-0-0-0 を「実績」として保存しない）。
- record が無い場合は **「未取得」を明示**する（後述 §28.4 のメタ情報）。
- **record が無い entries を「0戦」と解釈しない**。
- **record 欠落でも parsedResult schema としては受け入れる**設計に変更する（§28.4 の validator 改訂で対応）。
- record が **ある**場合（手作業由来等）は従来どおり使う。

### 28.3 手作業 fallback との関係
- 手作業 `entries-manager` 由来は **record を持つ場合がある**（貼り付け元テキストに 全/左/右/場/距 着別がある）。
- record ありデータは **record 表示（通算/条件別）に使える**。
- **自動取得版と手作業版で record coverage が異なることを許容**する。
- ただし **取得方法に関わらず JSON の基本構造（parsedResult schema）は維持**する。
- **`sourceMeta` または coverage 情報で record 有無を判定できる**ようにする（取得方法・recordCoverage・missingRecordReason 等）。

### 28.4 validator / F3 方針
- **F2 validator は今後、record 欠落を error ではなく warning/optional とする方向**（PR-F2b で実装）。
  - 具体: record キー欠落／record が `null`／`recordSourced:false` 等を **error にしない**。
  - ただし **record が存在して 0埋め（全フィールド 0）だけが入っている状態は、error または禁止扱い**にする（虚偽の「0戦」を防ぐ）。「未取得」は null/省略で表し、0埋めしない。
- **record が無い場合でも保存候補にはできる**（F3 opt-in 保存の対象になりうる）。
- **F3 opt-in 保存**では、`recordCoverage` / `sourceType`（auto/manual）/ `missingRecordReason`（例: `uma_shosai_no_record`）等の**メタ情報を残す設計**にする。0埋め record では保存しない。

### 28.5 AK/KI 表示方針
- **profile / recentRaces** は自動取得 entries から**表示可**。
- **record がある場合のみ**、通算成績・条件別成績を表示する。
- **record が無い場合**、通算成績・条件別成績は **非表示** または **「データ未取得」** とする。
- **「0戦」「成績なし」と表示しない**。
- **「全履歴」「JRA同等」「条件別成績が常時出る」と表記しない**（§23.4 と整合）。

### 28.6 本 PR（PR-F2a）でやらないこと
- validator の実装変更（PR-F2b）／shared 保存（PR-F3）／AK・KI 実装（PR-F4/F5）には進まない。
- 実取得・保存・scripts/validator/entries-manager.astro/save-entries.mjs の変更なし。

---

## Phase D クローズ記録（2026-06-09）

南関 recentHorseHistories の admin opt-in dispatch（Phase D）は、以下をもって**クローズ扱い**とする。追加実装は行わない。

### 完了状況
- **Phase D-1**: 設計方針を docs 記録済み（§18）。
- **Phase D-2**: admin 単発 opt-in dispatch 専用 script 実装済み（§19）。
  - `scripts/dispatch-recent-horse-histories-nankan.mjs` が**存在**（commit `9e57acd`）。
  - 単発 dispatch は**既に動作テスト済み**（§20・2026-06-01 FUN で一気通貫 PASS）。
  - **event_type** = `recent-horse-histories-nankan-updated`（JRA `horse-histories-updated` 不使用）。
  - **payload** = 単一 `date` + `venues:[CODE]`（+ `source`）。
  - **AK/KI 側 workflow** = `import-recent-horse-histories-nankan-on-dispatch.yml`（両 repo・byte 一致）。
- **一括 dispatch / updates 配列 / AK/KI workflow 改修は不採用**（§18.3）。
- **Phase C-6 の concurrency 事故（中間 run cancel）再発防止**のため、バックフィルは**逐次運用を維持**（1件 dispatch→completed 確認→次）。
- 現時点では**追加実装せず**、Phase D はクローズ。

### 運用上の注意点（厳守）
- **dispatch はデフォルト OFF**（`--dispatch` 無し＝常に dry-run）。
- **実行は opt-in のみ**（`--dispatch` + `--confirm-dispatch=recent-horse-histories-nankan-updated` の二段＋8ゲート）。
- **一括 dispatch は禁止**（複数日/複数場のワンショット送信をしない）。
- **updates 配列は禁止**（AK/KI は単一 date + venues CSV のみ対応）。
- **AK/KI workflow 改修前提にしない**（片側寄せ・契約変更をしない）。
- **shared JSON 手編集禁止**。
- **AI指数・印・買い目を触らない**（recentHorseHistories は表示専用・計算系非接続）。
- 実 dispatch は専用 token がマコさん端末前提のため、**実送信はマコさん手動**。

---

## 14. 更新履歴

- 2026-06-11: **PR-F2a：record optional 方針を docs 固定（§28 新設・§27.6・§23.6 更新）**。record 補完源 read-only 調査の結論＝**着別 5分割 record（total/left/right/venue/distance × wins/seconds/thirds/unplaced）は出馬表系（uma_shosai/program/result/repay）に無い**（uma_shosai は profile+recentRaces のみ・成績欄は平均着順/勝率で別形式／program は軽量版／result は通過順で着別でない／uma_info はスコープ外／keiba.go.jp DataRoom 対象外）。採用＝**案(2) record optional**: 自動取得 entries は profile+recentRaces 中心・record は optional・**0埋め保存禁止**・record 無しは「未取得」明示（null/省略・0戦と解釈しない）・record 欠落でも parsedResult schema は受容。手作業 entries-manager 由来は record を持つ場合があり従来どおり使用、自動/手作業で record coverage 差を許容、`sourceMeta`/coverage で record 有無を判定。validator は今後 record 欠落を error でなく warning/optional へ（**0埋めだけは error/禁止**・PR-F2b）。F3 opt-in 保存は recordCoverage/sourceType/missingRecordReason 等メタを保存。AK/KI は **record がある場合のみ通算/条件別を表示**・無い場合は非表示or「データ未取得」・「0戦」「成績なし」「全履歴」「JRA同等」と表記しない。PR分割更新（F2a docs→F2b validator→F3保存→F4 import→F5 表示）。**docs-only・実装/実取得/保存なし。shared/AK/KI/workflow/scripts/entries-manager.astro/save-entries.mjs/JRA horseHistories/recentHorseHistories/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし**。
- 2026-06-11: **PR-F0a：「1日1会場」前提の誤記を「複数会場対応／初回dry-runは1会場単位」へ補正（§27.3・§27.3.1新設・§27.6・§26.5）**。南関は **1日1〜複数場開催がある**（例 6/29 大井・船橋の2場）ため、「1日1会場のみ」「複数指定はエラー」は設計前提として誤り。修正＝初回 dry-run は1会場単位でよいが**設計は1日複数会場（OOI/KAW/FUN/URA）対応**／1会場概ね12レース・複数会場時は会場数に比例／**1実行=1venue を基本単位**にしつつ同一 date 複数 venue を順次処理できる構造／会場ごとに独立して fetch/parse/schema検証/output・1会場失敗時も他会場可否を summary 出力／CLI `--venue=OOI` 単一基本＋将来 `--venues=OOI,FUN` 複数指定を塞がない・`--url` 可／**venue ごとに parsedResult を作り 1日複数 venue を1JSONに混ぜない**（§27.3.1 に venue 別保存パス `YYYY-MM-DD-{OOI|FUN|KAW|URA}.json` を明記）。**docs-only・実装/実取得/保存なし。shared/AK/KI/workflow/scripts/entries-manager.astro/save-entries.mjs/JRA horseHistories/recentHorseHistories/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし**。
- 2026-06-11: **entries 供給方針を「自動取得 first / 手作業 fallback」へ変更（§27 新設・§23/§26 更新・PR-F0）**。entries を最新日に継続供給するため、**第一候補＝自動取得・fallback＝entries-manager 手作業コピペ**の両対応とする。出力 JSON schema は自動/手作業で同一・保存先は既存 `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json`・AK/KI は取得方法を意識しない。**自動取得の対象は出馬表ページ系に限定**（uma_info 全履歴取得には進まない／keiba.go.jp DataRoom 取得しない）。安全設計＝保存なし dry-run first・初回1会場単位／設計は1日複数会場対応・対象URL/件数ログ・token非露出・アクセス間隔・retry過剰にしない・失敗時途中停止・schema不一致なら保存しない・featureScores/AI/印/買い目/穴馬に非接続。手作業 fallback は同じ save-entries.mjs・同じ shared path・出力JSON同一・差分は source/meta に記録可だが UI 非使用。停止寄り表現（要許諾/規約違反リスク/不可寄り/許諾確認まで保留/手作業運用が前提/規約リスク/自動取得しない）を中立・実務寄りへ置換。PR分割 PR-F0(docs・今回)→F1(dry-run parser)→F2(schema validator)→F3(opt-in保存)→F4(AK/KI import)→F5(条件付き表示)。**docs-only・実装/実取得/保存なし。shared/AK/KI/workflow/entries-manager.astro/save-entries.mjs/JRA horseHistories/recentHorseHistories/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし**。本変更は未merge PR #94（断定緩和）を統合し #94 は close。
- 2026-06-05: 初版作成。Phase A〜D 整理、read-only 監査結果（recentHorseHistories vs JRA horseHistories、AK/KI 表示箇所、feature 非接続）を反映。
- 2026-06-11: **Phase B-1 / entries 運用再開 runbook・可否整理を追記（§26・PR-E3a）**。AK/KI 実装（PR-E1b/c・E2b/c）の前提＝entries が最新日に供給される運用、を判断可能にする read-only 整理。entries-manager 現在地（現存・手作業コピペ＋ブラウザ内パース・Step1開催日/競馬場→Step2貼付/自動解析→Step3保存Git Push→Step4プレビュー・raceNumberは第N競走parse・token非露出）。save-entries 仕様（POST `/.netlify/functions/save-entries`・raceDate/venue/venueCode/category/data・保存先 `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json`・token GITHUB_TOKEN_KEIBA_DATA_SHARED server側・**repository_dispatch 無し＝AK/KI 自動反映されない**）。保存データ構造（top/horse keys/record total・left・right・venue・distance/recentRaces 最大5走・**mother/birthdate/horseId/uma_info ID/全履歴 history[] は無い**）。手作業手順（出馬表確定後→admin→日付/会場→公式出馬表コピー→貼付→自動解析→確認→保存→shared確認・**この時点でAK/KIには出ない**）。作業負荷（南関1日1〜複数場・1会場概ね12レース・テキスト収集人手・実質数十分・毎開催日・止まると最新日欠落）。運用上の注意（手作業運用でも外部サイト由来テキストの扱いには注意・利用範囲の解釈には確認余地・プレビュー必須・entries保存だけでは未反映）。AK/KI実装条件（継続供給・外部データ利用方針の確認・最新日1日分作成・shared保存・import価値・継続見込み・import方式 workflow_dispatch/repository_dispatch/手動 のいずれか）。実装分岐（継続供給される→F4/F5・安定しない→保留/現行維持/全履歴は uma_info の利用条件・運用方針が固まるまで本格展開しない）。※後続 PR-F0 で本節を「手作業 fallback runbook」として再フレーム。**docs-only・1ファイル・read-only整理。entries-manager.astro/save-entries.mjs/shared/AK/KI/workflow/scripts/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし・実保存/実取得なし**。
- 2026-06-11: **Phase B-1 / KI 側 設計を追記（§25・PR-E2a）**。KI の entries 設計を read-only で docs 固定（AK §24 と同一データ契約）。**KI 固有の SSR / included_files 注意を明記**: 南関 prediction/free SSR(prerender=false)＋[slug] static(true)。entries を SSR で読むには **`src/data/entries/**` を netlify.toml `included_files` に追加が必要**（recentHorseHistories は PR-2/#31 で追加済＝前例）・漏れると本番SSRで黙ってフォールバック・AK の prerender=true 前提で進めない。配線案（保存先 `src/data/entries/nankan/...`・loader `loadEntriesNankan.js`・inject `injectEntriesNankan.js`・注入 `entriesProfile`/`entriesRecord`/`entriesRecentRaces`・recentRacesFromHistoriesNankan と混ぜない）。join key＝AK同一（`date+venue+raceNumber+horseNumber` 主・horseName 従・単独join禁止・別日別会場はjoinしない）。entries限定表示（bms/owner/breeder/coat/bestTime・record・recent5）。JRA UI は構造のみ流用・集計流用せず record 直接マップ・条件別は左右/会場/距離。表示名/禁止表現は AK同一。実装前判断（entries運用再開・import workflow・KI SSR 同梱方法・直近走一本化・AK/KI同一契約）。PR分割 E2a(docs)→E2b(import+included_files)→E2c(表示)、E2b/E2c は entries運用再開後。**docs-only・1ファイル。KI実装/Netlify設定/workflow/shared/AK/featureScores/AI/印/買い目/穴馬/dark-horse.mjs/JRA表示/recentHorseHistories 変更なし**。
- 2026-06-11: **Phase B-1 / AK 側 設計を追記（§24・PR-E1a）**。AK の entries 設計を read-only で docs 固定。AK は prerender=true SSG（included_files 問題なし）・entries 未取込・recentHorseHistories 配線が雛形。配線案（保存先 `src/data/entries/nankan/...`・loader `loadEntriesNankan.js`・inject `injectEntriesNankan.js`・注入フィールド `entriesProfile`/`entriesRecord`/`entriesRecentRaces`・recentRacesFromHistoriesNankan と混ぜない）。join key＝`date+venue+raceNumber+horseNumber` 主・horseName 従（単独join禁止・別日別会場はjoinしない）。entries限定表示（bms/owner/breeder/coat/bestTime・record total/left/right/venue/distance・recent5）。JRA UI は構造のみ流用・集計ロジックは流用せず record を直接マップ・条件別は左右/会場/距離（芝ダ分割しない）。表示名（プロフィール/通算成績/条件別成績/直近5走/出馬表由来データ）・禁止表現（全履歴/JRA同等/直近10走/horseHistories完全対応/全馬常時）・entries無し日は非表示orデータ不足・空枠/推測値なし。実装前判断（entries運用再開の是非・import workflow・直近走の供給源一本化・AK/KI同一契約）。PR分割 E1a(docs)→E1b(import)→E1c(表示)、E1b/E1c は entries運用再開後。**docs-only・1ファイル。AK実装/UI/shared/workflow/featureScores/AI/印/買い目/穴馬/dark-horse.mjs/JRA表示/recentHorseHistories 変更なし**。
- 2026-06-11: **Phase B-1 暫定表示スコープを追記（§23・PR-E0）**。全履歴 `history[]` 路線は `uma_info` の利用条件・運用方針を確認しながら進める段階で当面スコープ外（[nankan-horse-histories-detail-contract.md] §12.10）のため、**既存データでできる範囲の南関馬詳細表示スコープを docs 固定**。表示可能＝基本プロフィール（性齢/父/騎手/斤量/調教師・最新日常時・AK表示済）／entries がある日限定の血統拡張（母父/馬主/生産者/毛色/bestTime）・通算成績（record.total）・条件別成績（record.left/right/venue/distance）／直近走（recentHorseHistories 最大5走 or racebook pastRaces 3〜4走）。表示不可＝全履歴/6走前以降/JRA式全履歴再集計/母名/生年月日/最新日の安定 entries 通算条件別（**entries は 2026-04-07 停止・最新日に無い**）。**カバレッジ制約＝entries 7ファイル・recentHorseHistories backfill 限定・最新日に確実に在るのは racebook/predictions のみ・AK/KI は entries 未取込**。禁止表現（「全履歴」「JRA同等」「直近10走」「horseHistories完全対応」「通算/条件別が全馬常時」と表記しない）。フォールバック（entries 無し日=基本プロフィールのみ・空枠/推測値を出さない・現行表示維持）。entries 継続供給（自動取得 first / 手作業 fallback・§27）が実用表示の前提・自動取得対象は出馬表ページ系に限定し uma_info 全履歴には進まない。PR分割 PR-E0(docs)→E1(AK)→E2(KI)。**docs-only・1ファイル・実装/取得/スクレイプ/generator/dry-run/scripts/shared/AK/KI/entries-manager.astro/save-entries.mjs 変更なし**。
- 2026-06-09: **Phase D クローズ記録を追記**。D-1 設計／D-2 単発 opt-in dispatch script（`9e57acd`・2026-06-01 FUN テスト済）をもって Phase D をクローズ。一括 dispatch / updates 配列 / AK・KI workflow 改修は不採用、バックフィルは逐次運用維持、dispatch デフォルト OFF・opt-in のみを明記。追加実装なし・docs のみ。
- 2026-06-05: **Phase A 完了記録を追記（§15）**。06-03 FUN shared PUT / AK・KI import 成功、KI 本番5走表示確認、AK latest-only 扱い、非接続維持を記録。
- 2026-06-05: **Phase C read-only 監査結果 & C-1 validator 強化を追記（§16）**。同日/未来日=FAIL・順序乱れ/重複=WARN を validator に追加、根因2系統（parsePastRaceDate 同日判定・limitRecentRacesToLatest5 早期return）を特定、06-03/06-04=FAIL・06-02/06-05=PASS を実ファイルで検証。generator 根治（C-2）は未着手。
- 2026-06-05: **Phase C-2 generator 根治を追記（§17）**。`parsePastRaceDate` 同月日=前年化（`>=`）・同日/未来日除外フィルタ・常時昇順ソート・件数整合維持を実装。テンカハル/ケイアイメビウスの同月日エントリは実在の前年走と判明（誤年推定）。4日再生成で同日0・未来日0・順序乱れ0・C-1 validator PASS を確認。duplicateDate は racebook 原本由来のため WARN 据え置き。
- 2026-06-05: **Phase C-3〜C-7 完了をチェックリストへ反映（§12）**。横展開（OOI/KAW/URA）・既存 shared 差分監査・shared 上書き PUT（6件 HTTP200）・AK/KI 逐次 dispatch 同期（一括は concurrency cancel→逐次で全12件 PASS）・本番/表示確認（leak0・テンカハル/ケイアイメビウス是正）。
- 2026-06-05: **Phase D-1 設計方針を追記（§18）**。方式A（admin 単発 opt-in dispatch）＋バックフィル逐次。updates 非対応・concurrency 注意・token 経路確定の前提を記録。
- 2026-06-05: **Phase D-2 実 dispatch 運用テスト成功を追記（§20）**。2026-06-01 FUN 1件で `generate→validate(PASS/WARN0)→push(201)→同一artifact dispatch(AK/KI 204)→workflow success→両repo取り込み` を一気通貫で実証。byte一致gate は同一 artifact で通過（案ア）。複数日一括は引き続き禁止。
- 2026-06-05: **Phase D-2 単発 dispatch 専用 script 実装を追記（§19）**。`scripts/dispatch-recent-horse-histories-nankan.mjs` を追加（送信専用・shared PUT なし）。event=`recent-horse-histories-nankan-updated` 固定（JRA `horse-histories-updated` 不使用）・単一 date/venues・updates/複数日一括 禁止。多段ゲート（--dispatch opt-in / --confirm-dispatch 完全一致 / validator PASS・WARN原則禁止 / shared GET200+byte一致 / AK・KI 両 token 必須・GITHUB_TOKEN フォールバック禁止 / token値非表示OK・MISSING のみ）。byte一致gate は「PUT した同一 artifact を dispatch」前提（案ア採用・generatedAt 除外の案イは不採用）。`dispatchToTargets` 不使用。本PRでは実 dispatch / shared PUT / AK・KI 変更なし。
- 2026-06-05: **Phase D-1 設計方針を追記（§18）**。方式A（admin 単発 opt-in dispatch）を基本＋バックフィルは逐次併用。updates 配列/一括 dispatch/concurrency 分割/AK・KI 改修は不採用。Phase C-6 concurrency 事故の原因と逐次解決、最小差分案、token 経路確定の前提を記録。実装は Phase D-2（未着手）。
- 2026-06-05: **push script 上書きPUT対応を実装（§17.y 6.6）**。`push-recent-horse-histories.mjs` をデフォルト create-only 維持のまま、`--allow-overwrite` ＋ `--confirm-overwrite=recent-horse-histories-update` の2段ガード時のみ既存 sha を使った update PUT（HTTP200）を許可。保存後 GET 内容一致確認は維持・token非表示。dry-run のみ検証（実PUTなし）。06-04 FUN 反映は PR-D でこの経路を使う。
- 2026-06-05: **PR-B duplicateDate generator根治を実装（§17.y 6.5）**。`enrich-recent-horse-histories.mjs` に finish 主判定の `RESULT_MISMATCH`（results rank と raw finish 不一致）＋除外（`excludedResultMismatch`）を追加。jockey 照合なし・validator 不変更。06-04 FUN で mismatch=2・duplicateDate 2→0・recentRaces 479→477・PASS、横展開6日 mismatch=0 全 PASS を tmp 検証（shared PUT/dispatch なし）。反映は PR-D 以降。
- 2026-06-05: **duplicateDate generator根治の実装前設計を§17に追記（§17.y）**。PR-3監査結果を踏まえ、racebook raw と results正本の finish/jockey 突合で誤行を判定し、Phase B表示前にgenerator側で根治する方針を記録。date単独dedup禁止、AK/KI表示側対応禁止、shared JSON手編集禁止、判定条件案（正常/誤行/比較不能）・resultMatchKeyV2案・validator強化案・PR分割（PR-A〜E）・回帰確認を明記。実装はPR-B以降で未実施。
- 2026-06-05: **PR-3 duplicateDate 精密判別結果を§17に追記（§17.x）**。06-04 FUN の R5 ノーヴヒーロー(3-10)/R7 マサノプレジオーソ(5-6) の duplicateDate=2 は、**racebook 原本への別馬近走混入（主因A）＋ resultMatchKey 粒度不足（副因D）の複合**と判定。results 正本では各馬とも正しい1着順のみ存在（誤行は着7・別馬）。yearInferred=false で年推定起因ではない（旧仮説を否定）。**単純 dedup 禁止**（誤行を残す危険）、**Phase B 表示拡張前に generator 側で正本突合により根治**が必要と明記。修正は次タスクで設計。
- 2026-06-05: **Phase B 実装前契約を追記（§21・PR-1）**。4 repo read-only 監査を踏まえ、目的（recentRacesFromHistoriesNankan 表示専用・計算系非接続・recentRaces 非上書き）、shared/AK/KI の表示責務、表示可否フィールド（whitelist 22 項目／内部キー禁止 11 項目）、PR 分割（PR-1 docs→PR-2 KI included_files→PR-3 duplicateDate 監査→PR-4 AK→PR-5 KI）、禁止事項、回帰確認を確定。実装前提として **KI netlify.toml included_files に recentHorseHistories 欠落（SSR 2 ページ要実機確認）** と **06-04 FUN duplicateDate=2 の矛盾重複** を要対応として明記。docs のみ・実装変更なし。
- 2026-06-10: **Phase B-0 プロフィール先行表示のスコープを追記（§22・PR-B0）**。Phase B を段階化し、最低リスクの「プロフィール先行」を切り出し。対象＝既存 horse 由来の 5 項目（性齢 `age` / 父 `sire` / 騎手 `jockey` / 斤量 `weight` / 調教師 `trainer`）。供給源は racebook / 予想 horse object であり **recentHorseHistories 非依存**、§21.5 の whitelist 22 項目（過去走行用）とは**別責務**であることを明記。対象外＝母 `dam` / 母父 / 馬主 / 生産者 / 通算成績 / 条件別成績 / 直近10走（dam 等は AK/KI horse へ安定供給されず、通算/条件別/10走は admin/shared の新規データ契約・集計が必要）。AK/KI 別 PR・片寄せ共通化なし・既存表示との重複回避・欠損は条件付き非表示。禁止（featureScores/AI指数/印/買い目/穴馬/dark-horse.mjs 非接続・JRA 既存表示非変更）。PR 分割（PR-B0 docs→PR-B1 AK→PR-B2 KI→PR-B3 以降 通算/条件別/10走 契約）。§21.10 の前提 2 点（KI included_files＝PR #31 merge 済 `ba4d382`／06-04 duplicateDate＝shared/AK/KI 是正済）は解消済みと記録。docs のみ・実装変更なし。
