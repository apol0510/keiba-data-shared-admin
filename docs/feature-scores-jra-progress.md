# Feature Scores (JRA Feature Importance) 移行進捗

最終更新: 2026-06-01

> ## ✅ JRA Feature Importance 改善は **完了**（premium / free 両方 本番反映・確認済み）
> KI=6項目詳細 / AK=3項目要約 の差別化方針で premium・free 両JRAが本番稼働。
> 同じ作業の重複や「AK を KI と同じ6項目表示に戻す」変更はしないこと（§ 今後の禁止事項）。
> 次にやるなら **別件・別PR**（§ 次にやるなら別件）。

## 目的
- JRA Feature Importance 表示の **50.0 固定値をやめ**、`keiba-data-shared` の
  `featureScores`（6項目の正本素材データ）を使った表示へ移行する。
- 6項目: Speed Index / Stamina Rating / Form Trend / Track Compatibility /
  Distance Fitness / Jockey Factor。
- サイト差別化方針は [feature-scores-site-differentiation.md](feature-scores-site-differentiation.md) を参照（**KI=6項目詳細 / AK=3項目要約**）。

## 完了済み
- **keiba-data-shared-admin**: featureScores 生成ロジック（`scripts/build-feature-scores-once.mjs`、
  jra-v1 / nankan-v1、dry-run + `--push --confirm-push=keiba-data-shared`）。
- **keiba-data-shared**: 2026-05-24 TOK featureScores PUT 済み。
- **keiba-data-shared**: 2026-05-31 KYO / TOK featureScores PUT 済み。
- **keiba-intelligence**: 受け皿 PR #19 MERGED（importFeatureScores.js / loadFeatureScores.js / netlify.toml included_files）。
- **keiba-intelligence**: JRA premium UI 切替 PR #20 MERGED（6項目 stored 表示）。
- **keiba-intelligence**: JRA free UI 切替 PR #21 MERGED（6項目 stored 表示）。
- **keiba-intelligence**: 2026-05-31 KYO / TOK を workflow_dispatch で同期済み。
- **keiba-intelligence**: KI 本番で 6項目表示を目視確認済み。
- **analytics-keiba**: 受け皿 PR #49 MERGED（origin/main = b73a49e に
  `src/lib/loadFeatureScores.js` / `scripts/importFeatureScores.js` /
  `src/data/featureScores/jra/2026/05/2026-05-24-TOK.json` 在り）。
- **keiba-data-shared-admin**: 方針 md 作成・**PR #12 MERGED**
  （docs: record JRA featureScores site differentiation policy、squash `2062416433013b7b3369c97efe7c5d79213dd32a`）。
  shared featureScores を **正本素材データ**として扱う方針を固定済み。
- **keiba-intelligence**: KI=6項目詳細表示として **完了済み**（#19/#20/#21、本番確認済み）。
- **analytics-keiba**: AK=6項目をそのまま出さず **AK専用3項目へ要約表示**する方針で確定・実装済み。
  - **premium JRA 対応 PR #50 MERGED**（feat: derive AK JRA premium feature summary from stored featureScores、squash `6dc1b852df16e6ed18157d08cdd02b7010eb69b1`）。
  - **free JRA 対応 PR #51 MERGED**（feat: derive AK JRA free feature summary from stored featureScores、squash `4214990d95369eddda210864ae184166de011c94`）。
  - 新規 `src/lib/akFeatureSummary.js`（AK専用派生）＋ premium/free の importance ブロックを presence 出し分けに変更。
- **analytics-keiba**: 2026-05-31 KYO / TOK featureScores **同期済み**
  （workflow `import-feature-scores-on-dispatch.yml`、auto-import commit **`2480200`** で以下2件を追加）。
  - `astro-site/src/data/featureScores/jra/2026/05/2026-05-31-KYO.json`
  - `astro-site/src/data/featureScores/jra/2026/05/2026-05-31-TOK.json`

