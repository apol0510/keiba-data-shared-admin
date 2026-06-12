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
- **PR-F3a**: **1会場=全レース集約契約 docs 固定（本 PR・§29）**。F3 単発保存は 1 URL=1 race（R01のみ）。実運用は **1 venue=全レース入り JSON** にするための集約契約・CLI 方針・結合/検証・失敗時方針・R01-only の扱いを docs 固定（docs-only）。
- **PR-F3b**: aggregator dry-run 実装（`--program-url`／`--urls`・全 race fetch・parsedResult 結合・validator・**既定保存なし**・§29）。
- **PR-F3c**: aggregator opt-in 保存（既存 F3 保存ガード流用・**full venue JSON のみ保存**・R01-only 置換は `--force`・§29）。
- **PR-F4**: AK/KI import（KI は included_files に `src/data/entries/**` 追加・**auto/uma_shosai かつ totalRaces=1 は import スキップ**・§29.7 / **import 契約は §30**）。**F4a(docs・import契約固定)→F4b(AK import)→F4c(KI import)→F4d(dispatch/import 接続)** に分割。
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

## 29. 1会場=全レース集約契約（PR-F3a・docs-only）(2026-06-11)

F3 単発保存は **1 URL = 1 race（R01のみ）**の保存確認まで完了（`nankan/entries/2026/06/2026-06-10-OOI.json`＝totalRaces=1）。実運用では **1 venue = 全レース入り JSON** にするため、集約の契約・CLI 方針・結合/検証・失敗時方針・R01-only ファイルの扱いを docs に固定する。本節は方針固定のみ＝**実装なし・実取得なし・保存なし・shared/AK/KI/workflow 変更なし**。

### 29.1 1会場=全レースの基本契約
- `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json` は原則 **1 venue = 全レース入り JSON**。
- **1 race だけの JSON は実運用 import 対象外**（R01-only は §29.7）。
- **`totalRaces = races.length`**。
- **`races` は raceNumber 昇順**。
- **1日複数 venue は venue ごとに別 JSON**。**1日複数 venue を1JSONに混ぜない**（§27.3.1）。

### 29.2 全レースURL取得方針
- **`program/{14桁}.do`** に当該会場の `syousai`/`uma_shosai` の R01〜R12（前後）リンクが揃う（read-only 調査で R01〜R12 の12件確認）。
- 初回 aggregator 実装は **`--program-url` を推奨**。
- **`--urls=tmp/urls.txt`**（明示 URL リスト）は **fallback として許容**。
- **`--date --venue` 単独自動解決は初期実装に入れない**。
  - 理由: raceID = `YYYYMMDD + jyo2 + kai2 + nichi2 + R2` で、**kai2/nichi2 は date+venue だけでは確定できない**（開催スケジュール依存）。jyo2 は venue から導出可。
- **`--program-id=<14桁>` は将来候補**。program URL / programID は **kai2/nichi2 を含むため安定**。

### 29.3 取得単位
- `--program-url` を **1回取得**して race URL を**列挙**する。
- 各 race URL を**順次取得**（**低負荷・アクセス間隔・停止可能**）。
- **クロールではなく program 内リンクの列挙**（自動巡回しない）。
- **`uma_info` は取得しない**／**keiba.go.jp DataRoom は取得しない**。

### 29.4 parsedResult 結合契約
- 各 race HTML → 既存 mapper（`entries-html-to-parsed.mjs`）→ parsedResult（`totalRaces=1, races[0]`）。
- venue 集約時:
  - **`date` / `venue` / `venueCode` / `category` の一致を必須**（不一致は **error**）。
  - `races[0]` を **raceNumber 昇順に結合**。
  - **raceNumber 重複は error**。
  - **horses 空の race は error**。
  - **`totalRaces = races.length`**。
  - **program 内の race URL 数と取得成功 race 数が一致しないと error**（取りこぼし検出）。
- `createdAt` / `lastUpdated` は **venue 単位で再設定**。

### 29.5 sourceMeta 設計
- **top-level `sourceMeta` を venue 単位**で持つ:
  - `sourceType = "auto"` / `sourcePageType = "uma_shosai"` / `recordSourced = false` / `recordCoverage = "0%"` / `missingRecordReason = "uma_shosai_no_record"`
- **`sourceMeta.races[]` に race 単位の来歴**を持たせる（採用候補）:
  - `raceNumber` / `sourceUrl` / `finalUrl` / `status` / `bytes` / `warningsCount` / `recentRacesCoverage`
- **`races[]` 本体に余分な取得メタを混ぜない**。**AK/KI 互換のため、来歴は `sourceMeta` 側に寄せる**。

### 29.6 失敗時方針
- **1 race でも fetch / parse / validator 失敗なら venue 全体を保存しない**（**部分保存しない**）。
- **`--allow-partial` は初期実装に入れない**。
- summary に **失敗 race（raceNumber・理由）** を出す。
- **validator error が1件でもあれば保存しない**。

### 29.7 R01-only 保存済みファイルの扱い
- `nankan/entries/2026/06/2026-06-10-OOI.json` は **F3 単発確認用の R01-only ファイル**。
- **F4 import 対象外**。**F4 前に full venue JSON で置換が必要**（置換は **`--force`**）。
- **R01-only 判定**:
  - `sourceMeta.sourcePageType === "uma_shosai"` かつ `totalRaces === 1` かつ `races.length === 1`
- **AK/KI import 側でも、auto/uma_shosai かつ `totalRaces === 1` の entries は import スキップ候補**として扱う方針を記録（F4 スコープ）。
- 本 PR（F3a）では **R01-only ファイルを上書き・置換しない**（docs 固定のみ）。

### 29.8 本 PR（PR-F3a）でやらないこと
- aggregator 実装（PR-F3b）／集約 opt-in 保存（PR-F3c）／AK・KI 実装（F4/F5）には進まない。
- 実取得・shared 保存・`--push --execute`・R01-only 上書き・dispatch・scripts/save-entries.mjs/entries-manager.astro 変更なし。

### 29.9 aggregator dry-run 実装（PR-F3b・保存なし dry-run 段階）(2026-06-11)
- 実装: `scripts/nankan/dry-run-aggregate-entries.mjs`（**新規**）。§29 契約に準拠した **集約 dry-run 専用**。
- **既定で保存しない**。本スクリプトは **token を読まない / shared PUT しない / repository_dispatch しない**（save 経路を一切持たない）。opt-in 保存は **PR-F3c**（別スクリプト/別PR）。
- 設計判断: 既存 `dry-run-fetch-entries-page.mjs`（F3 単発＝opt-in 保存付き）を拡張せず **新規スクリプト**にした。理由＝凍結中の F3 保存経路（token/PUT/`--push --execute`）と集約を混在させないため。mapper（`entries-html-to-parsed.mjs`）と validator（`entries-schema-validator.mjs`）は共通ライブラリとして再利用し、業務ロジックは重複させない。
- CLI: `--program-url`（推奨・program/{14桁}.do から `syousai/{16桁}.do` を列挙）／`--urls`（fallback・空行/`#`無視・重複は error）／`--max=N`（軽量確認）／`--out=tmp/...`（dry-run JSON をローカル tmp に限定出力。shared 領域への書き込みは拒否）。`--date --venue` 単独自動解決は実装しない。
- 集約: race ID から date/jyo2/raceNumber を導出し、date・jyo2 が混在したら error・raceNumber 重複は error・program mode は URL 数≠成功数で error・1 race でも失敗なら **venue 全体を成功扱いにしない**（`--allow-partial` なし）。`races[]` 本体に取得メタを混ぜず、`sourceMeta.races[]` に race 来歴（raceNumber/sourceUrl/finalUrl/status/bytes/warningsCount/recentRacesCoverage）を集約。
- 実 dry-run 実績（2026-06-11）: `program/20260610200403.do`（大井）で **R01〜R12・totalRaces=12・races.length=12・raceNumber昇順・156頭・record 全 null（0埋めなし）・recent 充足率 100%・sourceMeta.races=12・validator schema OK（error 0・warning 173）**。exit 0。
- 本 PR（F3b）でやらないこと: 集約 opt-in 保存（F3c）／shared 保存／`--push --execute`／R01-only 上書き／dispatch／AK・KI（F4/F5）／save-entries.mjs・entries-manager.astro 変更。

### 29.10 aggregator opt-in 保存実装（PR-F3c・full venue のみ・二段 opt-in）(2026-06-11)
- 実装: `scripts/nankan/dry-run-aggregate-entries.mjs` に **二段 opt-in 保存経路**を追加（F3b の集約 dry-run に上乗せ）。
- 設計判断: 既存 single race 保存スクリプト `dry-run-fetch-entries-page.mjs`（凍結中の F3 保存経路）は **1バイトも変更せず**、保存 helper（token 取得 / 既存確認 GET / PUT / エラー整形）を aggregator 内に **self-contained に複製**した。契約値（`GITHUB_TOKEN_KEIBA_DATA_SHARED` / `apol0510/keiba-data-shared` / `main` / `EXPECT_SOURCE` / `deriveSharedPath` / commit message 書式）は F3 と同一。理由＝凍結経路への変更・回帰を避けるため（export 追加や共有モジュール抽出より低リスク）。
- **既定は保存なし dry-run**。`--push`（=`--save`）で保存計画、`--push --execute` で実 PUT の **二段**。
  - **`--push` 計画は token を読まない・GitHub GET/PUT しない**（no-op）。実 PUT・既存確認・R01-only 置換判定はすべて `--execute` 段でのみ。
  - 既存ファイルは **create-only が既定**。`--force` のときだけ update。既存が **R01-only（totalRaces=1）**なら full venue 置換に `--force` 必須で、既存 totalRaces/sourcePageType を summary に明示。
  - **token 値は表示しない**。`repository_dispatch` は送らない（AK/KI import は F4）。
- 保存対象は **full venue JSON のみ**。保存前ガード（`evaluateAggregateSaveGuards`）で次を全て満たさなければ保存しない: validator schema PASS（error 0）/ `totalRaces===races.length` / `totalRaces>1` / `races.length>1` / `sourceMeta.sourceType==="auto"` / `sourcePageType==="uma_shosai"` / `recordSourced===false` / `missingRecordReason==="uma_shosai_no_record"` / `sourceMeta.races.length===races.length` / raceNumber 昇順・一意 / horses 空 race なし / record 0埋めなし。**`--max` の partial 取得は保存不可**・1 race 失敗で venue 全体保存不可・`--allow-partial` なし。
- 確認（2026-06-11・**`--push --execute` は未実行**）: full dry-run（大井 R01〜R12・totalRaces=12・schema OK・exit0）/ `--push` 計画（guard PASS・token 不使用・GET/PUT なし）/ negative（totalRaces=1→保存不可・shared 領域 `--out`→拒否・`--max` partial→保存不可・raceNumber 重複→NG・record 0埋め→NG・sourceMeta.races 不一致→NG、いずれも exit1/NG）。
- 本 PR（F3c）でやらないこと: 実 shared PUT（`--push --execute`）／R01-only ファイルの実置換／dispatch／AK・KI import（F4）／表示（F5）／save-entries.mjs・entries-manager.astro 変更。実 PUT は **F3c merge 後にユーザー明示許可があれば full venue JSON を1件のみ** 実行する扱い。

---

## 30. AK/KI import 契約（PR-F4a・docs-only）(2026-06-11)

F3 系列で生成・保存できるようになった **南関 full venue entries JSON** を AK/KI に取り込む前に、
import 契約・スキップ条件・取り込み責務・record null の扱い・表示分離を docs に固定する。
本節は **docs-only**（実装・shared 保存・dispatch・AK/KI 変更・workflow 変更を含まない）。

前提（実績）: `nankan/entries/2026/06/2026-06-10-OOI.json` は R01-only（totalRaces=1）から
**full venue（totalRaces=12・races.length=12・raceNumber 1〜12・horses=156・record 全 null・
validator error 0）** へ置換済み（shared commit `ef584e7`・**repository_dispatch 未実施**）。

### 30.1 F4 の目的
- shared の `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json` を AK/KI に取り込む。
- 取り込み対象は **full venue entries のみ**。**R01-only / partial は import しない**。

### 30.2 import 対象条件（すべて満たすときだけ取り込む）
- `category === "nankan"`
- `sourceMeta.sourceType === "auto"`（自動取得）**または** 手作業由来でも **validator schema OK**
- `totalRaces === races.length`
- `totalRaces > 1` かつ `races.length > 1`
- raceNumber 昇順
- horses 空の race が無い
- validator error 0

### 30.3 import スキップ条件（いずれかに該当したら必ず import しない）
- `totalRaces === 1` または `races.length === 1`
- `sourceMeta.sourcePageType === "uma_shosai"` かつ `totalRaces === 1`（R01-only の典型）
- `sourceMeta.races` が存在し `sourceMeta.races.length !== races.length`
- validator error あり
- record 0埋め検出（全区分0 + 未取得コンテキスト）
- partial / `--max` 取得由来
- date / venue / venueCode が JSON 内容・ファイル名・期待値で不一致

### 30.4 R01-only の扱い
- `2026-06-10-OOI` の R01-only は full venue へ置換済み（§30 前提）。
- 今後も **R01-only は F4 import 対象外**。
- **import 側にも防御的 skip を入れる**（uma_shosai かつ totalRaces=1 を弾く）。
  片付け漏れ・再発時に前日 R01 を当日として取り込む事故を二重に防ぐ。

### 30.5 AK/KI の取り込み責務
- shared から entries JSON を取得する。
- 各 repo の既存 data 配置ルールに合わせて保存する（KI は `src/data/entries/**` 等・§25.4）。
- 既存の **horseHistories / recentHorseHistories / predictions / featureScores と混同しない**。
- entries は **出馬表由来データ**として扱う（profile + recentRaces 中心）。
- **AI指数・印・買い目・穴馬には接続しない**（entries は表示用データ・計算系非接続）。

### 30.6 record null の扱い
- auto/uma_shosai entries は `recordSourced=false`・**record は null が正**。
- **0戦扱いしない**。
- 通算 / 条件別成績は **record がある場合のみ表示**。
- record null の場合は **非表示 または「データ未取得」**。
- **「0戦」「成績なし」「全履歴取得済み」「JRA同等」と表示しない**（§23.4 / §28.5 禁止表現）。

### 30.7 表示側との分離
- **F4 は import まで**。表示分岐は **F5**。
- F4 では **UI 表示を変えない**。
- AK/KI の見た目・CSS・買い目表示には触らない。

### 30.8 repository_dispatch 方針
- 本 PR（F4a docs-only）では **dispatch しない**。
- F4 実装時に dispatch / import workflow の接続方法を **別PR**で決める。
- 最初は **手動 import / 単発 workflow dispatch** で確認し、自動化は後段（F4d）。

### 30.9 PR 分割（F4 系列）
- **PR-F4a**（本 PR・docs-only）: import 契約固定。
- **PR-F4b**: AK import 実装 または dry-run。
- **PR-F4c**: KI import 実装 または dry-run。
- **PR-F4d**: dispatch / import 接続確認（手動→単発 dispatch→自動化の順）。
- **PR-F5**: 表示分岐（record 有無で通算/条件別の表示可否・§28.5）。

### 30.10 本 PR（PR-F4a）でやらないこと
- import 実装（F4b/F4c）／dispatch 接続（F4d）／表示分岐（F5）には進まない。
- shared 保存／repository_dispatch／AK・KI repo 変更／workflow 変更／
  scripts/nankan/dry-run-aggregate-entries.mjs・save-entries.mjs・entries-manager.astro 変更なし。

---

## 31. AK/KI 自動 import 接続方針（dispatch / workflow / included_files）（PR-F4d-1・docs-only）(2026-06-11)

F4b（AK）・F4c（KI）で import script + 実 import（`2026-06-10-OOI`）が両 repo に入った。
F4d は **shared full venue entries 保存 → AK/KI へ自動 import** を接続する系列。
本節（F4d-1）は **docs-only**（event_type / payload / workflow / included_files / PR分割 を固定。実装・workflow 追加・dispatch 送信を含まない）。

前提（実績）: AK main `b2be7ca` / KI main `c340516` に
`astro-site/src/data/entries/nankan/2026/06/2026-06-10-OOI.json`（totalRaces=12・horses=156・record 全 null・validator error 0）取込済。**repository_dispatch 未実施・workflow 未追加・KI included_files 未変更**。

### 31.1 dispatch event_type
- **event_type = `entries-nankan-updated`** に固定。
- 理由: 既存 `recent-horse-histories-nankan-updated` の命名規則（`<kind>-nankan-updated`）に合わせる。
- **`nankan-entries-updated` は命名規則外のため非推奨**（採用しない）。
- JRA 系 event（`horse-histories-updated` 等）は **絶対に流用しない**（南関 entries 専用で固定）。

### 31.2 dispatch payload 方針
既存 recentHorseHistories nankan と同じく **単一 date / venues を基本**。
```json
{ "date": "2026-06-10", "venues": ["OOI"], "category": "nankan", "kind": "entries", "source": "nankan-entries" }
```
- `date` 必須 / `venues` 必須（単一日・単一または複数 venue）。
- `updates` 配列は初期実装で **使わない**。複数日一括も初期実装で **使わない**。
- `sourcePath` は初期実装で **不要**（path は受信側で date/venue から導出）。
- `category` / `kind` は取り違え防止のため付与可。

### 31.3 AK/KI 受信 workflow 方針
- AK/KI とも新規 `.github/workflows/import-entries-nankan-on-dispatch.yml`。
- 既存 `import-recent-horse-histories-nankan-on-dispatch.yml`（AK/KI byte 一致）を **テンプレート**にする。
- トリガ: `repository_dispatch: types: [entries-nankan-updated]` ＋ `workflow_dispatch`（date/venues inputs）。
- 実行: `npm run import:entries:nankan -- --date X --venues Y`（F4b/F4c で追加済）。
- **`git add` 対象は entries のみに限定**（workflow の cwd=astro-site なら `src/data/entries/nankan/**`）。
  recentHorseHistories / featureScores / horseHistories / predictions には触らない。
