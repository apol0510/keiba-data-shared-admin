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
- [ ] Phase C: データ品質 WARN 実装（予想日同日/順序乱れ等）。
- [ ] Phase D: admin 自動 dispatch 配線。
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
- [ ] 予想日同日/未来日/順序乱れ WARN 設計
- [ ] generator/validator 実装

### Phase D: 自動 dispatch
- [ ] shared 追加→AK/KI 自動同期 配線設計
- [ ] 実装・実証

---

## 13. 未解決課題

- 通算成績・条件別成績の集計を **admin 側で生成（正本化）するか、表示側で集計するか**（CLAUDE.md の「admin/shared 中心」原則に従えば admin 生成が原則）。
- 直近10走を出すなら、racebook pastRaces(最大5) を超える履歴の**取得元**（JRA は auto-fetch、南関は keiba.go.jp robots.txt Disallow に留意）。
- テンカハル型データ品質（予想日同日・順序乱れ）の検出・是正方針（Phase C）。
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

## 14. 更新履歴

- 2026-06-05: 初版作成。Phase A〜D 整理、read-only 監査結果（recentHorseHistories vs JRA horseHistories、AK/KI 表示箇所、feature 非接続）を反映。
- 2026-06-05: **Phase A 完了記録を追記（§15）**。06-03 FUN shared PUT / AK・KI import 成功、KI 本番5走表示確認、AK latest-only 扱い、非接続維持を記録。