## 本番確認結果（2026-06-01・本番HTML実測）
- **premium JRA 本番確認済み** / **free JRA 本番確認済み**（2026-05-31 京都・東京）。
- premium / free 両方で **安定性 / 能力上位性 / 展開利** の3項目表示を確認（各72ブロック＝24R×本命/対抗/単穴）。
- AK側UIに **Speed Index / Stamina Rating / Form Trend / Track Compatibility / Distance Fitness / Jockey Factor の6項目名は出ていない**ことを確認（出現0件）。
- importance 値は **全馬一律50/100固定ではない**（広く分散・`—`だらけでもない）ことを確認。
- **free固有UI / AI予想解説風UI / AI買い目マスクUI / premium誘導 / 無料制限UI は維持**確認済み（locked / pricing / プラン / 登録 / 買い目 / 連下 / 抑え 等が存在）。
- **買い目・印・AI総合指数・予想本文・過去走表示に影響なし**。
- **南関 / KI / admin/shared 実装 / 既存JSON / 予想生成系には影響なし**。

## 確定方針（重要・恒久）
- **KI = shared featureScores 6項目の詳細表示**。
- **AK = shared featureScores 6項目から派生した 3項目要約表示**。
- **AK と KI で同じ6項目・同じ値をそのまま表示しない**。
- **shared featureScores は正本素材データ**。
- AK の3項目は **買い目判断向けの要約指標**。
- 6項目の個別名は **AK UI に直接表示しない**。
- **南関は別設計**であり、今回の JRA 完了範囲には含めない。

## AK 専用3項目 派生式
- 安定性 = Form Trend 50% + Stamina Rating 25% + Jockey Factor 25%
- 能力上位性 = Speed Index 45% + Distance Fitness 30% + Track Compatibility 25%
- 展開利 = Track Compatibility 40% + Distance Fitness 30% + Form Trend 30%

null / 欠損方針:
- 一部欠損は **残りの値で重み再正規化**。
- 全欠損時は **既存 e.importance へ fallback**。
- featureScores由来と既存 e.importance は **二重表示しない**。
- **旧50.0固定 / generateAdvancedMetrics には戻さない**。

## 完了 PR / commit
**keiba-data-shared-admin**
- PR #12 — `docs: record JRA featureScores site differentiation policy` — squash `2062416433013b7b3369c97efe7c5d79213dd32a`

**analytics-keiba**
- PR #50 — `feat: derive AK JRA premium feature summary from stored featureScores` — squash `6dc1b852df16e6ed18157d08cdd02b7010eb69b1`
- featureScores 同期 — `Auto-import: 2026-05-31 featureScores [jra:KYO,TOK]` — commit `2480200`
- PR #51 — `feat: derive AK JRA free feature summary from stored featureScores` — squash `4214990d95369eddda210864ae184166de011c94`

## 今後の禁止事項
- AK に KI と同じ6項目詳細表示を戻さない。
- AK で Speed Index 等の6項目名を直接表示しない。
- AK / KI を同じ値・同じ表示にしない。
- `featureScores.js` を場当たり的に変更しない。
- `computeImportance` を場当たり的に変更しない。
- `HorseMainCard` / `RaceHorseSection` を巻き込まない。
- 南関を JRA と同じ設計で勝手に変更しない。
- AI総合指数・印・買い目・予想本文・過去走表示を巻き込まない。
- 既存JSONを手作業で変更しない。
- shared への追加 PUT や workflow_dispatch は **明示許可なしに実行しない**。

## 次にやるなら別件（別PR）
今回の JRA Feature Importance 改善は **完了**。次にやる場合は以下を別件・別PRで扱う:
- Feature Importance UI のデフォルト折りたたみ。
- 「特徴量重要度」という見出し名の改善。
- 南関用の別設計。
- 古い作業ブランチ整理（`feat/feature-scores-receiver` 等）。
- `check:prediction-integrity` の「検査対象0件」問題の別監査。
- **featureScores 高得点集中の緩和**: `scaleFeature` の傾きを 18→12〜14 に弱める（→ § 監査: featureScores 高得点集中の原因（2026-06-06 TOK）参照）。**※全featureScores値が変わる＝表示回帰必須のため別タスク（半自動pipelineには未統合）**。

### 半自動パイプライン統合（PR #64〜#70・2026-06-06/07）
JRA予想更新後の horseHistories → featureScores → AK/KI import を 1コマンド化（`scripts/jra/run-jra-feature-pipeline.mjs`）。featureScores 側の関連:
- `build-feature-scores-once.mjs` を **track化（PR #64）**、**excludeDate 実装（PR #65）**（過去日backfillの look-ahead leak 防止・同日fetchデータには影響ゼロを byte一致で実証）。
- pipeline では featureScores を **dry-run検査 → create-only事前確認 → `--push-feature-scores`（PR #69）→ AK/KI workflow_dispatch import（PR #70）**。
- **運用手順の正は [scripts/jra/README.md](../scripts/jra/README.md) の「🔁 JRA featureScores 半自動パイプライン」節**。horseHistories側は [jra-horse-histories-operation.md](jra-horse-histories-operation.md) §15。