- **専用 concurrency group**（例 `archive-entries-nankan-update`）で既存 workflow と混線させない。
- AK/KI workflow は **byte 一致を維持**（recentHorseHistories と同じ運用）。

### 31.4 admin dispatch script 方針
- 新規 `scripts/dispatch-entries-nankan.mjs`。
- 既存 `scripts/dispatch-recent-horse-histories-nankan.mjs` を **テンプレート**にする。
- **既定 dry-run**。実送信は **二段 opt-in**: `--dispatch` ＋ `--confirm-dispatch=entries-nankan-updated`（完全一致）。
- 送信先は AK/KI の 2 repo（`netlify/lib/dispatch.mjs` 思想）。**token 値は表示しない**。
- **実送信はユーザー明示許可時のみ**（dispatch 専用 token はマコさん端末前提 → 実送信はマコさん手動）。
- **F4d-1 では script を実装しない**（方針固定のみ）。F3c aggregator（`dry-run-aggregate-entries.mjs`）には dispatch を入れない（保存と送信は分離）。

### 31.5 KI included_files 方針
- 現状 KI `astro-site/netlify.toml` の included_files:
  `["src/data/horseHistories/**", "src/data/featureScores/**", "src/data/recentHorseHistories/**"]`。
- **`src/data/entries/**` は未登録**。
- **import だけなら included_files は不要**（data は repo に入る）。
  **KI SSR が entries を表示で読むときに初めて必要**。
- **推奨: F4d では included_files を変更しない。F5（表示接続）PR で `src/data/entries/**` を追加する**。
- **本節（F4d docs）に「F5 で `src/data/entries/**` 追加が必須」と明記**し、F5 での入れ忘れ事故を防ぐ。
- AK は `netlify.toml` に included_files を持たない（Function bundle 同梱方式でない）＝ **AK 側に included_files 変更は不要**。

### 31.6 F4d PR 分割
- **F4d-1**（本 PR・docs-only）: event_type / payload / workflow / included_files / PR分割 の方針固定。
- **F4d-2**: AK に entries import workflow を追加（workflow_dispatch 先行可・dispatch 送信はしない）。
- **F4d-3**: KI に entries import workflow を追加（included_files はまだ変更しない）。
- **F4d-4**: admin に entries dispatch script を追加（既定 dry-run・二段 opt-in・実送信しない）。
- **F4d-5**: 明示許可後に `entries-nankan-updated` を **1回だけ**送信し AK/KI import を確認。
- **F5**: 表示分岐。KI included_files に `src/data/entries/**` を追加するのはここで実施。

### 31.7 F4d の安全ガード
- workflow_dispatch inputs は **date / venues 必須**（無ければ失敗）。
- full venue 判定（`totalRaces>1` / `totalRaces===races.length` / R01-only skip）は
  **`importEntriesNankan.js` の guard に委譲**（workflow で重複実装しない）。
- workflow の **`git add` 対象を entries/nankan のみに限定**。
- dispatch payload は **単一 date / venues を基本**（updates 配列・複数日一括なし）。
- repository_dispatch は **workflow 準備後**に、別 script から **opt-in（二段確認）で送信**。

### 31.8 本 PR（PR-F4d-1）でやらないこと（触らない領域）
- workflow 追加 / dispatch 送信 / dispatch script 実装 / included_files 変更 / 表示分岐（F5）。
- UI/CSS・featureScores・AI指数・印・買い目・穴馬・dark-horse.mjs・predictions。
- 既存 import script（horseHistories / recentHorseHistories）・既存 workflow。
- save-entries.mjs・entries-manager.astro・scripts/nankan/dry-run-aggregate-entries.mjs。
- AK・KI・shared repo 変更なし。

### 31.9 F4d-5 手動 dispatch 実施結果（2026-06-11・end-to-end 成立）
F4d-1〜F4d-4 で配線（admin docs §31 / AK workflow #70 / KI workflow #34 / admin dispatch script #108）が
揃ったのを受け、**`entries-nankan-updated` を 1 回だけ手動 dispatch** し AK/KI import 経路を実地確認した。

- **対象**: date=2026-06-10 / venues=OOI / shared `nankan/entries/2026/06/2026-06-10-OOI.json`。
- **dispatch script**: `scripts/dispatch-entries-nankan.mjs`（event_type=`entries-nankan-updated`）。
  - payload = `{date:"2026-06-10", venues:["OOI"], category:"nankan", kind:"entries", source:"nankan-entries"}`。
  - dry-run 事前確認: shared GET=200 / token OK / 送信なし / PASS。
  - 実 dispatch（**1 回のみ**・実送信はマコさん端末で `--dispatch --confirm-dispatch=entries-nankan-updated`）:
    apol0510/keiba-intelligence status=204 / apol0510/analytics-keiba status=204（**2/2 repo success**）。
- **AK workflow 結果**: `Import Entries Nankan (Dispatch)` /
  run https://github.com/apol0510/analytics-keiba/actions/runs/27354115021 /
  event=repository_dispatch（title=entries-nankan-updated）/ completed・**success** /
  import 2026-06-10 OOI（races=12 / horses=156 → `astro-site/src/data/entries/nankan/2026/06/2026-06-10-OOI.json`）/
  **commit 発生なし（No changes detected・entries already up-to-date）**。
- **KI workflow 結果**: `Import Entries Nankan (Dispatch)` /
  run https://github.com/apol0510/keiba-intelligence/actions/runs/27354116393 /
  event=repository_dispatch（title=entries-nankan-updated）/ completed・**success** /
  import 2026-06-10 OOI（races=12 / horses=156 → 同 path）/ **commit 発生なし（No changes detected）**。
- **最終状態**: admin / AK / KI とも local==origin/main・clean。shared は本作業で変更なし。
- **結論**: admin dispatch → AK/KI `repository_dispatch` workflow → `import:entries:nankan` → **no-changes 正常終了**まで
  **end-to-end 成立**。取り込んだ JSON が既存 main と同一のため**重複 commit が出ない**ことも確認。
  F4d は実行経路として成立した。**次は F5 表示接続準備**（KI `netlify.toml` included_files へ `src/data/entries/**` 追加 + record null を通算/条件別に出さない条件付き表示・§30.6 / §30.7）。

---

## 32. entries 表示接続契約（PR-F5a・docs-only）(2026-06-12)

F4d で shared→AK/KI entries import の自動配線が成立した（§31.9）。F5 は entries を AK/KI の**表示**に接続する系列。
本節（F5a）は **docs-only**（表示接続契約・mapper 仕様・record null ルール・PR分割を固定。実装・included_files 変更・表示接続を含まない）。

前提（実績）: AK `8cddbfc` / KI `fec74f9` に `astro-site/src/data/entries/nankan/2026/06/2026-06-10-OOI.json`
（totalRaces=12・horses=156・record 全 null・recentRaces あり・AK/KI byte 一致）取込済。

### 32.1 F5 初期方針（位置づけ＝馬詳細専用）
- entries `recentRaces` は **「馬詳細」専用データ**として扱う（馬名クリック / 詳細展開 / 詳細モーダル等の馬詳細領域で表示）。
- **既存 recentHorseHistories の全馬 fallback には初期段階では使わない**（既存の南関近走表示・予想カードは現行維持）。
- entries が**存在する馬のみ**表示。entries が無い場合は**現行表示を維持**。
- 採用理由: 既存南関近走表示を壊さない / entries を recentHorseHistories・horseHistories と同等扱いしない / record null による「0戦」誤表示回避 / 初回 F5 の影響範囲を小さくする / AK・KI で説明の食い違いを避ける。

### 32.2 データ由来ラベル
- 表示ラベルは **「出馬表由来の近走」** など、由来が誤解されない文言にする。
- **「全履歴」「JRA同等」「完全な過去走」等の表現は禁止**。
- recentHorseHistories / horseHistories と**同等扱いしない**（別系統と明示）。

### 32.3 record null ルール
- `record=null` は**正常値**。
- 通算 / 条件別成績は **表示しない**。
- **「0戦」「成績なし」「全履歴取得済み」「JRA同等」表示禁止**（§23.4 / §28.5 / §30.6）。
- record を **0 埋めしない**。
- record を持つ将来データだけ、**別契約で表示検討**（本契約の対象外）。

### 32.4 表示対象
- `recentRaces` を **最大5走**表示。
- **`raceNumber` + `horseNumber` を主キー**に突合。`horse name` は補助照合。
- entries JSON が **full venue の場合のみ使用**。
- **partial / R01-only / totalRaces=1 は表示に使わない**。
- `sourceMeta.races.length` と `races.length` が**一致しない場合は skip**。

### 32.5 mapper 方針
- entries `recentRaces` は既存表示 shape と異なるため **mapper を用意**する。
  - `finish` → `rank`
  - `weight` → `carriedWeight`
  - entries horse `number` → `horseNumber`
  - `surface` は race レベルから補完
  - **`record` は mapper 対象外**（触らない）。
- mapper は **recentRaces のみ**を扱い、featureScores / AI / 印 / 買い目 に接続しない。

### 32.6 AK/KI 方針
- AK/KI で **同じデータ契約・同じ由来ラベル**を使う。
- ただし**既存の表示レイアウト差は維持**する（AK=details 形式 / KI=dhc- 形式・free/premium 差）。
- **AK は SSG（prerender=true）のため included_files 不要**。
- **KI は SSR（prerender=false）のため、実表示で entries を読む前に `astro-site/netlify.toml` の included_files に `src/data/entries/**` を追加**する（F5b）。

### 32.7 PR 分割（F5 系列）
- **F5a**（本 PR・docs-only）: 表示接続契約固定。
- **F5b**: KI `netlify.toml` included_files に `src/data/entries/**` 追加のみ（表示接続なし）。AK は不要。
- **F5c**: AK mapper/loader 追加（ページ接続なし・dry-run/単体確認のみ）。
- **F5d**: KI mapper/loader 追加（ページ接続なし）。
- **F5e**: AK 馬詳細表示へ接続。
- **F5f**: KI 馬詳細表示へ接続。
- **F5g**: 本番確認・docs 記録。

### 32.8 本 PR（PR-F5a）でやらないこと（禁止事項）
- **initial F5 では recentHorseHistories の fallback にしない**。
- **AI指数 / 印 / 買い目 / 穴馬 に接続しない**。**predictions / featureScores に接続しない**。
- **JRA 表示に影響させない**。**既存 recentHorseHistories 表示を壊さない**。
- **record null を 0戦扱いしない**。**full venue 以外を表示に使わない**。
- 実装 / mapper・loader 作成 / page 接続 / included_files 変更 / AK・KI 変更 / UI・CSS / dispatch / workflow 実行 / shared 保存 はしない（docs-only）。

---

## 33. entries 表示接続 完了記録（F5f-1 / F5f-2 / F5g）(2026-06-12)

§32（F5a 表示接続契約）に基づく KI 側の表示接続が **F5f-1（注入）→ F5f-2（表示ブロック）→ F5g（確認・本記録）** で完了した。記録のみ・追加実装なし。

### 33.1 F5f-1 KI entries 注入配線
- **KI PR #37 merge 済み**。KI main HEAD: `4f1bb36`。
- **追加**: `astro-site/src/utils/injectEntriesRecentRacesNankan.js`。
- **変更**（呼び出し追加のみ）:
  - `astro-site/src/pages/prediction/nankan/index.astro`
  - `astro-site/src/pages/free-prediction/nankan/index.astro`
  - `astro-site/src/pages/free-prediction/nankan/[slug].astro`
- `data.predictions[].horses[]` を走査し、`raceNumber`＋`horseNumber`（horseName 補助）で entries の近走を突合。
- 結果を **別フィールド `horse.recentRacesFromEntriesNankan`** として注入。`horse.recentRaces` / `recentRacesFromHistoriesNankan` は **不変**。
- `getDisplayRecentRacesForNankan` は **不変**・fallback 化しない。
- 既存 `injectRecentHorseHistoriesNankanIntoData(...)` の直後に **独立 try/catch**（失敗は非致命）。
- この時点では表示 component 未接続の **inert 状態**で完了。

### 33.2 F5f-2 KI 馬詳細表示ブロック追加
- **KI PR #38 merge 済み**。KI main HEAD: `06d8d86`。
- **新規**: `astro-site/src/components/RecentRacesFromEntriesNankan.astro`（AK F5e-2 と同契約・同文言・同非表示方針）。
- **変更**（呼び出し追加のみ）:
  - `astro-site/src/pages/prediction/nankan/index.astro`
  - `astro-site/src/pages/free-prediction/nankan/index.astro`
  - `astro-site/src/pages/free-prediction/nankan/[slug].astro`
- summary = **「出馬表由来の近走（参考）」**。**最大5走**（`slice(0, 5)`）。
- `horse.recentRacesFromEntriesNankan` が **空/未定義なら何も出さない**（`entries.length > 0` ガード）。
- **CSS 追加ゼロ（C-1 方針）**。`<style>` ブロックなし・既存 recent-races 系 class を流用。
- **premium / free index** は既存「直近走」ブロック直後に **別ブロック**として素呼び出し（div/card 文脈）。
- **free slug は table 構造のため `<tr><td colspan="5">` でラップ**し、`recentRacesFromEntriesNankan.length > 0` の **空行防止 gate** を追加（tbody 直下に bare component を置かない）。
- **record / opponentName / postPosition は表示しない**（mapper 出力に無い・描画 JSX も非参照）。
- 既存「直近走」「過去N走」表示は **不変**。`getDisplayRecentRacesForNankan` 不変・fallback 化なし。
- featureScores / 予測スコア / 評価記号 / 推奨系ロジック / dark-horse.mjs **非接続**。

### 33.3 F5g read-only 確認
- KI main **clean**・HEAD = origin/main = `06d8d86`。
- `npm run build` **exit 0**。
- **禁止差分なし**: inject / loader / mapper / `getDisplayRecentRacesForNankan.js` / `src/data/**` / `package.json` / `netlify.toml` / `.github/workflows/**` いずれも F5f-2 で未変更。
- **禁止語なし**（追加行・描画 JSX とも）。
- **slug アーカイブ `2026-06-10-ooi` の build HTML（`dist/free-prediction/nankan/2026-06-10-ooi/index.html`）で summary「出馬表由来の近走（参考）」が出現し、近走行（会場「大井」等）が描画されること＝表示成立を確認**。
- **premium / free index（SSR・最新日表示）は、最新南関予想が `2026-06-12` に対し entries が `2026-06-10-OOI` のみのため、ブロック非表示が正常**（data fallback）。
- 今後、**最新予想日と同一日付の entries が shared 経由で取り込まれた会場**では index 側でも表示される。

### 33.4 AK/KI 対称関係
- **AK F5e**: `src/lib` 側に loader/mapper/inject（PR #71 / #72 / #73）。AK は SSG（prerender=true）のため included_files 不要。
- **KI F5f**: `src/utils` 側に loader/mapper/inject（PR #36 / #37 / #38）。KI は SSR のため `netlify.toml` の `included_files` に `src/data/entries/**` を追加済み（F5b）。
- **両方とも entries の `recentRaces` は「馬詳細」専用**。**既存 recentHorseHistories の全馬 fallback には使わない**。
- 表示ラベルは両 repo とも **「出馬表由来の近走（参考）」**。描画 component は同契約・同文言（レイアウト差＝AK/KI の既存 class 体系差は維持）。

### 33.5 残タスク・次段階
- 当日 entries（最新予想日と同一日付）の shared 取込が整えば、premium / free index でも本番表示確認が可能。
- shared→AK/KI への dispatch / workflow / import 配線（`entries-nankan-updated`・§31）は **別タスク**。実 dispatch は専用 token がマコさん端末前提のため、**実送信はマコさん手動**。
- **F5 系列としては AK/KI の表示接続まで完了**。次は当日 entries 運用、または本記録に基づく本番表示の継続確認。

### 33.6 本記録でやらないこと（docs-only）
- 実装ファイル変更 / mapper・loader・inject・component の改修 / page 接続変更 / included_files 変更 / AK・KI・shared 変更 / UI・CSS / dispatch・workflow・import 実行 / shared 保存 はしない。
- 予測スコア・評価記号・推奨系ロジック・featureScores・dark-horse.mjs・JRA 表示・既存 recentHorseHistories 表示 には触れない。

### 33.7 2026-06-12-OOI 実地表示確認（当日 entries 一気通貫）(2026-06-12)

最新予想日と同一日付の当日 entries（`2026-06-12-OOI`）で、**shared 保存 → AK/KI import → 表示確認**まで一気通貫で完走した。§33.5 で別タスクとしていた「当日 entries の shared 取込」と「premium/free index 本番表示確認」の実地成立記録。

#### 1. shared 保存
- path: `nankan/entries/2026/06/2026-06-12-OOI.json`（新規 create）。
- **full venue**: `totalRaces=12` / `races.length=12` / `sourceMeta.races=12` / **horses=144** / 各 race `recentRacesCoverage=100%` / schema OK（error 0）。
- `sourcePageType=uma_shosai`。**record は optional・0埋めしない**（warning は record 未取得 optional のみ）。
- 取得・保存は `scripts/nankan/dry-run-aggregate-entries.mjs`（`--program-url`→dry-run→`--push`→`--push --execute`）。program URL は当日 program 一覧から確定（`20260612200405`）。shared PUT は env token 401 のため gh auth fallback で status 201。

#### 2. AK/KI import
- `entries-nankan-updated` dispatch を **1 回だけ**実行。payload = `date=2026-06-12` / `venues=["OOI"]`。
- dispatch: analytics-keiba **status=204** / keiba-intelligence **status=204**（実送信はマコさん端末 token）。
- workflow: AK・KI とも `import-entries-nankan-on-dispatch` が event=repository_dispatch で **success**。
- AK HEAD=`cd5d267` / KI HEAD=`59b1e14`。両 repo に `astro-site/src/data/entries/nankan/2026/06/2026-06-12-OOI.json`（618019 bytes・date=2026-06-12/venueCode=OOI/totalRaces=12/races=12/horses=144）が **create** 済み。

