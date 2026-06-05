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
- [ ] **Phase D-2**: 方式A 最小実装（admin opt-in `--dispatch`・token経路確定後）※未着手

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

## 14. 更新履歴

- 2026-06-05: 初版作成。Phase A〜D 整理、read-only 監査結果（recentHorseHistories vs JRA horseHistories、AK/KI 表示箇所、feature 非接続）を反映。
- 2026-06-05: **Phase A 完了記録を追記（§15）**。06-03 FUN shared PUT / AK・KI import 成功、KI 本番5走表示確認、AK latest-only 扱い、非接続維持を記録。
- 2026-06-05: **Phase C read-only 監査結果 & C-1 validator 強化を追記（§16）**。同日/未来日=FAIL・順序乱れ/重複=WARN を validator に追加、根因2系統（parsePastRaceDate 同日判定・limitRecentRacesToLatest5 早期return）を特定、06-03/06-04=FAIL・06-02/06-05=PASS を実ファイルで検証。generator 根治（C-2）は未着手。
- 2026-06-05: **Phase C-2 generator 根治を追記（§17）**。`parsePastRaceDate` 同月日=前年化（`>=`）・同日/未来日除外フィルタ・常時昇順ソート・件数整合維持を実装。テンカハル/ケイアイメビウスの同月日エントリは実在の前年走と判明（誤年推定）。4日再生成で同日0・未来日0・順序乱れ0・C-1 validator PASS を確認。duplicateDate は racebook 原本由来のため WARN 据え置き。
- 2026-06-05: **Phase C-3〜C-7 完了をチェックリストへ反映（§12）**。横展開（OOI/KAW/URA）・既存 shared 差分監査・shared 上書き PUT（6件 HTTP200）・AK/KI 逐次 dispatch 同期（一括は concurrency cancel→逐次で全12件 PASS）・本番/表示確認（leak0・テンカハル/ケイアイメビウス是正）。
- 2026-06-05: **Phase D-1 設計方針を追記（§18）**。方式A（admin 単発 opt-in dispatch）を基本＋バックフィルは逐次併用。updates 配列/一括 dispatch/concurrency 分割/AK・KI 改修は不採用。Phase C-6 concurrency 事故の原因と逐次解決、最小差分案、token 経路確定の前提を記録。実装は Phase D-2（未着手）。