## 監査: featureScores 高得点集中の原因（2026-06-06 TOK・read-only）

KI画面で一部の馬の6項目が90〜96に並んで「強すぎる」表示に見える件を read-only 監査した結果。
**結論: 本番データ破損ではなく、スケーリング設計に起因する表示上の過大感**。今回は記録のみ。

### データ健全性（破損ではない）
- 06-06 TOK（171頭）で **NaN / undefined / 50固定値 / 全頭同値（分散0）はいずれも0件**。
- 各項目の平均は約55.8・中央値49〜55 で、分布全体は設計中心56どおり破綻していない。
- 6項目すべて≥90 = **1頭のみ**、≥5項目が≥90 = 3頭、≥5項目が≥95 = 0頭。張り付きは**各レースの抜けた1頭に限定**。

### 原因1: スケーリングの傾きと上限クランプ
- `scripts/build-feature-scores-once.mjs` の `scaleFeature`:
  `value = clamp(round(56 + 18z), 12, 96)`（z = **レース内 z-score**）。
- 96到達条件は `56 + 18z ≥ 95.5` → **z ≥ 約2.19**。
- percentile変換でもグローバル min/max 正規化でもなく、「1位なら一律96」でもない（分離度で変わる）。
- JRAは1レース**12〜16頭の小サンプル**のため、抜けた1頭の z は容易に 2.2〜3.5 に達し、複数項目で**上限96に張り付きやすい**。

### 原因2: 過去走系5項目が高相関（材料の使い回し）
- 171頭(欠損なし134頭)のピアソン相関で、過去走系5項目（speedIndex / staminaRating / formTrend / trackCompatibility / distanceFitness）の**平均相関 ≈ 0.70**。
- 特に **speedIndex ↔ distanceFitness ≈ 0.91**、speedIndex ↔ formTrend ≈ 0.88。
- 5項目はいずれも着順(finish)を主材料にしているため、強い馬は5項目同時に最上位 z になり、全パネルが90〜96に揃う。
- 6項目は完全に独立した6軸というより、**着順履歴を重み替えした表示**に近い。
- jockeyFactor は assignment / totalScore 由来で**半独立**（過去走系との平均相関 ≈ 0.59）だが、assignment 自体が過去成績と連動するため完全独立ではない。

### 評価と修正方針（今回は実装しない）
- 値そのものは「レース内で最強の馬」を正しく指しており誤りではない。問題は**6軸の独立性が見かけより低い**こと。
- ユーザー目線では、6項目が90〜96に並ぶと強すぎる表示に見える。
- **修正第一候補（最小・低リスク）**: `scaleFeature` の傾きを **18 → 12〜14 程度に弱める**。上位馬を84〜90帯に収め飽和を緩和。中心56・null設計は不変。
- 第二候補: z-score を percentile/順位ベース変換へ（影響大）。
- 第三候補（根治）: 過去走系の入力を脱相関（`rawXxxJra` 群の修正）。**raw全面修正は影響が大きいため別タスク**。
- 今回は記録のみ。**featureScores 再生成・shared PUT・dispatch・AK/KI 表示変更は行わない**。

## 監査で確定した analytics 構造（origin/main）
- premium / free JRA は **HorseMainCard を使わずインライン描画**（共通コンポーネント非経由）。
- premium importance ブロック: `src/pages/premium-prediction/jra.astro` **L882-897**
  （`e.importance`＝`enrichHorse`→`computeImportance` の 3項目、`value`は0〜1で `*100`%表示）。
- minor horses 簡易 3項目: 同 L1038 / L1063-1065（`horse.importance`、当面現状維持）。
- 馬番フィールド = **`horse.horseNumber`**（featureScores のキーと一致）。
- レース番号 = **`race.raceInfo.raceNumber`**。
- 会場 = `race.raceInfo.venue` / `venueInfo.venue`、日付 = `predictionData.date`（複数会場）/ `predictionData.eventInfo.date`（単会場）。
- 受け皿 export: `venueCodeFromName` / `loadFeatureScores` / `getHorseFeatures` / `hasUsableFeatureScores`。