#### 3. AK 表示確認（SSG・生成 HTML）
- `npm run build` **exit 0**。
- `premium-prediction/nankan` 生成 HTML：summary **「出馬表由来の近走（参考）」112 件**。
- `free-prediction/nankan` 生成 HTML：summary **「出馬表由来の近走（参考）」144 件**（＝総頭数）。
- 既存近走（過去N走）表示は残存。entries 行 class は `recent-race-venue/distance/rank/meta` のみで **record / opponentName / postPosition は表示されない**。entries 無し馬は `entries.length>0` gate により**空表示なし**。

#### 4. KI 表示確認（SSR）
- `npm run build` **exit 0**。
- free slug `2026-06-12-ooi`（prerender=true）：summary **「出馬表由来の近走（参考）」60 件**。
- SSR index（premium `prediction/nankan/index.astro` / free `free-prediction/nankan/index.astro`・prerender=false で静的 HTML 無し）：`injectEntriesRecentRacesNankanIntoData` を `2026-06-12-ooi` prediction に対し実行し、**145 頭中 144 頭に `recentRacesFromEntriesNankan` 注入成立**（runtime 表示成立を実証）。
- 1 頭未マッチは entries 未マッチ扱いで、ブロック非表示により**正常**。注入フィールドに record / opponentName / postPosition は含まれない。既存近走表示は残存。

#### 5. 非破壊確認
- 既存「直近走 / 過去N走」表示は不変。`getDisplayRecentRacesForNankan` 不変。
- entries `recentRaces` は **馬詳細専用**。`recentHorseHistories` の全馬 fallback には使わない。
- 予測スコア・評価記号・推奨系ロジックには接続しない。
- 本記録 PR では dispatch / workflow / import を再実行しない（docs-only）。

#### 6. 表表示は一時停止（実画面確認の結果）(2026-06-12)

上記 #1〜#4 のとおり **表示接続・import・inject・実地描画は成立確認済み**だが、実画面（AK free 等）での確認の結果、**ユーザー向けの表表示は一時停止**することにした。データ資産・注入経路・component は温存し、再設計後に戻せる状態を維持する。

**一時停止の理由**
- 既存「過去N走 / 直近走」と内容が重複して見える（venue / 距離 / 着順 / タイム / 上がり / 馬体重が重なる）。
- 「出馬表由来」「参考」は内部データ由来の説明であり、予想サービスのユーザー向け UI 文言として弱い。
- 中央版の過去走詳細表示と比べ、見た目・整理度・情報設計が不足。
- C-1（CSS 追加ゼロ）方針のため羅列に近く視認性が低い。
- → 表示品質の再設計が必要。

**一時停止 PR（component 呼び出しのみ除去・データ温存）**
- **AK PR #74 merge 済み**（main HEAD `cff1a49`）。対象 = `astro-site/src/pages/premium-prediction/nankan.astro` / `astro-site/src/pages/free-prediction/nankan.astro`。
- **KI PR #39 merge 済み**（main HEAD `4fa9d33`）。対象 = `astro-site/src/pages/prediction/nankan/index.astro` / `astro-site/src/pages/free-prediction/nankan/index.astro` / `astro-site/src/pages/free-prediction/nankan/[slug].astro`（slug は `<tr><td colspan="5">` wrapper ごと除去し空行を残さない）。
- いずれも **component 呼び出し（と import）だけ除去**。`RecentRacesFromEntriesNankan.astro` 本体 / inject / loader / mapper / `src/data/entries/**` / import workflow / dispatch 経路は**温存**。
- **再設計後は page の呼び出しを戻すだけで再表示可能**。

**現在の正本状態**
- entries data は shared / AK / KI に**残す**（削除しない）。import 経路・inject も**残す**。
- **ユーザー向けの表表示のみ一時停止**。既存「過去N走 / 直近走」は維持。
- 次フェーズで南関過去走表示の**再設計**（既存表示への統合 or 整形＋文言見直し）を検討。`getDisplayRecentRacesForNankan` の優先順位変更・fallback 化は別フェーズの契約変更として扱う。

---

## 34. 南関馬詳細パネル 再設計方針（R1a：表示項目棚卸し）(2026-06-12)

### 34.1 方針の転換
- これは「南関過去走表示」だけの再設計ではなく、**「南関馬詳細パネル」全体の再設計**として扱う。
- 近走だけを直すと、表示したい情報の多くを取りこぼす。
- 別ブロック追加ではなく、**馬詳細パネル内でプロフィール・当日出走情報・近走・（将来の）集計欄を整理**する。

### 34.2 現在の正本状態
- entries data / import / inject / component は**温存**。
- ユーザー向け entries 別ブロック表示は**一時停止中**（§33.7 #6・AK #74 `cff1a49` / KI #39 `4fa9d33`）。
- 既存「過去N走 / 直近走」は**維持**。
- `getDisplayRecentRacesForNankan` は**現時点で変更しない**。
- entries `recentRaces` を recentHorseHistories fallback には**使わない**。
- shared schema は**現時点で変更しない**。

### 34.3 調査対象
- shared entries：`nankan/entries/2026/06/2026-06-12-OOI.json` / `2026-06-10-OOI.json`。
- AK/KI import 済み entries：`astro-site/src/data/entries/nankan/2026/06/2026-06-12-OOI.json`（shared と一致）。
- racebook / computer / predictions（`horse.recentRaces`）。
- admin scripts：`scripts/nankan/dry-run-aggregate-entries.mjs` / `src/lib/nankan/entries-html-to-parsed.mjs` / `entries-schema-validator.mjs`。
- **専用 odds parser / uma_info プロフィール parser は現状なし**。

### 34.4 P0：現 entries だけで表示候補にできる項目（高充足）
**馬プロフィール**：馬番 / 馬名 / 性齢 / 毛色 / 父馬名 / 母父馬名
**当日出走情報**：騎手 / 騎手所属 / 負担重量 / 調教師 / 調教師所属
**近走1走ごと**：競走日 / 競馬場 / レース名 / 頭数 / 人気 / 着順 / タイム / 着差 / 騎手 / 負担重量 / 馬体重 / 上がり3F / コーナー通過順 / 1着馬または2着馬
- これらは entries で概ね高充足（近走の主要項目は実測 約96〜100%）。
- **別ブロックではなく、将来的には馬詳細パネル内の整理された表示**として扱う。

### 34.5 P1：条件付き表示候補
- 近走の距離 / 近走の馬場状態 / コース区分。
- 理由：現状では充足率が十分でない項目がある（距離・馬場は実測 約52%、コース区分はほぼ空）。
- 表示する場合は**「値がある時だけ表示」**。**空欄・不自然な補完・水増しはしない**。

### 34.6 P2：premium / 折りたたみ / 集計欄候補（将来・すぐ出さない）
- 距離別成績 / 場別成績 / 騎手別成績 / 騎手別勝利数 / 騎手別勝率 / 騎手別連対率 / 馬場状態別成績 / 出走間隔別成績 / 種牡馬分析 / 種牡馬勝率 / 種牡馬連対率 / 季節別成績 / 騎手コース別成績 / 回収率 / 連対時馬体重 / 持時計。
- 理由：
  - entries `recentRaces` 最大5走だけでは統計的に弱い。
  - 継続蓄積または別取得が必要。
  - 集計期間・最低サンプル数・欠損時の非表示ルールを別途定義する必要がある。
  - 回収率はオッズと結果が必要。

### 34.7 P3：現状保留項目
現時点で entries / racebook / predictions から品質よく取れない、または空が多い項目：
- 枠番 / 母馬名 / 生年月日 / 馬主名 / 生産牧場 / 当日馬体重 / 増減 / 単勝オッズ / 単勝人気 / 複勝オッズ / 複勝人気 / 上がり3F順位。
- 補足：
  - racebook に `predictedOdds` / `dam` などの field はあるが、現データでは null が多く表示品質に足りない（実測：predictedOdds 0/146、dam 0/146 非空）。
  - 実オッズは変動データであり、静的プロフィールとは分けるべき。
  - これらは将来 `oddsSnapshot` や別取得 schema として扱う（取得元の利用条件を確認しながら進める）。

### 34.8 オッズ方針
- 単勝 / 複勝 / 人気は**変動データ**。
- entries プロフィール / 馬詳細プロフィールに**混ぜない**。
- **表示用オッズと判定用オッズは分ける**。
- 将来は `oddsSnapshot`（時刻付き・別取得・別 schema）として扱う。
- **今回は取得・表示・判定接続をしない**。

### 34.9 表示設計案
- **A 馬プロフィール欄**：馬番 / 馬名 / 性齢 / 毛色 / 父 / 母父。
- **B 当日出走欄**：騎手 / 騎手所属 / 負担重量 / 調教師 / 調教師所属。
- **C 近走欄**：日付 / 競馬場 / レース名 / 頭数 / 人気 / 着順 / タイム / 着差 / 騎手 / 斤量 / 馬体重 / 上がり3F / 通過順 / 1着馬または2着馬。距離 / 馬場状態は**値がある場合のみ**。
- **D 集計成績欄**：今回は作らない（継続蓄積・別取得・最低サンプル数定義後の別フェーズ）。
- **E オッズ欄**：今回は作らない（`oddsSnapshot` フェーズで検討）。

### 34.10 データ構造案（今回は schema 変更しない）
- 現 entries JSON に近い候補（既存範囲で設計可能）：`horse.profile` / `horse.entryInfo` / `horse.recentRacesDetailed`。
- 新規 schema 候補（別フェーズ）：`horse.summaryStats` / `horse.oddsSnapshot` / `horse.compatibility` / `horse.breeding` / `horse.ownerBreeder`。
- 補足：P0/P1 は既存 entries の範囲で設計可能。P2/P3 は schema 追加や別取得の別フェーズ。

### 34.11 文言方針
- **使わない**：「出馬表由来」/「参考」/「中央版同等」/「詳細」。
- **使ってよい候補**：「近走」/「近走成績」/「直近5走」/「出走馬情報」/「馬プロフィール」/「当日出走情報」。
- 理由：条件別成績や履歴集計欄がない段階で「詳細」を使うと誇大に見える。取得元ではなく、ユーザーに見える価値ベースの文言にする。

### 34.12 契約変更が必要な範囲（別フェーズ）
以下はいずれも**別フェーズの契約変更が必要**：
- `getDisplayRecentRacesForNankan` の優先順位変更。
- entries `recentRaces` を recentHorseHistories fallback に使う。
- `horse.recentRaces` の置き換え。
- entries と recentHorseHistories の統合正本化。
- shared JSON schema 変更。
- `oddsSnapshot` 追加。
- 集計成績 schema 追加。
- free / premium の情報量差分拡大。
- AK / KI の表示差分拡大。

### 34.13 推奨フェーズ案
- **R1a**：表示項目棚卸し docs 固定（今回）。
- **R1b**：P0/P1 の画面設計案を docs 化。
- **R1c**：P0/P1 の共通 component 設計。
- **R1d**：AK preview 実装。
- **R1e**：KI 実装。
- **R1f**：本番表示確認。
- **R2**：集計成績の設計。
- **R3**：`oddsSnapshot` 設計。
- **R4**：血統・馬主・生産牧場など別取得設計。

### 34.14 非ゴール
- 今回は実装しない。
- 今回は entries 表示を再開しない。
- 今回は `getDisplayRecentRacesForNankan` を変更しない。
- 今回は fallback 化しない。
- 今回はオッズを扱わない。
- 今回は集計成績を作らない。
- 今回は shared schema を変更しない。
- 今回は予測スコア・評価記号・推奨系ロジックに接続しない。

### 34.15 R1b：P0/P1 画面設計案 (2026-06-12)

R1a（§34.4〜34.7）で棚卸しした **P0/P1 項目だけ**を使い、南関馬詳細パネルの**画面構成（どう見せるか）**を固定する。本節は「何を出すか」ではなく「どう配置するか」を決める。**P2/P3・オッズ・集計成績・血統/馬主/生産牧場は出さない**。

#### 34.15.1 R1b の目的
- P0/P1 項目だけで馬詳細パネルの画面構成を決める。
- 既存「過去N走 / 直近走」と**二重表示にならない設計**にする。
- 「出馬表由来」「参考」「詳細」「中央版同等」は使わない。

#### 34.15.2 基本構成（3ブロック）
**A. 馬プロフィール**
- 表示候補：馬番 / 馬名 / 性齢 / 毛色 / 父馬名 / 母父馬名。
- 方針：1〜2行でコンパクトに。母馬名 / 生年月日 / 馬主 / 生産牧場は保留のため出さない。枠番は取得不可のため出さない。

**B. 当日出走情報**
- 表示候補：騎手 / 騎手所属 / 負担重量 / 調教師 / 調教師所属。
- 方針：「騎手」「斤量」「調教師」を中心に。所属は括弧内などで補助表示。オッズ / 人気 / 当日馬体重 / 増減は出さない。予測スコア・評価記号・推奨系ロジックとは接続しない。

**C. 近走成績**
- 表示候補：競走日 / 競馬場 / レース名 / 頭数 / 人気 / 着順 / タイム / 着差 / 騎手 / 負担重量 / 馬体重 / 上がり3F / コーナー通過順 / 1着馬または2着馬 / 距離 / 馬場状態。
- 方針：最大5走を基本。距離 / 馬場状態は**値がある場合のみ**。空欄・不自然な補完・水増しはしない。1走の情報量が多いため**横長表ではなく「1走1カード」または「主要行＋補助行」を第一候補**。既存「過去N走 / 直近走」と重複する別ブロックを増やすのではなく、将来的には**既存表示を置き換える or 同じ場所で整理する前提**（ただし今回は実装しない）。

#### 34.15.3 UI 案比較
| 案 | 概要 | 見やすさ | モバイル耐性 | 既存UI整合 | 情報量 | free/premium差 | AK/KI共通化 | 後戻り |
|---|---|---|---|---|---|---|---|---|
| **A 1走1カード** | 近走をカードで縦並び。主要行=日付/競馬場/距離/着順/人気、補助行=レース名/タイム/着差/上がり/通過順/騎手/斤量/馬体重/相手馬 | ◎ | ◎ | △ | ◎ | 付けやすい | ◎ | ○ |
| **B 主要行＋details 折りたたみ** | 初期は主要項目、詳細は開閉。free=主要のみ/premium=開閉詳細の余地 | ○ | ○ | ○ | ○ | 付けやすい | ◎ | ◎ |
| C コンパクト表 | 1行1走・列で項目。一覧性高いが横幅厳しく項目を絞らないと破綻 | ○（一覧） | △ | △ | ○ | 列数で差 | ○ | ○ |
| D 既存行を少し拡張 | 既存UI連続性高・実装リスク低。ただしP0を多く出すには窮屈・改善限定的 | △ | ○ | ◎ | △ | △ | ◎ | ◎ |

#### 34.15.4 推奨 UI 案
**第一候補＝案A（1走1カード）または案B（主要行＋details 折りたたみ）**。
判断基準：P0 項目を無理なく出せる／横幅で破綻しない／二重表示問題を再発させない／中央版同等とは言わず南関用として自然／AK/KI で共通 component 化しやすい。
- モバイル比率が高く情報量も多いため、**まず案A を基本**にしつつ、画面の長さを抑えたい場合は**案B の折りたたみ**を併用する設計余地を残す（R1c で確定）。

#### 34.15.5 free / premium の扱い
- 初期は free / premium で**同じ表示**にする。
- premium 限定差分は R2/R3 以降の集計・オッズ・相性系まで保留。
- R1b〜R1e では P0/P1 の基本表示を **AK/KI 共通で揃える**。
- 理由：ここでプラン差分を増やすと設計が複雑化。まず表示品質と安定性を優先。P0/P1 は基本情報であり差分化より見やすさ改善を優先。

#### 34.15.6 AK / KI の扱い
- AK/KI で**表示データ契約は共通**にする。UI 差は最小限。
- 可能なら**共通 component の設計を前提**にする。
- repo が別なので実装は **AK preview → KI 実装**の順。
- **KI slug は table 構造**のため、カード形式にする場合は wrapper 設計に注意する（`<tr><td>` 内に収める or 行構造の見直しは R1c で検討）。

#### 34.15.7 文言案
- 使ってよい：馬プロフィール / 当日出走情報 / 近走成績 / 直近5走 / 近走。
- 使わない：出馬表由来 / 参考 / 詳細 / 中央版同等。
- 推奨：パネル全体＝「馬詳細」（ページ/パネル名としてのみ可）／プロフィール欄＝「馬プロフィール」／当日欄＝「当日出走情報」／近走欄＝「近走成績」または「直近5走」。
- 「詳細」は個別データ項目には乱用しない。

#### 34.15.8 欠損時の表示ルール
- 値がない項目は出さない。
- 空欄ラベルだけを出さない。
- 0埋めしない。
- 「取得なし」「不明」などの弱い表示は原則出さない。
- 近走がない馬は既存表示と同じく非表示または現行維持。
- entries が無い日・会場では現行表示を維持する。
- P1 項目（距離 / 馬場状態 / コース区分）は値がある場合だけ表示。

#### 34.15.9 実装に進む場合のフェーズ
- **R1b**：画面設計 docs 固定（今回）。
- **R1c**：共通 component 仕様 docs。
- **R1d**：AK preview 実装。
- **R1e**：KI 実装。
- **R1f**：本番表示確認。
- **R1g**：docs 記録。

#### 34.15.10 非ゴール（R1b）
- 今回は実装しない。
- 今回は entries 表示を再開しない。
- 今回は `getDisplayRecentRacesForNankan` を変更しない。
- 今回は fallback 化しない。
- 今回は shared schema を変更しない。
- 今回はオッズを表示しない。
- 今回は集計成績を表示しない。
- 今回は血統・馬主・生産牧場の別取得をしない。
- 今回は予測スコア・評価記号・推奨系ロジックに接続しない。

### 34.16 R1c：共通 component 仕様案 (2026-06-12)

R1b（§34.15）で固定した画面設計を、AK/KI 共通 component として実装する前に**仕様を固定**する。本節では component の責務・props・表示項目・欠損処理・CSS 方針・AK/KI 差分吸収方針を docs 化する。**実装は R1d 以降**。entries 表示再開はまだしない。

