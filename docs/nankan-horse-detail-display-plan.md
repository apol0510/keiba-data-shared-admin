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
取得元 **nankankeiba.com `uma_info` が要許諾**のため保留中
（[nankan-horse-histories-detail-contract.md](nankan-horse-histories-detail-contract.md) §12.10）。
本節は、その保留中に **「既存データでできる範囲」の南関馬詳細表示**スコープを docs で固定する契約節である。
**docs-only・実装/取得/スクレイプ/generator/dry-run なし。** AK/KI への実装は本節を前提に PR-E1/E2 で別途判断する。

### 23.1 現在地
- **全履歴 `history[]` は `uma_info` 要許諾のため保留**（PR-D2 / generator / dry-run / 自動取得に進まない）。
- **keiba.go.jp `HorseMarkInfo` は `/KeibaWeb/DataRoom/` robots Disallow により対象外**。
- **entries は全履歴の正本ではなく補完源**（`recentRaces` 最大5走）。
- **B方針＝既存データでできる範囲の表示に限定する**。

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
- **recentHorseHistories が無い日**: racebook `pastRaces` 3〜4走にフォールバック。
- **entries も recentHorseHistories も無い日**: **既存の現行表示を維持**。**空枠を出さない・推測値を出さない**。

### 23.7 entries 運用再開との関係
- entries の **通算/条件別/血統拡張を実用表示するには、`entries-manager` 手作業コピペ運用の再開が前提**。
- 運用を再開しない場合、実装しても **過去 7 ファイル分だけの限定表示**にとどまる。
- **entries 運用再開は別の運用判断**（必要なら別途 runbook / 運用docs）。
- **自動化は `uma_info` 許諾確認なしに行わない**。

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

- 2026-06-05: 初版作成。Phase A〜D 整理、read-only 監査結果（recentHorseHistories vs JRA horseHistories、AK/KI 表示箇所、feature 非接続）を反映。
- 2026-06-11: **Phase B-1 暫定表示スコープを追記（§23・PR-E0）**。全履歴 `history[]` 路線は `uma_info` 要許諾で保留中（[nankan-horse-histories-detail-contract.md] §12.10）のため、**既存データでできる範囲の南関馬詳細表示スコープを docs 固定**。表示可能＝基本プロフィール（性齢/父/騎手/斤量/調教師・最新日常時・AK表示済）／entries がある日限定の血統拡張（母父/馬主/生産者/毛色/bestTime）・通算成績（record.total）・条件別成績（record.left/right/venue/distance）／直近走（recentHorseHistories 最大5走 or racebook pastRaces 3〜4走）。表示不可＝全履歴/6走前以降/JRA式全履歴再集計/母名/生年月日/最新日の安定 entries 通算条件別（**entries は 2026-04-07 停止・最新日に無い**）。**カバレッジ制約＝entries 7ファイル・recentHorseHistories backfill 限定・最新日に確実に在るのは racebook/predictions のみ・AK/KI は entries 未取込**。禁止表現（「全履歴」「JRA同等」「直近10走」「horseHistories完全対応」「通算/条件別が全馬常時」と表記しない）。フォールバック（entries 無し日=基本プロフィールのみ・空枠/推測値を出さない・現行表示維持）。entries 運用再開（entries-manager 手作業コピペ）が実用表示の前提・自動化は uma_info 許諾なしにしない。PR分割 PR-E0(docs)→E1(AK)→E2(KI)。**docs-only・1ファイル・実装/取得/スクレイプ/generator/dry-run/scripts/shared/AK/KI/entries-manager.astro/save-entries.mjs 変更なし**。
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
