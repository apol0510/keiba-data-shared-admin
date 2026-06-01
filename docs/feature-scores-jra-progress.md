# Feature Scores (JRA Feature Importance) 移行進捗

最終更新: 2026-06-01

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

## 未完了
- **analytics-keiba**: UI 切替 未実装。
- **analytics-keiba**: **AK 専用 3項目派生ロジック**の設計（本ドキュメント時点で実装直前設計のみ）。
- **analytics-keiba**: JRA premium / free への反映。
- **analytics-keiba**: 2026-05-31 KYO / TOK の同期は **必要に応じて**実施（現時点では未同期、TOK は 5-24 のみ）。
- 南関は **別設計**（recentRaces ≤4走・nankan-v1。本移行の対象外）。
- Feature Importance UI のデフォルト折りたたみ等の細かい UI 改善は **別件・別PR**。

## 次にやること
1. **AK 専用 3項目派生ロジックを設計**（shared featureScores 6項目 → 安定性 / 能力上位性 / 展開利）。
2. `premium-prediction/jra.astro` から **1ページ単位**で実装検討（本命/対抗/単穴のメインカード importance ブロック L882-897）。
3. **free JRA は premium 確認後**に着手。
4. analytics-keiba 内の **南関・共通コンポーネント（HorseMainCard / RaceHorseSection）・computeImportance には影響させない**。

## 監査で確定した analytics 構造（origin/main）
- premium / free JRA は **HorseMainCard を使わずインライン描画**（共通コンポーネント非経由）。
- premium importance ブロック: `src/pages/premium-prediction/jra.astro` **L882-897**
  （`e.importance`＝`enrichHorse`→`computeImportance` の 3項目、`value`は0〜1で `*100`%表示）。
- minor horses 簡易 3項目: 同 L1038 / L1063-1065（`horse.importance`、当面現状維持）。
- 馬番フィールド = **`horse.horseNumber`**（featureScores のキーと一致）。
- レース番号 = **`race.raceInfo.raceNumber`**。
- 会場 = `race.raceInfo.venue` / `venueInfo.venue`、日付 = `predictionData.date`（複数会場）/ `predictionData.eventInfo.date`（単会場）。
- 受け皿 export: `venueCodeFromName` / `loadFeatureScores` / `getHorseFeatures` / `hasUsableFeatureScores`。