#### 34.16.1 R1c の目的
- R1b の画面設計を共通 component 化する前に仕様固定する。
- 今回は責務・props・表示項目・欠損処理・CSS 方針・AK/KI 差分吸収を決める。
- 実装は R1d 以降。entries 表示再開はしない。

#### 34.16.2 component 名候補
- 候補：`NankanHorseDetailPanel.astro` / `NankanHorseProfilePanel.astro` / `NankanRecentRacesPanel.astro`。
- 推奨：パネル全体＝`NankanHorseDetailPanel.astro`。近走のみを分ける場合＝`NankanRecentRacesPanel.astro`。
- **R1d ではまず `NankanHorseDetailPanel` を基本**にし、内部で profile / entryInfo / recentRaces を分ける案を第一候補にする。
- 注意：既存 `RecentRacesFromEntriesNankan.astro` は**一時停止済みの旧 component**として扱い、R1c の正本 component にはしない。再利用する場合も名前・責務・文言を見直す。

#### 34.16.3 props 仕様案
- 必須候補：`horse` / `raceInfo` / `mode`。
- 任意候補：`maxRecentRaces` / `showProfile` / `showEntryInfo` / `showRecentRaces` / `compact` / `context`。
- 詳細：
  - `horse`：predictions 側 horse を基本。entries 注入済みなら `horse.recentRacesFromEntriesNankan` や entries 由来 profile/entryInfo を参照可能。
  - `raceInfo`：`raceNumber` / `raceName` / `venue` / `date` など、必要なら補助に使う。
  - `mode`：`free` / `premium` / `slug` / `preview`。
  - `maxRecentRaces`：初期値 5。
  - `showProfile` / `showEntryInfo` / `showRecentRaces`：欠損や画面別制御用。
  - `compact`：狭い画面や既存カード内で簡易表示する場合。
  - `context`：AK premium / AK free / KI prediction index / KI free index / KI slug。
- **初期実装では props を増やしすぎない**。R1d の AK preview では `horse` + `mode` + `maxRecentRaces` 程度から始める案を推奨。

#### 34.16.4 データ参照ルール
- 既存 `horse.recentRaces` / `getDisplayRecentRacesForNankan` の**正本順位は変更しない**。
- entries `recentRaces` は**直接 fallback 正本にはしない**。
- ただし horse に既に注入済みの entries 由来フィールドは、馬詳細パネル内の**補助表示候補**として扱う。
- shared schema は変更しない。
- P0/P1 表示用の参照方針：
  - **A 馬プロフィール**：entries 由来の name / number / gender / age / coat / sire / bms を使う候補。既存 horse 側に同等項目がある場合に既存値優先か entries 値優先かは **R1d 前に確認**。空なら出さない。
  - **B 当日出走情報**：entries 由来の jockey / jockeyAffiliation / weight / trainer / trainerAffiliation を使う候補。horse 側に既存値がある場合は競合しないように確認。空なら出さない。
  - **C 近走成績**：最大5走。entries `recentRaces` の P0 項目を使う候補。ただし既存「過去N走 / 直近走」と**二重表示しない**よう、R1d では既存表示の**置き換え候補**として扱う。既存表示と並列で再表示しない。

#### 34.16.5 表示構造仕様
- 構成：
  - `section.nankan-horse-detail-panel`
    - header / summary
    - `block.profile`
    - `block.entry-info`
    - `block.recent-races`
- **A 馬プロフィール block**（表示例）：馬番 + 馬名 ／ 性齢 / 毛色 ／ 父: xxx / 母父: xxx。
- **B 当日出走情報 block**（表示例）：騎手: xxx（所属）／ 斤量: xx.x ／ 調教師: xxx（所属）。
- **C 近走成績 block**（1走1カード案）：
  - 主要行：競走日 / 競馬場 / 距離 / 着順 / 人気。
  - 補助行：レース名 / 頭数 / タイム / 着差 / 上がり3F / コーナー通過順 / 騎手 / 斤量 / 馬体重 / 1着馬または2着馬。
  - 距離 / 馬場状態は**値がある時のみ**。情報がない span / label は出さない。

#### 34.16.6 details 折りたたみ方針
- 候補：全体を details / 近走だけ details / 1走ごとに details / details を使わずカード常時表示。
- 推奨：初期は「**近走ブロック全体を details**」か「**カード常時表示**」の二択を R1d preview で比較。
- 1走ごとの details は操作が多くなりすぎるため**初期非推奨**。
- free / premium 差分は初期では付けない。

#### 34.16.7 CSS / layout 方針
- 旧 entries component のような**素の羅列にしない**。
- **scoped CSS を component 内に持つ案を第一候補**にする。
- 既存 `recent-races-compact` の見た目と**競合しない class name** にする。
- **モバイル前提で縦並びを基本**。横長 table は初期非推奨。
- KI slug は table 内 wrapper の都合があるため、component を `<td colspan="...">` 内に置いても破綻しない layout にする。
- AK/KI で**同じ class name / 構造**を使えるようにする。
- 色や装飾は既存サイトトーンに寄せ、過度な強調は避ける。
- class name 候補：`nankan-horse-detail-panel` / `nankan-horse-profile` / `nankan-entry-info` / `nankan-recent-races` / `nankan-recent-card` / `nankan-recent-main` / `nankan-recent-meta` / `nankan-field` / `nankan-field-label` / `nankan-field-value`。

#### 34.16.8 欠損時ルール
- 値が null / undefined / 空文字なら表示しない。
- 空ラベルだけ出さない。0埋めしない。
- 「取得なし」「不明」は原則表示しない。
- `recentRaces` が空なら近走 block 自体を出さない。
- profile / entryInfo も全項目が空なら block ごと出さない。
- entries がない日・会場では現行表示を維持。
- P1 項目（距離 / 馬場状態 / コース区分）は値がある場合のみ表示。
- 表示件数は `maxRecentRaces` で制御し、初期値は 5。

#### 34.16.9 AK / KI 実装差分吸収
- AK は SSG、KI は一部 SSR。
- KI slug は table 構造。
- AK/KI repo が別なので component ファイルはそれぞれに置くが、**仕様と class 名は揃える**。
- 実装順は **AK preview → KI**。AK preview で表示確認後、KI へ同仕様を移植。
- KI slug では**空 `<tr>` を残さない**。
- AK/KI の UI 差は最小化する。

#### 34.16.10 free / premium 方針
- 初期は同じ表示。
- premium だけ項目追加はしない。
- premium 差分は R2/R3 の集計・オッズ・相性系まで保留。
- ここでプラン差分を増やさない。

#### 34.16.11 既存表示との関係
- 既存「過去N走 / 直近走」と**並列表示しない**。
- R1d preview では、既存近走 block を**置き換える形**か、限定 preview route / feature flag 的に確認する形を検討。
- 本番で**二重表示を再発させない**。
- `getDisplayRecentRacesForNankan` の優先順位は変更しない。
- entries `recentRaces` を全馬 fallback には使わない。

#### 34.16.12 非ゴール（R1c）
- 今回は実装しない。
- 今回は component ファイルを作らない。
- 今回は entries 表示を再開しない。
- 今回は `getDisplayRecentRacesForNankan` を変更しない。
- 今回は fallback 化しない。
- 今回は shared schema を変更しない。
- 今回はオッズを表示しない。
- 今回は集計成績を表示しない。
- 今回は featureScores / 予測スコア / 評価記号 / 推奨系ロジックに接続しない。

#### 34.16.13 R1d への引き継ぎ条件
- R1c docs merge 済み。
- component props / class / 欠損時ルール / 既存表示との関係が固定済み。
- AK preview でどのページに試すかを決める。
- 二重表示しない preview 方法を決める。
- build / HTML 確認 / 禁止語 grep の確認手順を決める。

### 34.17 R1d：AK preview 実装方針（R1d-1 / R1d-2 分離）(2026-06-12)

R1a〜R1c で固定した方針を AK 側で preview 実装する前に、**実装範囲を固定**する。本節は docs-only（実装しない）。着手前 read-only 調査の前提：AK は `adaptLatestPrediction.js` 経由で `horse.recentRacesFromEntriesNankan` を既に注入済み（**recentRaces のみ**）。entries 固有 profile（毛色 / 母父 / 騎手所属 / 調教師所属）は horse に未注入。`getDisplayRecentRacesForNankan` は recentHorseHistories → `horse.recentRaces` の正本順位で entries とは別系統。

#### 34.17.1 R1d の目的
- R1a〜R1c の方針を AK で preview 実装する前に実装範囲を固定する。
- いきなり AK/KI/free/premium 全面展開しない。
- まず AK premium の一部で preview し、二重表示・CSS 崩れ・欠損表示を検証する。
- 実装前に **R1d-1 と R1d-2 を分離**する。

#### 34.17.2 R1d-1 と R1d-2 の分離
**R1d-1**
- AK premium の1カードだけで preview。
- 新 component `NankanHorseDetailPanel.astro` を作る。
- 既存「過去N走」block を、**entries がある時だけ**新 component に置き換える。
- entries がない時は既存「過去N走」block を**維持**する。
- `horse.recentRacesFromEntriesNankan` のみを使う。
- loader / inject / getDisplay / shared schema は触らない。
- **近走成績 block を主役**にする。
- profile / entryInfo は predictions horse に既にある最小項目だけ任意表示：馬番 / 馬名 / 性齢 / 父 / 騎手 / 斤量 / 調教師。
- 毛色 / 母父 / 騎手所属 / 調教師所属は R1d-1 では出さない。

**R1d-2**
- entries 固有 profile / entryInfo の注入拡張を検討する。
- 対象候補：毛色 / 母父 / 騎手所属 / 調教師所属。
- 候補ファイル：`astro-site/src/lib/loadEntriesNankan.js` / `astro-site/src/lib/injectEntriesRecentRacesNankan.js`。
- 別フィールド名候補：`horse.entryProfileFromEntriesNankan` / `horse.entryInfoFromEntriesNankan`。
- R1d-2 は R1d-1 preview 成功後に**別 PR / 別フェーズ**で扱う。
- R1d-2 でも `getDisplayRecentRacesForNankan` の正本順位は変更しない。
- entries `recentRaces` を recentHorseHistories fallback にしない。

#### 34.17.3 R1d-1 の対象ページ
- 推奨：`astro-site/src/pages/premium-prediction/nankan.astro`・**premium のみ**・まず1カード（できれば本命カード相当の1箇所のみ）。
- 理由：影響範囲が小さい／rollback しやすい／CSS・HTML・欠損表示を確認しやすい／free は露出が大きいため後回し／KI は slug wrapper など差分があるため R1e。

#### 34.17.4 置き換え方式
- 推奨：`horse.recentRacesFromEntriesNankan?.length > 0` の場合だけ `NankanHorseDetailPanel` を表示。entries がない場合は既存「過去N走」block を表示。
- 新 component と既存 block は**並列表示しない**。
- 明記：これは「**表示の置き換え preview**」。旧 entries component のような別ブロック追加ではない。**二重表示を再発させない**。「既存表示の下に preview 併置」案（旧 D 案）は**却下**。

#### 34.17.5 component props（R1d-1 最小）
- `horse` / `mode="premium"` / `maxRecentRaces={5}`。
- 現時点で不要：`raceInfo` / `showProfile` / `showEntryInfo` / `showRecentRaces` / `compact` / `context`。
- 理由：R1d-1 はまず近走成績 block の preview。props を増やしすぎない。`raceInfo` は recentRaces が自己完結のため不要。必要なら R1d-2 以降で追加。

#### 34.17.6 NankanHorseDetailPanel の R1d-1 表示範囲
- プロフィール最小：馬番 / 馬名 / 性齢 / 父。
- 当日出走情報の最小：騎手 / 斤量 / 調教師。
- 近走成績：最大5走。競走日 / 競馬場 / レース名 / 頭数 / 人気 / 着順 / タイム / 着差 / 騎手 / 斤量 / 馬体重 / 上がり3F / コーナー通過順 / 1着馬または2着馬。距離 / 馬場状態は値がある場合のみ。
- 出さない：毛色 / 母父 / 騎手所属 / 調教師所属 / 枠番 / 母馬名 / 生年月日 / 馬主 / 生産牧場 / 当日馬体重 / 増減 / オッズ / 集計成績 / 相性系 / 回収率。

#### 34.17.7 CSS / layout 方針（R1d-1）
- 新 component に scoped CSS を持たせる。旧 entries component のような素の羅列にしない。
- class name は R1c 方針に合わせる：`nankan-horse-detail-panel` / `nankan-horse-profile` / `nankan-entry-info` / `nankan-recent-races` / `nankan-recent-card` / `nankan-recent-main` / `nankan-recent-meta` / `nankan-field` / `nankan-field-label` / `nankan-field-value`。
- モバイル前提の縦並び。横長 table は使わない。1走1カードを基本。
- details は R1d-1 では使うなら近走 block 全体まで。1走ごとの details は初期非推奨。

#### 34.17.8 欠損時ルール（R1d-1）
- null / undefined / 空文字は出さない。
- 空ラベルだけ出さない。0埋めしない。
- 「取得なし」「不明」は出さない。
- recentRaces が空なら component を出さず既存 block に戻す。
- P1 項目（距離 / 馬場状態 / コース区分）は値がある場合のみ表示。
- entries がない日・会場では既存「過去N走」を維持する。

#### 34.17.9 R1d-1 の変更ファイル候補（今回は変更しない）
- 候補：`astro-site/src/components/NankanHorseDetailPanel.astro`（新規） / `astro-site/src/pages/premium-prediction/nankan.astro`。
- 触らない：`astro-site/src/lib/loadEntriesNankan.js` / `astro-site/src/lib/injectEntriesRecentRacesNankan.js` / `astro-site/src/lib/getDisplayRecentRacesForNankan.js` / shared data / workflows / netlify.toml / package.json。

#### 34.17.10 R1d-1 の確認手順案（実装時）
- build：`npm run build`。
- HTML 確認：
  - 生成 HTML に `nankan-horse-detail-panel` が出る。
  - 「出馬表由来」が出ない。「参考」が出ない。
  - 同一馬で既存「過去N走」と新 component が二重に出ない。
  - 値がない項目の空ラベルが出ない。
  - entries がある馬では新 component が出る。
  - entries がない馬では既存「過去N走」が維持される。
  - 禁止語 grep 0。
- 差分確認：新 component 1ファイル / premium nankan page 1ファイル / loader・inject・getDisplay・shared schema に差分なし。

#### 34.17.11 R1d-2 の確認手順案（R1d-2 着手前）
- R1d-1 preview が build / HTML / 見た目で成功。
- profile / entryInfo の必要性が高いと判断。
- entries horse object から必要項目を安全に取り出せる。
- 注入フィールド名を決める。
- 既存 horse フィールドと衝突しない。
- 欠損時は項目ごと非表示。
- getDisplay は変更しない。

#### 34.17.12 R1e への引き継ぎ
- R1d-1 が成功した場合：残り premium カードへ展開するか、free へ広げるかを判断。
- KI は R1e で扱う。KI slug は table wrapper / 空 `<tr>` 防止を別途設計。
- AK/KI class name と構造は揃える。

#### 34.17.13 非ゴール（R1d）
- 今回は実装しない。
- 今回は component ファイルを作らない。
- 今回は AK page を変更しない。
- 今回は loader / inject を変更しない。
- 今回は `getDisplayRecentRacesForNankan` を変更しない。
- 今回は fallback 化しない。
- 今回は entries 表示を再開しない。
- 今回は shared schema を変更しない。
- 今回はオッズを表示しない。
- 今回は集計成績を表示しない。
- 今回は profile / entryInfo 注入拡張を実装しない。
- 今回は featureScores / 予測スコア / 評価記号 / 推奨系ロジックに接続しない。

### 34.18 R1d-1：AK preview 実地評価と表示停止 (2026-06-12)

R1d-1 を AK で preview 実装したが、**本番目視で表示品質が不合格**だったため横展開せず表示を停止した。以降は「entries 近走5走を白いカードで出す」路線を採らず、**UI / 情報設計の再設計**を優先する。

#### 34.18.1 R1d-1 実装結果
- AK PR #75 / AK main `3f865d9`。
- `NankanHorseDetailPanel.astro` 新規作成。`premium-prediction/nankan.astro` の本命カード1箇所で preview。
- entries がある馬だけ新 component に置き換え、entries がない馬は既存「過去N走」維持（並列表示しない）。
- loader / inject / getDisplay / shared schema は不変。
- build / HTML 確認は通過（`nankan-horse-detail-panel` 36件・「近走成績」36件・二重表示なし・禁止語 0）。

#### 34.18.2 本番目視での不合格理由
- 既存のアコーディオン表示が消え、操作性が落ちた。
- CSS / デザインが AK の既存 dark / gradient / card トーンと合わず、白いメモ帳のように浮いた。
- 「馬詳細パネル」と呼ぶには情報設計が不足していた。
- 実体は「近走5走の整形表示」に近かった。
- 距離別の連対率 / 3着内率など、ユーザーが期待する条件別成績がなかった。
- 過去5走だけでは物足りない。
- このまま premium 残りカード / free / KI へ横展開しない。

#### 34.18.3 表示停止結果
- AK PR #76 / AK main `b877fd6`。
- `premium-prediction/nankan.astro` から `NankanHorseDetailPanel` import と呼び出しを削除。premium 本命カードは既存「過去N走」に復元。
- `NankanHorseDetailPanel.astro` は削除せず**未使用 inert として温存**。
- build / HTML 確認：`nankan-horse-detail-panel=0` / panel 由来の「近走成績」なし / 既存「過去N走」復活 / 「出馬表由来」「参考」なし。
- loader / inject / getDisplay / shared schema / free / KI は不変。

#### 34.18.4 再発防止
- 「entries 近走5走を白いカードで出す」だけでは採用しない。
- 既存アコーディオンの操作性を失わせない。
- AK の既存 dark card / gradient / premium UI トーンに合わせる。
- 新 component を既存表示と並列表示しない。
- 「馬詳細」と呼ぶ場合は、近走だけでなく条件別成績や適性情報の設計が必要。
- ただし条件別成績は別データ・集計設計が必要なため、R1d-2 とは別に再設計する。
- R1d-2（profile / entryInfo 注入拡張）だけを先に進めても、表示の物足りなさは解決しない。

#### 34.18.5 今後の方針
**A. UI 再設計**
- アコーディオン維持。
- AK dark / gradient / card トーンに合わせる。
- 白背景の独立カードは避ける。
- 近走はカード型にする場合でも既存デザインに馴染ませる。
- モバイルで長くなりすぎない構造にする。

**B. 情報設計再設計**
- 近走5走だけでは「馬詳細」として不足。
- 距離別の連対率 / 3着内率、場別成績、馬場状態別成績、出走間隔別成績、斤量変化、馬体重推移など、条件別・推移系の情報を別フェーズで検討する。

**C. データ面の再設計**
- entries `recentRaces` だけでは条件別成績を安定算出できない。
- results / racebook / entries の蓄積、または別取得・別集計が必要。
- 集計期間、最低サンプル数、非表示条件を定義する必要がある。
- オッズや回収率はさらに別フェーズ。

#### 34.18.6 次フェーズ案
- **R1d-redesign-docs**：R1d-1 失敗を踏まえた UI / 情報設計の再設計 docs。
- **R1d-design-mock**：アコーディオン維持版の表示案を docs 化。
- **R2-stats-design**：距離別 / 場別 / 馬場状態別 / 3着内率などの集計設計。
- **R1d-2**：profile / entryInfo 注入拡張。ただし**表示再設計が先**。R1d-2 単独では物足りなさを解決しない。

#### 34.18.7 非ゴール（34.18）
- 今回は実装しない。
- 今回は AK を変更しない。
- 今回は KI を変更しない。
- 今回は shared を変更しない。
- 今回は R1d-2 に進まない。
- 今回は R1d-1b 横展開しない。
- 今回は component を削除しない。
- 今回は loader / inject / getDisplay を変更しない。
- 今回は条件別成績を実装しない。
- 今回はオッズ / 回収率を扱わない。
- 今回は予測スコア・評価記号・推奨系ロジックに接続しない。

### 34.19 R1d-redesign-docs：馬詳細パネル再設計方針 (2026-06-12)

R1d-1（§34.18）の「entries 近走5走を白いカードで常時表示する」案は不採用。次の実装はその横展開ではなく、**UI / 情報設計の再設計**を固定してから進める。

#### 34.19.1 再設計の前提
- R1d-1 の「近走5走を白いカードで表示する」案は不採用。
- 次の実装は R1d-1 の横展開ではない。
- 既存アコーディオンの操作性を維持する。
- AK の既存 dark / gradient / premium card トーンに合わせる。
- 白背景の独立カードは避ける。
- 「馬詳細」と呼ぶなら、近走だけでなく条件別成績・適性・推移系を含む設計にする。

#### 34.19.2 UI 再設計方針
**A. アコーディオン維持**
- 既存「過去N走」の開閉体験を維持する。
- いきなり常時展開の巨大カードにしない。
- 初期表示はコンパクト。
- ユーザーが必要な時に開ける構造にする。

**B. AK トーン準拠**
- dark / navy / gradient / glass card 系の既存トーンに寄せる。
- 白背景のメモ帳型カードは禁止。
- premium ページの評価ポイント / 特徴量重要度と見た目の文脈を合わせる。
- 既存 UI から浮かないようにする。

**C. 近走の見せ方**
- 近走5走は「馬詳細」の一部として扱う。
- 近走だけを独立して大きく見せすぎない。
- 主要行と補助行に分ける。
- 距離 / 馬場 / 着順 / 人気 / タイム / 上がり / 通過順などは見やすく整理する。
- 横長 table は避ける。
- モバイルで縦に長くなりすぎない。

**D. 情報密度**
- すべてを一度に出さない。
- 初期表示は要約。
- 詳細はアコーディオン内または小セクションで表示。
- ラベルが多すぎる表示を避ける。
- 空ラベルは出さない。

#### 34.19.3 情報設計方針（4 層）
- **Layer 1: 馬プロフィール** — 馬番 / 馬名 / 性齢 / 父（将来候補：毛色 / 母父 / 所属系）。
- **Layer 2: 当日出走情報** — 騎手 / 斤量 / 調教師（将来候補：騎手所属 / 調教師所属 / 馬体重 / 増減）。
- **Layer 3: 近走成績** — 直近の走り / 距離 / 馬場 / 着順 / 人気 / タイム / 着差 / 上がり / 通過順 / 騎手 / 斤量 / 馬体重。
- **Layer 4: 条件別・推移系** — 距離別の連対率 / 距離別の3着内率 / 場別成績 / 馬場状態別成績 / 出走間隔別成績 / 斤量変化 / 馬体重推移 / 持時計（将来候補：騎手別 / 種牡馬 / 回収率）。
- 重要：
  - Layer 1〜3 は entries / predictions で一部実現可能。
  - Layer 4 は entries `recentRaces` だけでは不足。
  - Layer 4 は R2-stats-design で別設計する。

#### 34.19.4 次回 UI 案
- **案A：既存アコーディオン拡張型**（第一候補）
  - 既存「過去N走」アコーディオンを維持。
  - summary は「過去5走」または「近走成績」。
  - 中身を AK トーンに合わせて少し整理。
  - 最小改修で既存 UX を壊しにくい。
- **案B：馬詳細アコーディオン統合型**（第二候補）
  - 「馬詳細」アコーディオンを作り、その中にプロフィール / 当日情報 / 近走 / 条件別を入れる。
  - 将来的な拡張性が高い。
  - ただし初期実装が大きくなる。
- **案C：常時表示カード型**（初期非推奨）
  - R1d-1 のように常時表示する。
  - 目立つが、画面が長くなりやすい。
  - アコーディオン操作性を失いやすい。今回の失敗を踏まえ初期非推奨。
- 推奨：次回は案A を第一候補。条件別成績が設計できたら案B も再検討。案C は初期非推奨。

#### 34.19.5 条件別成績の扱い
- 距離別連対率 / 3着内率などはユーザー期待が高い。
- しかし entries `recentRaces` 最大5走だけでは安定算出できない。
- results / racebook / entries の蓄積、または別取得・別集計が必要。
- 集計期間を決める必要がある。
- 最低サンプル数を決める必要がある。
- サンプル不足時は非表示にする。
- 0埋めしない。
- R2-stats-design で別途設計する。

#### 34.19.6 R1d-2 との関係
- R1d-2 は毛色 / 母父 / 騎手所属 / 調教師所属などの profile / entryInfo 注入拡張。
- ただし R1d-2 だけを進めても「馬詳細として物足りない」問題は解決しない。
- 先に UI / 情報設計の再設計を固定する。
- R1d-2 は再設計後に、必要項目として取り込む。

#### 34.19.7 次フェーズ案（推奨順）
1. **R1d-design-mock**：既存アコーディオン拡張型の表示案を docs 化。
2. **R2-stats-design**：条件別成績の集計設計。
3. **R1d-2**：profile / entryInfo 注入拡張。
4. **R1d-impl-v2**：再設計後の AK preview 実装。

#### 34.19.8 非ゴール（34.19）
- 今回は実装しない。
- 今回は AK を変更しない。
- 今回は KI を変更しない。
- 今回は shared を変更しない。
- 今回は component を変更しない。
- 今回は R1d-2 に進まない。
- 今回は R2 実装に進まない。
- 今回は条件別成績を実装しない。
- 今回はオッズ / 回収率を扱わない。
- 今回は予測スコア・評価記号・推奨系ロジックに接続しない。

### 34.20 R1d-design-mock：既存アコーディオン拡張型の表示案 (2026-06-12)

§34.19 で第一候補とした「既存アコーディオン拡張型」の**具体的な表示案**を固定する。既存「過去N走」の開閉体験を維持しつつ、中身を AK の dark / gradient / premium card トーンに合わせて整理する。**コーナー通過順と上がり3F は近走評価に有用なため優先表示候補**として残す。

#### 34.20.1 表示案の基本方針
- 第一候補は「既存アコーディオン拡張型」。
- 既存「過去N走」の開閉体験を維持する。summary は「過去5走」または「近走成績」。
- 常時表示カード型には戻さない。白背景の独立カードは禁止。
- AK dark / navy / gradient / premium card トーンに合わせる。
- 新 component と既存 block を並列表示しない。
- まずは premium の既存過去走 block 内部の整理案として考える。

#### 34.20.2 summary 表示案
- 候補：`過去5走` / `近走成績` / `近走5走`。
- 推奨：現行 UX 維持を優先するなら `過去5走`。馬詳細寄りにするなら `近走成績`。**初回実装では現行との連続性を重視して `過去5走` を第一候補**。
- summary に詰め込みすぎない：距離別連対率などは summary に入れない。条件別成績は R2 設計後に別枠で検討。

#### 34.20.3 アコーディオン内部の構成案（3 段）
- **A. 近走要約行**（任意・初期は省略可）
  - 直近5走の着順・人気・距離・馬場を短く並べる。例：`4着(3人気) 大井1600稍重`。
  - モバイルで横に長くしすぎない。
- **B. 1走ごとの近走カード**（1走1カード）
  - R1d-1 のような白カードではなく、既存トーンに馴染む**濃色カード**にする。
  - 主要行：日付 / 競馬場 / 距離 / 馬場 / 着順 / 人気。
  - 補助行：レース名 / タイム / 着差 / 上がり3F / コーナー通過順 / 騎手 / 斤量 / 馬体重。
  - 重要：
    - コーナー通過順は脚質・位置取りが分かるため優先表示。
    - 上がり3F は終いの脚・伸び脚が分かるため優先表示。
    - 上がり3F とコーナー通過順は**セットで見られるように近い位置に置く**。
    - 上がり3F 順位は現状弱いため、取れるまでは表示対象にしない。
- **C. 将来拡張枠**（枠だけ・実装/算出は R2-stats-design）
  - 条件別成績 / 距離別連対率 / 距離別3着内率 / 場別成績 / 馬場状態別成績 / 馬体重推移。

#### 34.20.4 1走カードの具体的な並び案
- 推奨レイアウト：
  - 1行目：日付 / 競馬場 / 距離 / 馬場。
  - 2行目：着順 / 人気 / タイム / 着差。
  - 3行目：上がり3F / コーナー通過順。
  - 4行目：騎手 / 斤量 / 馬体重。
  - 5行目：レース名。
- 理由：1〜2行目で結果概要、3行目で脚質・伸び脚、4行目で条件差が分かる。レース名は長くなりやすいため下段。

#### 34.20.5 表示優先度
- **P0**：着順 / 人気 / 距離 / 馬場 / タイム / 着差 / 上がり3F / コーナー通過順。
- **P1**：騎手 / 斤量 / 馬体重 / レース名 / 頭数。
- **P2**：相手馬 / 開催名 / クラス名。
- **P3**：上がり3F 順位 / 枠番 / 当日馬体重増減 / 条件別成績 / オッズ / 回収率。
- 注記：P3 は今すぐ出さない。条件別成績は R2-stats-design で別設計。

#### 34.20.6 欠損時ルール
- null / undefined / 空文字は出さない。
- 空ラベルを出さない。0埋めしない。
- 「取得なし」「不明」は出さない。
- 上がり3F がない場合はその項目だけ非表示。
- コーナー通過順がない場合はその項目だけ非表示。
- 近走がない場合は既存表示を維持または block 非表示。
- entries がない日・会場では現行表示を維持。

#### 34.20.7 デザイン方針
- 既存 premium card の背景・枠線・余白・角丸に合わせる。
- 白背景は使わない。
- 文字色は既存の muted / accent 系に寄せる。
- ラベルは小さく、値を読みやすくする。
- 1走カード間に適度な余白を入れる。
- 過度な装飾は避ける。
- `recent-races-compact` と競合しない class を使う。

#### 34.20.8 AK / KI / free への展開方針
- 最初は AK premium の1箇所で preview。
- 見た目が合格してから premium 残りへ展開。
- free は露出が大きいため後回し。
- KI は slug / table wrapper の違いがあるためさらに後。
- AK/KI で class name と情報構造は揃える。

#### 34.20.9 R2-stats-design への引き継ぎ
- 距離別連対率 / 3着内率は期待値が高い。
- ただし近走5走だけでは安定しない。
- results / racebook / entries の蓄積、または別取得・別集計が必要。
- 集計期間・最低サンプル数・非表示条件を R2 で決める。
- R1d-design-mock では枠だけ決め、数値表示はしない。

#### 34.20.10 非ゴール（34.20）
- 今回は実装しない。
- 今回は AK を変更しない。
- 今回は KI を変更しない。
- 今回は shared を変更しない。
- 今回は component を変更しない。
- 今回は R1d-2 に進まない。
- 今回は R2 実装に進まない。
- 今回は条件別成績を実装しない。
- 今回は上がり3F 順位を実装しない。
- 今回はオッズ / 回収率を扱わない。
- 今回は予測スコア・評価記号・推奨系ロジックに接続しない。

### 34.21 R1d-impl-v2b：entries recentRaces の表示専用利用方針 (2026-06-12)

R1d-impl-v2（AK PR #77）で既存アコーディオン維持・dark/slate トーン・5行カード型・上がり3F 表示は成立したが、**コーナー通過順が 0 件**だった。read-only 確認で、当日 premium が参照する getDisplay 側の predictions recentRaces は通過順を含む多くの欄が欠損、一方 entries 由来は高充足と判明したため、**entries 由来 recentRaces を premium 近走アコーディオンの「表示専用ソース」として使う案B**を本節で固定する。

#### 34.21.1 問題整理
- PR #77 では既存アコーディオン維持・dark/slate トーン・5行カード型・上がり3F 表示は成立。
- ただし**コーナー通過順が表示されなかった**。
- 原因は getDisplay 側の predictions recentRaces に `passingOrder` が無いこと。
- predictions recentRaces は `date` / `trackCondition` / `popularity` / `margin` / `jockey` / 斤量 も欠けている（当日実測でいずれも 0%）。
- そのため PR #77 の5行表示のうち多くの欄が弱い。
- entries `recentRacesFromEntriesNankan` は `passingOrder` / `date` / `popularity` / `margin` / `jockey` / `carriedWeight` / `bodyWeight` / `raceName` / `last3f` などが高充足（当日実測で約 96〜100%、`passingOrder` は約 97%）。
- よって表示品質を上げるには entries 由来 recentRaces を使う必要がある。

#### 34.21.2 方針
- premium 近走アコーディオンの「**表示専用ソース**」として `horse.recentRacesFromEntriesNankan` を優先利用する。
- entries がある場合：`horse.recentRacesFromEntriesNankan` を表示に使う。
- entries がない場合：既存どおり `getDisplayRecentRacesForNankan(horse)` を使う。
- この切り替えは **premium page の表示だけ**で行う。
- `getDisplayRecentRacesForNankan` 関数自体は変更しない。
- loader / inject / shared schema は変更しない。
- entries `recentRaces` を recentHorseHistories fallback 正本にしない。
- entries を予測スコア・評価記号・推奨系ロジックに接続しない。
- free / KI には展開しない。
- まず AK premium 本命カード1箇所の preview に限定する。

#### 34.21.3 実装イメージ（実装時の考え方）
- 例：`displayRecentRaces = (Array.isArray(horse.recentRacesFromEntriesNankan) && horse.recentRacesFromEntriesNankan.length > 0) ? horse.recentRacesFromEntriesNankan : getDisplayRecentRacesForNankan(horse)`
- 片方だけを表示し、二重表示しない。
- `slice(0, 5)` は維持する。
- entries の並びは newest-first であることを実装時に再確認する。
- field shape は PR #77 の描画コードが両対応済み：`rank`/`finish` ・ `carriedWeight`/`weight` ・ `last3f`/`agari` ・ `passingOrder`/`cornerPassage` ・ `date`/`raceDate` ・ `venue`/`track`/`trackName`。

#### 34.21.4 案A/B/C 比較
- **案A：getDisplay 維持**
  - メリット：既存正本表示に近い。
  - デメリット：通過順・日付・人気・着差・騎手・斤量・馬場が欠け、5行レイアウトの価値が落ちる。
- **案B：entries 表示専用優先**（推奨）
  - メリット：通過順・日付・人気・着差・騎手・斤量などが揃い、5行レイアウトが活きる。
  - メリット：getDisplay 関数は変更しない。
  - メリット：premium page 1ファイルの小差分で実現できる。
  - デメリット：表示ソースが既存過去走から変わるため docs 明記が必要。
- **案C：passingOrder だけ entries 補完**（初期非推奨）
  - メリット：既存表示の並びを維持しやすい。
  - デメリット：走ごとの突合リスクが高い。
  - デメリット：`date` が getDisplay 側に無く安全な突合キーが作りにくい。
  - デメリット：人気・着差・騎手・斤量などは欠けたまま。

#### 34.21.5 安全条件
- entries がない日・会場では既存表示を維持する。
- 二重表示しない。
- getDisplay の正本順位を壊さない。
- shared schema を変えない。
- loader / inject を変えない。
- premium 1箇所 preview に限定。
- build / HTML で以下を確認する：
  - 既存 details / summary 維持。
  - 上がり3F 表示。
  - コーナー通過順 表示。
  - 日付 / 人気 / 着差 / 騎手 / 斤量 表示。
  - `nankan-horse-detail-panel` 不使用。
  - 「出馬表由来」「参考」非表示。
  - 禁止語 0。
  - free / KI 不変。

#### 34.21.6 PR #77 との関係
- PR #77 は R1d-impl-v2 の土台。
- PR #77 の描画コードは entries / predictions の両 shape に概ね対応済み。
- PR #77 をそのまま merge するか、案B を同 PR に追加修正するかは次判断。
- 推奨は、docs で案B を固定した後、PR #77 に最小修正を入れること。
- ただし merge は目視確認後。

#### 34.21.7 非ゴール（34.21）
- 今回は実装しない。
- 今回は AK を変更しない。
- 今回は KI を変更しない。
- 今回は shared を変更しない。
- 今回は PR #77 を修正しない。
- 今回は `getDisplayRecentRacesForNankan` を変更しない。
- 今回は loader / inject を変更しない。
- 今回は entries を fallback 正本化しない。
- 今回は R1d-2 に進まない。
- 今回は R2 実装に進まない。
- 今回は条件別成績を実装しない。
- 今回はオッズ / 回収率を扱わない。
- 今回は予測スコア・評価記号・推奨系ロジックに接続しない。

### 34.22 R1d-impl-v2：AK premium 本番目視確認結果 (2026-06-12)

R1d-impl-v2（+v2b）を AK PR #77 で merge し、本番目視で「問題なさそう」と確認できた記録。R1d-1 の白カード常時表示の失敗を経て、**既存「過去N走」アコーディオンを維持したまま内部を整理し、entries を表示専用ソースにする**ことで通過順・人気・着差・騎手・斤量まで表示できた。

#### 34.22.1 実装到達点
- AK PR #77 merge 済み・AK main `9e93c76`。
- premium 南関の**本命カード1箇所に限定**。
- 既存「過去N走」アコーディオンを維持。summary「過去N走」を維持。
- 常時表示カード型には戻していない。白背景カードではない。
- AK dark/slate トーンの5行カード型に整理。

#### 34.22.2 表示内容
- 上がり3F 表示 / コーナー通過順 表示 / 日付 表示 / 人気 表示 / 着差 表示 / 着順 表示 / 騎手 表示 / 斤量 表示 / 馬体重 表示 / レース名 表示。

#### 34.22.3 データソース方針
- entries がある場合は `horse.recentRacesFromEntriesNankan` を premium 近走アコーディオンの**表示専用ソース**として使う。
- entries がない場合は `getDisplayRecentRacesForNankan(horse)` を使う。
- `getDisplayRecentRacesForNankan` 関数自体は変更していない。
- loader / inject / shared schema は変更していない。
- entries `recentRaces` を recentHorseHistories fallback 正本にしていない。
- entries を予測スコア・評価記号・推奨系ロジックに接続していない。

#### 34.22.4 確認結果
- build / checks pass。
- HTML 確認で 上がり3F・コーナー通過順・日付・人気・着差・騎手・斤量 が表示されることを確認（実測：上がり3F 504件・コーナー通過順 169件・人気 169件・着差 167件・着順 464件・騎手 204件・斤量 249件・日付 117件）。
- `nankan-horse-detail-panel` は不使用。
- 「出馬表由来」「参考」は出していない。
- 禁止語 0。
- free / KI は未変更。
- ユーザー本番目視で「問題なさそう」と確認済み。

#### 34.22.5 今後の展開候補（次フェーズ・未着手）
- premium の連下 / 補欠カードへ展開。
- free への展開。
- KI への展開（slug の table wrapper / 空 `<tr>` 防止に注意）。
- R1d-2：毛色 / 母父 / 騎手所属 / 調教師所属などの profile / entryInfo 注入拡張。
- R2-stats-design：距離別連対率 / 3着内率など条件別成績の集計設計。

#### 34.22.6 非ゴール（34.22）
- 今回は実装しない。
- 今回は AK を変更しない。
- 今回は KI を変更しない。
- 今回は shared を変更しない。
- 今回は R1d-2 に進まない。
- 今回は R2 実装に進まない。
- 今回は premium 連下 / 補欠へ展開しない。
- 今回は free / KI へ展開しない。
- 今回は条件別成績を実装しない。
- 今回はオッズ / 回収率を扱わない。
- 今回は予測スコア・評価記号・推奨系ロジックに接続しない。

---

### 34.23 R1d-impl-v2c：AK premium 連下・補欠カード横展開前の表示密度方針 (2026-06-12)

#### 34.23.1 背景
- R1d-impl-v2（§34.22）では、AK premium 南関の**本命カード1箇所**で既存「過去N走」アコーディオン（details/summary）を維持したまま、entries 由来の近走情報を**表示専用ソース**として使う改善を行い、ユーザー本番目視で「問題なさそう」と確認済み。
- 次の展開候補は AK premium 南関の**連下 / 補欠カード**への横展開。
- ただし、連下 / 補欠は現在 compact 1行表示であり、本命カードの5行カードとは**表示密度が違う**ため、実装に入る前にここで方針を固定する。

#### 34.23.2 read-only 調査結果
- 連下 / 補欠は本命カードと**同じ `raceHorses` 由来の horse オブジェクト**を使う（本命だけ特別なデータ構造ではない）。
- `injectEntriesRecentRacesNankan.js` は `race.allHorses` と role 配列側（main/sub/hole/connect/reserve 等）の horse を走査するため、連下 / 補欠系の馬にも `recentRacesFromEntriesNankan` が付与され得る。
- したがって、entries 表示専用ソースの横展開は**構造上可能**。
- ただし、現在の連下 / 補欠は compact 1行表示（会場 / 距離 / 着順 / タイム / 上がり3F / 馬体重程度）であり、日付 / 人気 / 着差 / コーナー通過順などを本命カードと同じ密度では表示していない。

#### 34.23.3 表示密度方針
- 連下 / 補欠は、本命カードと同じ5行カードへ**即時統一しない**。
- まずは**既存の compact 表示を維持**する。
- 既存「過去N走」アコーディオンと summary「過去N走」は維持する。
- 横展開の初回実装では、表示密度を大きく変えず、**entries 由来の `recentRacesFromEntriesNankan` を表示専用ソースとして優先**することを主目的にする。
- 必要に応じて、compact 表示内に日付 / 人気 / 着差 / コーナー通過順などを**段階的に追加**するが、本命カードと同じ5行カード化は**別段階**とする。
- 視認性を損なう場合は情報追加を抑制し、連下 / 補欠の役割に合う**軽量表示**を優先する。

#### 34.23.4 実装境界
- 初回横展開の対象は **AK premium 南関のみ**。
- **free / KI は対象外（後回し）**。
- `astro-site/src/pages/premium-prediction/nankan.astro` **1ファイル内**の変更を基本とする。
- loader / inject / shared schema は変更しない。
- `getDisplayRecentRacesForNankan` の関数本体や**正本順位は変更しない**。
- entries recentRaces は **fallback 正本ではなく、表示専用ソースとしてのみ**扱う（recentHorseHistories fallback 正本にしない）。
- featureScores / 予測スコア / 評価記号 / 推奨系ロジック / dark-horse.mjs には接続しない。

#### 34.23.5 次の実装候補
- **Step 1**: 連下 / 補欠の近走ソース選択を、本命カードと同じく `horse.recentRacesFromEntriesNankan` 優先、無ければ `getDisplayRecentRacesForNankan(horse)` にする。
- **Step 2**: compact 表示を維持したまま、必要最小限の追加項目（日付 / 人気 / 着差 / コーナー通過順など）を検討する。
- **Step 3**: 本命カードと同じ5行カード化は、表示が重くなるため**別PR・別判断**とする。

#### 34.23.6 非対象（34.23）
- free 展開
- KI 展開
- R1d-2 profile / entryInfo 注入拡張
- R2-stats-design
- 本命カード以外の全面リデザイン

---

### 34.24 R1d-impl-v2c Step 2：連下・補欠 compact 表示の通過順追加方針 (2026-06-13)

#### 34.24.1 背景
- §34.23 で、連下 / 補欠は本命カードと同じ5行カードへ即時統一せず、compact 表示と既存「過去N走」アコーディオンを維持すると決めた。
- AK PR #78（main `832dffc`）では **Step 1** として、連下 / 補欠の近走ソースを `recentRacesFromEntriesNankan` 優先（無ければ `getDisplayRecentRacesForNankan(horse)`）に変更した。
- 本番到達・HTML 構造確認では、compact 表示・summary「過去N走」・本命カード enhanced 件数に異常はなかった。
- ただしユーザー本番目視で、**コーナー通過順が出ていない**こと、**一部アコーディオンが開かない / 中身が見えないように見える**ことが指摘された。

#### 34.24.2 read-only 調査結果
- **コーナー通過順が出ない原因は確定**。entries raw / mapper には `passingOrder` が保持されているが、連下 / 補欠の compact row markup が `passingOrder` / `cornerPassage` を描画していない。
- 本命カードの5行表示では `passingOrder` / `cornerPassage` / `corner` を異名吸収して表示している（本命は出る / 連下・補欠は出ない、という非対称）。
- 連下 / 補欠 compact row が現在読む項目は、主に venue / distance / rank / time / last3f / bodyWeight に限定されている。
- mapper 出力（`finish→rank`・`weight→carriedWeight`・distance は race-level フォールバック）は compact が読む主要項目と概ね整合しており、field shape の大きな破綻は確認されていない。
- entries データ側では `passingOrder` が高い割合で保持されている（OOI 実測で約 97%）。
- 本番 HTML では compact details 77件・row 382件・空行 0件で、summary だけ出て中身が完全に空になる状態は**現データでは再現しない**。
- ユーザー画像の一部馬は現 HTML / 現 AK データに不在で、日付更新または対象ページ差分により再現不可。別の該当馬は中身ありを確認済み。
- したがって、空アコーディオンは現時点では確定バグとして扱わず、再現条件（発生した日付・会場・馬名）が得られたら追調査とする。

#### 34.24.3 採用方針：B案
- **B案を採用する**。
- 連下 / 補欠の compact 表示は維持する。
- 本命カードと同じ5行カード化はしない。
- compact row 内に、`passingOrder` / `cornerPassage` / `corner` を異名吸収したコーナー通過順を**最小追加**する。
- あわせて、compact row の field 読み取りを本命カード相当に少し補強する。
- 具体的には、同一ファイル内で `pick()` / `ne()` 相当の読み替え・空セル抑制を使い、entries 由来と既存 getDisplay 由来の両 shape に耐えるようにする。
- ただし、日付 / 人気 / 着差 / 騎手 / 斤量まで一気に増やしすぎない。必要なら別段階で検討する。
- 視認性を優先し、compact 表示の軽さを保つ。

#### 34.24.4 実装境界
- 初回 Step 2 の対象は **AK premium 南関の連下 / 補欠カードのみ**。
- 変更候補ファイルは `astro-site/src/pages/premium-prediction/nankan.astro` **1ファイル**。
- **free / KI は対象外**。
- 本命カードの既存5行表示は変更しない。
- `getDisplayRecentRacesForNankan` 関数本体や正本順位は変更しない。
- loader / inject / shared schema は変更しない。
- entries は fallback 正本ではなく、表示専用ソースとしてのみ扱う。
- featureScores / 予測スコア / 評価記号 / 推奨系ロジック / dark-horse.mjs には接続しない。

#### 34.24.5 Step 2 実装候補
- 連下 / 補欠 compact row の表示項目に、コーナー通過順を追加する。
- 表示は既存 compact の密度を壊さない範囲に限定する。
- 例: `通過12-11-11` または `通過 12-11-11`。
- `passingOrder` が無い場合は `cornerPassage` / `corner` を見る。
- 値が無い場合は項目ごと非表示にし、空ラベルや 0 埋めはしない。
- row が空にならないよう、既存項目も含めて空セル抑制する。
- 連下 / 補欠の2箇所で同じ処理を重複させすぎる場合は、同一ファイル内の小 helper を検討してよい。ただし別ファイル化や大規模共通化はしない。

#### 34.24.6 非対象（34.24）
- 本命カードと同じ5行カード化
- 連下 / 補欠の全面リデザイン
- 日付 / 人気 / 着差 / 騎手 / 斤量の一括追加
- free 展開
- KI 展開
- R1d-2 profile / entryInfo 注入拡張
- R2-stats-design
- 条件別成績
- loader / inject / shared schema 変更

---

### 34.25 R1d-comment-v1：連下・補欠・見送り系コメントの安全表現方針 (2026-06-13)

#### 34.25.1 背景
- R1d-impl-v2c Step 2（§34.24）により、AK premium 南関の連下 / 補欠 compact 近走には通過順表示が追加された。
- その過程で、連下 / 補欠 / 見送り系カードに表示される**定型コメントの品質問題**が画面目視で確認された。
- 近走詳細が改善されても、コメントが機械的・断定的だと画面全体の信頼感を損なうため、先に文言方針を固定する。

#### 34.25.2 生成元と影響範囲
- 生成元は AK の `astro-site/src/lib/horseEnrichment.js` にある `generateMinorHorseComment(role, gapFromHonmei)`。
- role と本命との差分値だけで固定文言を返すテンプレートであり、個別の近走詳細や出馬表 detail には接続していない。
- 影響範囲は **AK premium 南関だけでなく、AK premium JRA、ライト会員の南関 / JRA にも及ぶ**共有 lib。
- AK free / KI / shared / admin / loader / inject / featureScores / dark-horse.mjs には影響しない。
- したがって、南関 page 側で個別分岐させるより、**共有 lib の文言を安全表現へ統一する方が自然**。

#### 34.25.3 問題整理
- 現行文言には、**強すぎる候補表現・購入判断に見える表現・見送りを断定する表現**が含まれる。
- これらはユーザー可視の馬コメントとしては避ける。
- 今後、ユーザー可視コメントでは以下の系統を避ける。
  - 購入判断に見える表現
  - 過度に強い候補表現
  - 断定的な除外表現
  - 評価記号や指数断定に見える表現
- 内部ロジック名や既存コード名の一括改名は今回の対象外。**対象はユーザー可視コメントに限定**する。

#### 34.25.4 採用方針：B案
- **B案を採用する**。
- `generateMinorHorseComment` の**全分岐を安全表現へ統一**する。
- 文体は「候補」「確認」「控えめ」「展開次第」「評価を上げたい」などの柔らかい表現に寄せる。
- 断定的な購入判断、強すぎる候補表現、除外断定は避ける。
- AK premium 南関だけでなく、同関数を使う **AK premium JRA / ライト会員にも同じ品質改善を適用**する。
- 南関だけの分岐や page 側の個別上書きは採用しない。

#### 34.25.5 実装境界
- 次の実装候補は AK の `astro-site/src/lib/horseEnrichment.js` **1ファイル**。
- `generateMinorHorseComment(role, gapFromHonmei)` の**返却文言のみ**を変更する。
- ロジック条件、role 判定、本命との差分計算は変更しない。
- featureScores / 予測スコア / 評価記号 / 推奨系ロジック / dark-horse.mjs には接続しない。
- nankan.astro / jra.astro / light-predictions / components 側の表示構造は変更しない。
- free / KI / loader / inject / shared schema は変更しない。

#### 34.25.6 実装時の文言案
以下の趣旨で、8分岐すべてを安全表現へ置換する。

連下系:
- 差が小さい場合: `上位候補との差は小さく、展開が向けば評価を上げたい一頭です。`
- 中程度の差: `上位候補との差はあるものの、相手候補として確認しておきたい一頭です。`
- 差が大きい場合: `能力面では一定の評価があり、展開次第で見直し余地があります。`

補欠・抑え系:
- 差が小さい場合: `本線評価までは届かないものの、展開が向けば相手候補として確認したい一頭です。`
- 中程度の差: `スコアは控えめですが、上位候補に不安が出た場合は確認したい一頭です。`
- 差が大きい場合: `上位候補との差はありますが、展開次第では見直し余地があります。`

見送り系:
- 差が小さい場合: `上位候補と比べると評価は下がりますが、展開次第では確認の余地があります。`
- 中程度の差: `スコア面では上位候補に届かず、今回は評価を控えめにしています。`
- 差が大きい場合: `展開待ちの面が強く、今回は評価を抑えています。`

#### 34.25.7 非対象（34.25）
- 近走表示の追加変更
- 通過順表示の追加変更
- 5行カード化
- 日付 / 人気 / 着差 / 騎手 / 斤量の追加
- featureScores 表示変更
- 評価ロジック変更
- 購入判断ロジック
- free / KI 展開
- shared schema 変更

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

- 2026-06-13: §34.25 に **R1d-comment-v1** として、AK 共有コメント生成関数（`horseEnrichment.js` の `generateMinorHorseComment`）の**ユーザー可視文言を安全表現へ統一する方針（B案採用）**を記録。連下 / 補欠 / 見送り系カードの定型コメントに、強すぎる候補表現・購入判断に見える表現・除外断定が含まれ品質問題と目視確認。生成元は role と本命差分だけの固定文言テンプレートで近走 detail 非接続、影響範囲は **AK premium 南関だけでなく premium JRA・ライト会員（南関/JRA）にも及ぶ共有 lib**（free / KI / shared / admin / loader / inject / featureScores / dark-horse.mjs は無影響）。**B案＝全8分岐を「候補/確認/控えめ/展開次第/評価を上げたい」基調の柔らかい表現に統一**、南関だけの分岐や page 側上書きは不採用。実装候補は AK `horseEnrichment.js` 1ファイルの**返却文言のみ**変更（ロジック条件/role 判定/差分計算/表示構造は不変・featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続）。内部ロジック名の一括改名は対象外＝ユーザー可視コメント限定。**docs-only・AK/KI/shared/実装変更なし・`horseEnrichment.js` 未編集**。
- 2026-06-13: §34.24 に **R1d-impl-v2c Step 2** として、AK premium 連下・補欠 compact 表示の**コーナー通過順追加方針（B案採用）**を記録。PR #78（Step 1・main `832dffc`）本番目視で「コーナー通過順が出ない」「一部アコーディオンが開かない / 中身が見えないように見える」と指摘。read-only 調査で**通過順未表示は確定**（entries raw / mapper は `passingOrder` 保持・約97%だが連下/補欠 compact markup が `passingOrder`/`cornerPassage` を描画していない／本命5行は異名吸収で表示済の非対称）。**空アコーディオンは現データ非再現**（本番 compact 77件・row 382件・空行0／指摘馬は現 HTML・現 AK データに不在で日付更新差分により再現不可・別の該当馬は中身あり確認）→ 確定バグ扱いせず再現条件待ち。**B案＝compact 維持・5行カード化なしで `passingOrder`/`cornerPassage`/`corner` 異名吸収のコーナー通過順を最小追加＋`pick()`/`ne()` 相当の読み替え・空セル抑制で両 shape 対応**。対象は **AK premium 南関 連下/補欠のみ・`premium-prediction/nankan.astro` 1ファイル**、日付/人気/着差/騎手/斤量の一括追加はしない。`getDisplayRecentRacesForNankan` 正本順位不変・entries は表示専用（fallback 正本化なし）・loader/inject/shared schema 不変・free/KI 後回し・featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続。**docs-only・AK/KI/shared/実装変更なし**。
- 2026-06-12: §34.23 に **R1d-impl-v2c** として、AK premium 南関の**連下・補欠カード横展開前の表示密度方針**を固定。連下 / 補欠は本命と同じ `raceHorses` 由来 horse を使い entries 付与対象になり得るが、現状は compact 1行表示。**本命カードと同じ5行カードへ即時統一せず**、まず compact 表示と既存「過去N走」アコーディオンを維持したうえで、初回横展開は **entries 由来 `recentRacesFromEntriesNankan` を表示専用ソースとして優先**することを主目的にする（Step1=ソース優先 / Step2=compact 内に最小追加 / Step3=5行カード化は別PR・別判断）。対象は **AK premium 南関のみ・`premium-prediction/nankan.astro` 1ファイル内**、**free / KI は後回し**。`getDisplayRecentRacesForNankan` 正本順位不変・entries は fallback 正本にしない（表示専用）・loader / inject / shared schema 不変・featureScores / 予測スコア / 評価記号 / 推奨系ロジック / dark-horse.mjs 非接続。**docs-only・AK / KI / shared / 実装変更なし**。
- 2026-06-12: **R1d-impl-v2 の AK premium 本番目視確認結果を docs 記録（§34.22 新設）**。AK PR #77（main `9e93c76`）を merge し、premium 南関の**本命カード1箇所**で既存「過去N走」アコーディオン（details/summary）を維持したまま内部を AK dark/slate トーンの5行カード型に整理。entries を premium 近走アコーディオンの**表示専用ソース**として優先（無ければ `getDisplayRecentRacesForNankan(horse)` 維持・関数/loader/inject/shared schema 不変・recentHorseHistories fallback 正本化なし・予測スコア/評価記号/推奨系ロジック非接続）。これにより 上がり3F(504件)・**コーナー通過順(169件)**・日付(117)・人気(169)・着差(167)・着順(464)・騎手(204)・斤量(249)・馬体重・レース名 が表示。build/checks pass・`nankan-horse-detail-panel` 不使用・「出馬表由来/参考」非表示・禁止語0・free/KI 未変更・**ユーザー本番目視で「問題なさそう」と確認済み**。今後の展開候補（未着手）＝premium 連下/補欠・free・KI(slug の table wrapper 注意)・R1d-2(profile/entryInfo 注入拡張)・R2-stats-design(条件別成績集計)。**docs-only・AK/KI/shared/実装/component/page/loader/inject/getDisplay/shared schema 変更なし。R1d-2 不進・R2 実装不進・連下/補欠・free・KI 展開なし・条件別成績/オッズ/回収率は扱わない・featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **entries 近走を premium 近走アコーディオンの表示専用ソースにする方針を docs 固定（§34.21 新設・R1d-impl-v2b）**。AK PR #77（R1d-impl-v2）で既存アコーディオン維持・dark/slate トーン・5行カード型・上がり3F 表示は成立したが**コーナー通過順 0 件**。原因＝当日 premium が参照する `getDisplayRecentRacesForNankan`＝predictions recentRaces は `passingOrder` のほか `date`/`trackCondition`/`popularity`/`margin`/`jockey`/斤量 も当日実測 0%。一方 entries `recentRacesFromEntriesNankan` は当該項目が約 96〜100%（`passingOrder` 約 97%）。**案B＝premium 近走アコーディオンの「表示専用ソース」として `horse.recentRacesFromEntriesNankan` を優先（無ければ既存 `getDisplayRecentRacesForNankan(horse)` 維持）** を推奨として固定。切替は premium page の表示だけ・`getDisplayRecentRacesForNankan` 関数不変・loader/inject/shared schema 不変・entries を recentHorseHistories fallback 正本にしない・予測スコア/評価記号/推奨系ロジック非接続・free/KI 非展開・AK premium 本命カード1箇所 preview 限定。実装イメージ＝`displayRecentRaces = entries?.length>0 ? entries : getDisplay(horse)`・二重表示しない・`slice(0,5)` 維持・entries は newest-first を実装時確認・描画コードは両 shape 対応済（rank/finish・carriedWeight/weight・last3f/agari・passingOrder/cornerPassage・date/raceDate・venue/track/trackName）。案A=getDisplay 維持(通過順等欠落で5行が活きない)、案C=passingOrder のみ entries 補完(date 0% で走ごと突合困難・他欄欠損のまま・初期非推奨)。安全条件＝entries 無い日会場は既存維持/二重表示なし/正本順位不変/schema 不変/loader・inject 不変/premium 1箇所限定/build・HTML で既存 details・summary 維持・上がり3F・通過順・日付・人気・着差・騎手・斤量表示・`nankan-horse-detail-panel` 不使用・「出馬表由来/参考」非表示・禁止語0・free/KI 不変を確認。PR #77 は土台で描画コード両 shape 対応済、docs 固定後に PR #77 へ最小修正を入れる案・merge は目視後。**docs-only・AK/KI/shared/PR #77/実装/component/page/loader/inject/getDisplay/shared schema 変更なし。entries fallback 正本化なし・R1d-2 不進・R2 実装不進・条件別成績/オッズ/回収率は扱わない・featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **南関馬詳細パネルの既存アコーディオン拡張案を docs 固定（§34.20 新設・R1d-design-mock）**。§34.19 第一候補「既存アコーディオン拡張型」の具体表示案を固定。既存「過去N走」開閉体験を維持し summary は `過去5走`（第一候補）or `近走成績`、常時表示カード型に戻さず白背景独立カード禁止・AK dark/navy/gradient/premium card トーン整合・並列表示しない。アコーディオン内は 3 段（A 近走要約行=任意 / B 1走1カード=濃色カード・主要行[日付/競馬場/距離/馬場/着順/人気]＋補助行[レース名/タイム/着差/上がり3F/コーナー通過順/騎手/斤量/馬体重] / C 将来拡張枠=条件別成績は枠だけ）。**コーナー通過順と上がり3F を優先表示候補に固定**（脚質・位置取り・伸び脚が分かるためセットで近接配置・上がり3F 順位は弱いため取得まで非対象）。1走カードの並びは 1行目=日付/競馬場/距離/馬場・2行目=着順/人気/タイム/着差・3行目=上がり3F/コーナー通過順・4行目=騎手/斤量/馬体重・5行目=レース名。優先度 P0[着順/人気/距離/馬場/タイム/着差/上がり3F/コーナー通過順]・P1[騎手/斤量/馬体重/レース名/頭数]・P2[相手馬/開催名/クラス名]・P3[上がり3F順位/枠番/当日馬体重増減/条件別成績/オッズ/回収率＝今は出さない]。欠損時は null/空を出さず空ラベル/0埋め/弱い表示なし・項目ごと非表示・entries 無い日会場は現行維持。デザインは既存 premium card の背景/枠線/余白/角丸に合わせ `recent-races-compact` と非競合 class。展開は AK premium 1箇所 preview→合格後 premium 残り→free→KI(slug/table wrapper)。条件別成績(距離別連対率/3着内率)は近走5走では不安定で results/racebook/entries 蓄積 or 別取得・集計期間/最低サンプル/非表示条件を R2-stats-design で定義（mock では枠だけ・数値表示しない）。**docs-only・AK/KI/shared/実装/component/page/loader/inject/getDisplay/shared schema 変更なし。R1d-2 不進・R2 実装不進・条件別成績/上がり3F順位/オッズ/回収率は実装しない・featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **南関馬詳細パネルの再設計方針を docs 固定（§34.19 新設・R1d-redesign-docs）**。R1d-1 の「entries 近走5走を白いカードで常時表示」案は不採用とし、横展開ではなく UI / 情報設計の再設計を先に固定。**UI 再設計**＝アコーディオン維持（初期コンパクト・必要時に開く）/ AK の dark・navy・gradient・glass card トーン準拠（白背景メモ帳型カード禁止・評価ポイント/特徴量重要度と文脈整合）/ 近走は主要行＋補助行で整理・横長 table 回避・モバイルで長くしすぎない / 情報密度は初期要約＋詳細はアコーディオン内・空ラベル出さない。**情報設計**＝4 層（L1 馬プロフィール=馬番/馬名/性齢/父、L2 当日出走情報=騎手/斤量/調教師、L3 近走成績=距離/馬場/着順/人気/タイム/着差/上がり/通過順/騎手/斤量/馬体重、L4 条件別・推移系=距離別連対率/3着内率・場別・馬場状態別・出走間隔別・斤量変化・馬体重推移・持時計）。L1〜3 は entries/predictions で一部実現可・L4 は最大5走では不足で R2-stats-design で別設計。**次回 UI 案**＝A 既存アコーディオン拡張型(第一候補)/B 馬詳細アコーディオン統合型(第二候補)/C 常時表示カード型(初期非推奨)。条件別成績は results/racebook/entries の蓄積 or 別取得・集計期間/最低サンプル数/サンプル不足時非表示/0埋めしない を R2 で定義。R1d-2(profile/entryInfo 注入拡張)だけでは物足りなさは解決しないため UI/情報設計の再設計が先。次フェーズ推奨順 R1d-design-mock→R2-stats-design→R1d-2→R1d-impl-v2。**docs-only・AK/KI/shared/実装/component/page/loader/inject/getDisplay/shared schema 変更なし。R1d-2 不進・R2 実装不進・条件別成績/オッズ/回収率は扱わない・featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **南関馬詳細パネル R1d-1 の実地評価と表示停止を docs 記録（§34.18 新設）**。AK PR #75（main `3f865d9`）で `NankanHorseDetailPanel.astro` を premium 本命カード1箇所に preview 実装（entries ある馬だけ既存「過去N走」を置換・無ければ維持・loader/inject/getDisplay 不変・build/HTML は通過）したが、**本番目視で表示品質が不合格**（既存アコーディオン消失で操作性低下・AK の dark/gradient/card トーンと不一致で白いメモ帳のように浮く・近走5走の整形表示に近く「馬詳細」として情報設計不足・距離別連対率/3着内率など条件別成績を欠く）。AK PR #76（main `b877fd6`）で **import と呼び出しを削除し premium 本命カードを既存「過去N走」に復元**（`nankan-horse-detail-panel=0`・既存「過去N走」復活・「出馬表由来/参考」なし）、`NankanHorseDetailPanel.astro` は未使用 inert として温存。横展開（premium 残り/free/KI）はしない。再発防止＝白いカードの近走羅列だけでは採用しない/アコーディオン操作性維持/AK 既存トーン整合/並列表示しない/「馬詳細」には条件別成績・適性の設計が必要。今後は **UI 再設計（アコーディオン維持・AK トーン整合・白背景独立カード回避）＋情報設計再設計（条件別・推移系）＋データ再設計（results/racebook/entries 蓄積 or 別取得・集計期間/最低サンプル/非表示条件の定義）** を優先し、R1d-2（profile/entryInfo 注入拡張）は表示再設計の後。次フェーズ案 R1d-redesign-docs/R1d-design-mock/R2-stats-design。**docs-only・AK/KI/shared/実装/component/page/loader/inject/getDisplay/shared schema 変更なし。R1d-2 不進・横展開なし・条件別成績/オッズ/回収率は扱わない・featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **南関馬詳細パネル R1d（AK preview）実装方針を docs 固定（§34.17 新設・R1d-1/R1d-2 分離）**。着手前 read-only 調査（AK は `adaptLatestPrediction.js` 経由で `horse.recentRacesFromEntriesNankan` 注入済＝recentRaces のみ・entries 固有 profile は未注入・`getDisplayRecentRacesForNankan` は別系統）を踏まえ実装範囲を固定。**R1d-1**＝AK premium の1カード（本命相当）だけで preview、新 `NankanHorseDetailPanel.astro` を作り **`horse.recentRacesFromEntriesNankan?.length>0` の時だけ既存「過去N走」block を置き換え・無ければ既存維持**（並列表示しない・二重表示再発防止）。近走成績を主役にし、profile/entryInfo は predictions horse 既存項目（馬番/馬名/性齢/父・騎手/斤量/調教師）のみ任意表示。毛色/母父/騎手所属/調教師所属は出さない。props＝`horse`+`mode="premium"`+`maxRecentRaces={5}` 最小。loader/inject/getDisplay/shared schema は触らない。**R1d-2**＝entries 固有 profile/entryInfo（毛色/母父/所属）の注入拡張を `loadEntriesNankan.js`/`injectEntriesRecentRacesNankan.js` で別フィールド（`horse.entryProfileFromEntriesNankan` 等）に付与する案、R1d-1 成功後に別 PR・getDisplay 正本順位は変えず fallback 化しない。CSS は scoped・`nankan-*` class・モバイル縦並び・1走1カード。欠損時は null/空を出さず近走空なら component を出さず既存 block に戻す。確認手順（build/HTML で `nankan-horse-detail-panel` 出現・「出馬表由来/参考」非出現・二重表示なし・空ラベルなし・entries 無い馬は既存維持・禁止語 grep 0・差分は新 component と premium page の2ファイルのみ）を記録。R1e で KI（slug の `<td colspan>`/空 `<tr>` 防止）へ移植。**docs-only・実装/component ファイル作成/AK page/loader/inject/getDisplay/included_files/AK/KI/shared/UI/CSS/dispatch/workflow/import 変更なし。fallback 化なし・shared schema 変更なし・entries 表示再開なし・oddsSnapshot/オッズ/集計成績は扱わない・profile/entryInfo 注入拡張は未実装。featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **南関馬詳細パネルの共通 component 仕様を docs 固定（§34.16 新設・R1c）**。R1b の画面設計を共通 component 化する前に仕様固定。component 名＝`NankanHorseDetailPanel.astro`（内部で profile/entryInfo/recentRaces を分割・既存 `RecentRacesFromEntriesNankan.astro` は旧扱いで正本にしない）。props＝必須 `horse`/`raceInfo`/`mode`＋任意 `maxRecentRaces`(初期5)/`showProfile`/`showEntryInfo`/`showRecentRaces`/`compact`/`context`（初期は `horse`+`mode`+`maxRecentRaces` から）。データ参照＝`getDisplayRecentRacesForNankan` 正本順位不変・entries は直接 fallback 正本にしない・注入済み entries 由来は補助表示候補・shared schema 不変。表示構造＝`section.nankan-horse-detail-panel` 内に profile/entry-info/recent-races の3 block、近走は 1走1カード（主要行=日付/競馬場/距離/着順/人気・補助行=レース名/頭数/タイム/着差/上がり3F/通過順/騎手/斤量/馬体重/相手馬・距離/馬場は値がある時のみ）。details は「近走 block 全体」か「カード常時表示」の二択を R1d で比較（1走ごと details は初期非推奨）。CSS＝scoped を持ち素の羅列にしない・`recent-races-compact` と競合しない class（`nankan-horse-detail-panel`/`nankan-recent-card` 等）・モバイル縦並び・KI slug の `<td colspan>` 内でも破綻しない layout。欠損時＝null/空は出さない・空ラベル/0埋め/弱い表示なし・近走空なら block 非表示・entries 無い日会場は現行維持。AK/KI＝仕様/class 共通・file は各 repo・**AK preview→KI** の順・KI slug は空 `<tr>` を残さない。free/premium 初期同一。既存「過去N走/直近走」と**並列表示しない**（R1d は置き換え or 限定 preview で二重表示再発を防ぐ）。**docs-only・実装/component ファイル作成/page/included_files/AK/KI/shared/UI/CSS/dispatch/workflow/import 変更なし。`getDisplayRecentRacesForNankan` 変更なし・fallback 化なし・shared schema 変更なし・entries 表示再開なし・oddsSnapshot/オッズ/集計成績は扱わない。featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **南関馬詳細パネルの画面設計案を docs 固定（§34.15 新設・R1b）**。R1a の P0/P1 項目だけを使い「どう見せるか」を固定（「何を出すか」は R1a で確定済み）。馬詳細パネルを **A 馬プロフィール（馬番/馬名/性齢/毛色/父/母父）・B 当日出走情報（騎手/騎手所属/負担重量/調教師/調教師所属）・C 近走成績（最大5走・日付/競馬場/レース名/頭数/人気/着順/タイム/着差/騎手/斤量/馬体重/上がり3F/通過順/相手馬、距離・馬場状態は値がある時のみ）** の3ブロックに分割。UI 案 A(1走1カード)/B(主要行＋details 折りたたみ)/C(コンパクト表)/D(既存行拡張) を比較し、**第一候補＝A または B**（横幅破綻なし・二重表示再発なし・AK/KI 共通 component 化しやすい）。free/premium は**初期同一表示**（差分は R2/R3 以降）。AK/KI は**表示データ契約共通・UI 差最小・共通 component 前提**、実装は **AK preview→KI** の順（KI slug は table 構造のため wrapper 注意）。文言は「馬プロフィール/当日出走情報/近走成績/直近5走」を使い「出馬表由来/参考/詳細/中央版同等」は使わない。欠損時は**値がない項目は出さない・空ラベル/0埋め/弱い表示をしない・entries 無い日会場は現行維持**。フェーズ R1b(画面設計)→R1c(共通 component 仕様)→R1d(AK preview)→R1e(KI)→R1f(確認)→R1g(記録)。**docs-only・実装/component/page/included_files/AK/KI/shared/UI/CSS/dispatch/workflow/import 変更なし。`getDisplayRecentRacesForNankan` 変更なし・fallback 化なし・shared schema 変更なし・entries 表示再開なし・オッズ/集計/血統 別取得なし。featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **南関馬詳細パネルの表示項目棚卸しを docs 固定（§34 新設・R1a）**。再設計を「南関過去走表示」単体ではなく **「南関馬詳細パネル」全体**として扱う方針に転換。read-only 棚卸しの結果を表示優先度で固定：**P0**＝現 entries だけで高充足の項目（馬番/馬名/性齢/毛色/父/母父・騎手/騎手所属/負担重量/調教師/調教師所属・近走の 競走日/競馬場/レース名/頭数/人気/着順/タイム/着差/騎手/斤量/馬体重/上がり3F/通過順/相手馬＝実測 約96〜100%）。**P1**＝条件付き（近走の距離/馬場状態＝実測 約52%・値がある時のみ表示）。**P2**＝集計成績（距離別/場別/騎手別/馬場別/出走間隔別/種牡馬/季節別/騎手コース別/回収率/連対時馬体重/持時計＝最大5走では統計的に弱く別取得・継続蓄積前提）。**P3**＝現状保留（枠番/母馬名/生年月日/馬主名/生産牧場/当日馬体重/増減/オッズ各種/上がり3F順位＝取得不可 or 空多。racebook の predictedOdds・dam は field のみ実測 0/146 非空）。オッズは変動データとしてプロフィールに混ぜず将来 `oddsSnapshot`（別取得・別 schema・時刻付き）で扱う。文言は「出馬表由来/参考/中央版同等/詳細」を避け「近走/直近5走/馬プロフィール/当日出走情報」を使う。フェーズ案 R1a(docs)→R1b/R1c(P0/P1 設計・共通 component)→R1d/R1e(AK/KI 実装)→R1f(確認)→R2(集計)/R3(oddsSnapshot)/R4(血統・馬主・生産)。**docs-only・実装/component/page/included_files/AK/KI/shared/UI/CSS/dispatch/workflow/import 変更なし。`getDisplayRecentRacesForNankan` 変更なし・fallback 化なし・shared schema 変更なし・entries 表示再開なし。featureScores/予測スコア/評価記号/推奨系ロジック/dark-horse.mjs 非接続**。
- 2026-06-12: **南関 entries 当日データ一気通貫の実地表示確認を docs 記録（§33.7 新設）**。最新予想日と同一日付の当日 entries `2026-06-12-OOI`（full venue・totalRaces=12/races=12/horses=144/recentRacesCoverage=100%/schema OK/sourcePageType=uma_shosai/record optional・0埋めなし）を **shared 保存（`nankan/entries/2026/06/2026-06-12-OOI.json`・gh auth fallback で status 201）→ AK/KI import（`entries-nankan-updated` dispatch・date=2026-06-12/venues=["OOI"]・AK/KI 各 status=204・両 workflow success・AK HEAD `cd5d267`/KI HEAD `59b1e14`・両 repo に `astro-site/src/data/entries/nankan/2026/06/2026-06-12-OOI.json` create）→ 表示確認** まで一気通貫で完走。**AK**：build exit 0・`premium-prediction/nankan` summary「出馬表由来の近走（参考）」**112 件**・`free-prediction/nankan` **144 件**・既存近走残存・record/opponentName/postPosition 非表示・entries 無し馬の空表示なし。**KI**：build exit 0・free slug `2026-06-12-ooi` summary **60 件**・SSR index は `2026-06-12-ooi` prediction に inject 実行で **145 頭中 144 頭注入成立**（1 頭未マッチはブロック非表示で正常）。既存「直近走/過去N走」不変・`getDisplayRecentRacesForNankan` 不変・entries `recentRaces` は馬詳細専用で recentHorseHistories 全馬 fallback には不使用・予測スコア/評価記号/推奨系ロジック非接続。**ただし実画面確認の結果、既存過去走との重複・文言・表示品質の理由で AK/KI の表表示は一時停止（§33.7 #6）**：AK PR #74（main `cff1a49`）/ KI PR #39（main `4fa9d33`）で page からの component 呼び出しのみ除去、component/inject/loader/mapper/entries data/workflow/dispatch は温存（再設計後に呼び出しを戻すだけで再表示可能）。**docs-only・実装/component/page/included_files/AK/KI/shared/UI/CSS/dispatch/workflow/import 変更なし。featureScores/dark-horse.mjs/JRA 表示/既存 recentHorseHistories 表示 変更なし**。
- 2026-06-12: **F5g：南関 entries 表示接続の完了を docs 記録（§33 新設）**。KI 側の表示接続が **F5f-1（注入）→ F5f-2（表示）→ F5g（確認・記録）** で完了。F5f-1＝KI PR #37（main `4f1bb36`）で `astro-site/src/utils/injectEntriesRecentRacesNankan.js` 追加・南関3ページに注入呼び出し追加、`data.predictions[].horses[]` を `raceNumber+horseNumber`（name 補助）で突合し **別フィールド `horse.recentRacesFromEntriesNankan`** へ注入（`recentRaces`/`recentRacesFromHistoriesNankan`/`getDisplayRecentRacesForNankan` 不変・fallback 化なし・inert 完了）。F5f-2＝KI PR #38（main `06d8d86`）で共通 component `astro-site/src/components/RecentRacesFromEntriesNankan.astro` 新規＋3ページ呼び出し、summary **「出馬表由来の近走（参考）」**・最大5走・**CSS 追加ゼロ（C-1）**・premium/free index は「直近走」直後に別ブロック・**free slug は table のため `<tr><td colspan="5">` ラップ＋空行防止 gate**・record/opponentName/postPosition 非表示・既存「直近走/過去N走」不変。F5g＝KI main clean・HEAD=`06d8d86`・**build exit 0・禁止差分なし・禁止語なし**、**slug アーカイブ `2026-06-10-ooi` の build HTML で summary 出現＝表示成立を確認**、premium/free index は最新予想 `2026-06-12` に対し entries が `2026-06-10-OOI` のみのため **非表示が正常（data fallback）**・同一日付 entries 取込後に index でも表示。AK/KI 対称＝AK F5e(`src/lib`/SSG・PR #71/#72/#73)・KI F5f(`src/utils`/SSR・included_files `src/data/entries/**`=F5b・PR #36/#37/#38)、両者とも entries `recentRaces` は **馬詳細専用・recentHorseHistories 全馬 fallback には使わない**・ラベル統一。残＝当日 entries の shared 取込・dispatch/workflow/import 配線（`entries-nankan-updated`・§31）は別タスク・実送信はマコさん手動。**docs-only・実装/component/page/included_files/AK/KI/shared/UI/CSS/dispatch/workflow/import 変更なし。予測スコア/評価記号/推奨系ロジック/featureScores/dark-horse.mjs/JRA 表示/既存 recentHorseHistories 表示 変更なし**。
- 2026-06-12: **PR-F5a：南関 entries 表示接続契約を docs 固定（§32 新設）**。F5 初期方針＝entries `recentRaces` は **「馬詳細」専用**（馬名クリック/詳細展開/モーダル等）として扱い、**既存 recentHorseHistories の全馬 fallback には初期段階で使わない**（既存近走表示・予想カードは現行維持）。entries がある馬のみ表示・無ければ現行維持。由来ラベルは **「出馬表由来の近走」**（「全履歴/JRA同等/完全な過去走」禁止・recentHorseHistories/horseHistories と同等扱いしない）。record null＝正常・**通算/条件別は出さない・「0戦/成績なし/全履歴取得済み/JRA同等」禁止・0埋めしない**。表示対象＝最大5走・`raceNumber+horseNumber` 主キー突合（name 補助）・**full venue のみ（partial/R01-only/totalRaces=1 は使わない・sourceMeta.races.length≠races.length は skip）**。mapper＝`finish→rank`/`weight→carriedWeight`/`number→horseNumber`/surface は race 補完・**record は mapper 対象外**。AK/KI 同契約・同ラベル・レイアウト差は維持・**AK(SSG) included_files 不要 / KI(SSR) は表示前に netlify.toml included_files へ `src/data/entries/**` 追加（F5b）**。PR分割 F5a(docs)→F5b(KI included_files)→F5c(AK mapper)→F5d(KI mapper)→F5e(AK接続)→F5f(KI接続)→F5g(本番/記録)。**docs-only・実装/mapper/loader/page 接続/included_files 変更なし。AK/KI/shared/UI/CSS/predictions/featureScores/AI/印/買い目/穴馬/dark-horse.mjs/JRA 表示/既存 recentHorseHistories 表示 変更なし**。
- 2026-06-11: **PR-F4d-5：南関 entries 手動 dispatch 成功結果を docs 記録（§31.9 追記）**。`entries-nankan-updated` を **1 回だけ手動 dispatch**（date=2026-06-10/venues=OOI・`scripts/dispatch-entries-nankan.mjs`・payload `{date,venues:["OOI"],category:nankan,kind:entries,source:nankan-entries}`・dry-run GET=200/PASS・実送信は AK/KI 各 status=204・2/2 success）。AK run 27354115021 / KI run 27354116393 とも `Import Entries Nankan (Dispatch)` が event=repository_dispatch で **completed/success**・import 2026-06-10 OOI（races=12/horses=156→`src/data/entries/nankan/2026/06/2026-06-10-OOI.json`）・**commit 発生なし（No changes detected・既存 main と同一）**。admin/AK/KI とも local==origin/main・clean、shared 変更なし。**end-to-end（admin dispatch→AK/KI workflow→import:entries:nankan→no-changes 正常終了）成立・重複 commit なし**を確認。次は F5 表示接続準備。**docs-only・実装/script/workflow/dispatch 再送/included_files 変更なし。AK/KI/shared/UI/CSS/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし**。
- 2026-06-11: **PR-F4d-1：南関 entries 自動 import 接続方針を docs 固定（§31 新設）**。F4b(AK)/F4c(KI) で import script + 実 import（`2026-06-10-OOI`・AK `b2be7ca`/KI `c340516`）まで完了したのを受け、shared→AK/KI 自動 import の接続方針を固定。**dispatch event_type = `entries-nankan-updated`**（既存 `recent-horse-histories-nankan-updated` の命名規則準拠・`nankan-entries-updated` は非推奨・JRA event 流用禁止）。payload＝単一 date/venues 基本（`{date, venues, category, kind, source}`・updates 配列/複数日一括/sourcePath なし）。AK/KI 受信 workflow＝新規 `import-entries-nankan-on-dispatch.yml`（既存 recentHorseHistories workflow をテンプレ・`types:[entries-nankan-updated]`+workflow_dispatch・`npm run import:entries:nankan`・**git add は entries/nankan のみ**・専用 concurrency group・AK/KI byte 一致維持）。admin dispatch script＝新規 `scripts/dispatch-entries-nankan.mjs`（既存 dispatch-recent-horse-histories-nankan を テンプレ・**既定 dry-run**・`--dispatch`+`--confirm-dispatch=entries-nankan-updated` 二段 opt-in・AK/KI 2 repo・token 非表示・**実送信はマコさん手動**・F4d-1 では未実装）。**KI included_files＝現状 entries 未登録・import だけなら不要・KI SSR 表示で読む時に `src/data/entries/**` 追加が必要→F5 で実施（F4d では変更しない・F5 忘れ事故防止のため docs 明記）**。AK は included_files 不使用で変更不要。PR分割 F4d-1(docs)→F4d-2(AK workflow)→F4d-3(KI workflow)→F4d-4(admin dispatch script)→F4d-5(明示許可後 1回だけ送信)→F5(表示・KI included_files)。安全ガード＝workflow_dispatch inputs date/venues 必須・full venue 判定/R01-only skip は importEntriesNankan.js guard に委譲・git add entries/nankan 限定・dispatch payload 単一 date/venues・dispatch は workflow 準備後 opt-in。**docs-only・実装/workflow 追加/dispatch 送信/included_files 変更なし。shared/AK/KI/workflow/save-entries.mjs/entries-manager.astro/dry-run-aggregate-entries.mjs/featureScores/AI/印/買い目/穴馬/dark-horse.mjs/predictions/既存 import script・workflow 変更なし**。
- 2026-06-11: **PR-F4a：AK/KI import 契約を docs 固定（§30 新設・§27.6 更新）**。F3 系列で生成・保存できる **南関 full venue entries JSON** の取り込み契約。前提実績＝`2026-06-10-OOI.json` は R01-only→**full venue(totalRaces=12・156頭・record 全 null・validator error 0)** へ置換済（shared `ef584e7`・**dispatch 未実施**）。import 対象条件＝`category=nankan`／sourceType=auto または手作業でも schema OK／`totalRaces===races.length`／`totalRaces>1`／`races.length>1`／raceNumber 昇順／horses 空 race なし／validator error 0。スキップ条件＝`totalRaces===1`／`races.length===1`／`sourcePageType=uma_shosai` かつ `totalRaces===1`／`sourceMeta.races.length!==races.length`／validator error／record 0埋め／partial・`--max` 由来／date・venue・venueCode 不一致。**R01-only は今後も import 対象外・import 側にも防御的 skip**（前日 R01 を当日取込する事故の二重防御）。AK/KI 責務＝shared から取得・各 repo 配置ルールで保存・**horseHistories/recentHorseHistories/predictions/featureScores と混同しない**・entries は出馬表由来・**AI指数/印/買い目/穴馬 非接続**。record null＝auto/uma_shosai は `recordSourced=false`・**record は null が正・0戦扱いしない**・通算/条件別は record がある場合のみ表示・null は非表示or「データ未取得」・**「0戦」「成績なし」「全履歴取得済み」「JRA同等」と表示しない**。**F4 は import まで・表示分岐は F5・F4 で UI/CSS/買い目に触らない**。dispatch＝本 PR では送らない・接続方法は別PR（最初は手動/単発 dispatch→自動化は後段）。PR分割 F4a(docs)→F4b(AK import)→F4c(KI import)→F4d(dispatch/import 接続)→F5(表示)。**docs-only・実装/shared 保存/dispatch/AK・KI 変更/workflow 変更なし。scripts/nankan/dry-run-aggregate-entries.mjs・save-entries.mjs・entries-manager.astro・JRA horseHistories・recentHorseHistories・featureScores・AI・印・買い目・穴馬・dark-horse.mjs 変更なし**。
- 2026-06-11: **PR-F3c：南関 entries 全レース集約の opt-in 保存を実装（§29.10 追記）**。`scripts/nankan/dry-run-aggregate-entries.mjs` に **二段 opt-in 保存**（`--push`＝計画/token 不使用・GET/PUT なし、`--push --execute`＝実 PUT）を追加。保存対象は **full venue JSON のみ**（`totalRaces>1` / `races.length>1` / `sourceMeta.races.length===races.length`・raceNumber 昇順一意・horses 空なし・record 0埋めなし・schema PASS）。**R01-only / partial / `--max` は保存不可**。既存ファイルは create-only・`--force` 時のみ update（R01-only→full venue 置換は `--force` 必須・既存 totalRaces を明示）。保存 helper は **既存 single race `dry-run-fetch-entries-page.mjs` を変更せず self-contained に複製**（契約値 F3 同一）。**token 値非表示・repository_dispatch なし**。確認: full dry-run（大井12レース・schema OK・exit0）/ `--push` 計画（guard PASS・token 不使用）/ negative（totalRaces=1・partial・shared `--out`・dup・0埋め・sourceMeta不一致＝全 NG/exit1）。**`--push --execute` は本 PR で未実行**。**shared 保存なし／実 PUT なし／dispatch なし／AK・KI・workflow・save-entries.mjs・entries-manager.astro・JRA horseHistories・featureScores・AI・印・買い目・穴馬・dark-horse.mjs 変更なし／R01-only 上書きなし**。
- 2026-06-11: **PR-F3b：南関 entries 全レース集約 dry-run を実装（§29.9 追記）**。新規 `scripts/nankan/dry-run-aggregate-entries.mjs`。`--program-url`（program/{14桁}.do から R01〜R12 列挙）／`--urls` fallback／全 race を低負荷で順次取得 → 既存 mapper で parsedResult(totalRaces=1) → **venue 単位 parsedResult に集約**（date/jyo2 混在・raceNumber 重複・program URL数≠成功数・1 race 失敗は error／`--allow-partial` なし）→ 既存 validator 検証。`races[]` 本体に取得メタを混ぜず **`sourceMeta.races[]`** に race 来歴を集約。**既定保存なし／token 不読み込み／shared PUT なし／repository_dispatch なし**（save 経路を持たない・新規スクリプトで F3 単発保存経路と分離）。opt-in 保存は PR-F3c。実 dry-run＝大井 `20260610200403` で **totalRaces=12・156頭・record 全 null・recent 100%・schema OK（error0/warn173）・exit0**。**shared/AK/KI/workflow/save-entries.mjs/entries-manager.astro/JRA horseHistories/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし。R01-only ファイル上書きなし・`--push --execute` なし**。
- 2026-06-11: **PR-F3a：1会場=全レース集約契約を docs 固定（§29 新設・§27.6 更新）**。F3 単発保存は 1 URL=1 race（R01のみ・`2026-06-10-OOI.json` totalRaces=1）。実運用は **1 venue=全レース入り JSON**（totalRaces=races.length・raceNumber昇順・1日複数venueは別JSON）。全レースURLは **`program/{14桁}.do`** から取得可（R01〜R12 リンク確認）。CLI＝**`--program-url` 推奨／`--urls` fallback／`--date --venue` 単独自動解決は入れない**（raceID の kai2/nichi2 が date+venue だけでは確定不可・jyo2 は venue 由来）。結合契約＝date/venue/venueCode/category 一致必須・races[0] を raceNumber 昇順結合・重複/horses空/取りこぼし(program URL数≠成功数)は error。sourceMeta は venue 単位（auto/uma_shosai/recordSourced:false/recordCoverage:0%/missingRecordReason）＋ **`sourceMeta.races[]`** に race 来歴（raceNumber/sourceUrl/finalUrl/status/bytes/warningsCount/recentRacesCoverage）・races[] 本体に取得メタを混ぜない。失敗時＝1 race でも失敗なら **venue 全体保存しない**（部分保存・`--allow-partial` 入れない）。**R01-only（uma_shosai かつ totalRaces=1）は F4 import 対象外**・full venue で `--force` 置換が必要・AK/KI import 側も totalRaces=1 auto/uma_shosai は import スキップ候補。PR分割 F3a(docs)→F3b(aggregator dry-run)→F3c(集約 opt-in保存)→F4(import)→F5(表示)。**docs-only・実装/実取得/保存なし。shared/AK/KI/workflow/scripts/entries-manager.astro/save-entries.mjs/JRA horseHistories/recentHorseHistories/featureScores/AI/印/買い目/穴馬/dark-horse.mjs 変更なし。R01-only ファイル上書きなし**。
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
