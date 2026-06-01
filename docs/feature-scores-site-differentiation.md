# Feature Scores サイト差別化方針（KI vs AK）

最終更新: 2026-06-01
関連: [feature-scores-jra-progress.md](feature-scores-jra-progress.md)

> ## ✅ JRA は実装・本番反映・確認まで **完了**（2026-06-01）
> KI=6項目詳細（#19/#20/#21）/ AK=3項目要約（#50 premium・#51 free）。
> premium・free 両JRAで 安定性 / 能力上位性 / 展開利 の3項目が本番表示、6項目名は非表示を実測確認済み。
> **AK を KI と同じ6項目・同じ値に戻さないこと。** 詳細・完了PR・禁止事項は
> [feature-scores-jra-progress.md](feature-scores-jra-progress.md) を参照。南関は別設計（未着手）。

## 方針
- **KI（keiba-intelligence）と AK（analytics-keiba）で、同じ 6項目・同じ値を「そのまま」表示しない。**
- 同じ素材を同じ見せ方で出すと 2 サイトに分ける意味が薄れる。提供価値を分けるため、
  **同一の正本素材から、サイトごとに役割の違う表示**を作る。

## shared featureScores の役割
- **6項目の正本（素材データ）**。`keiba-data-shared` の `{cat}/featureScores/...` に保存。
- 6項目: Speed Index / Stamina Rating / Form Trend / Track Compatibility /
  Distance Fitness / Jockey Factor（各 `{value(0〜100整数), rank, confidence, basisRaces}`）。
- 「KI が正しい / AK が正しい」ではなく、**両サイトとも同じ正本から作る別用途の値**。

## KI の役割（AI 詳細分析）
- shared featureScores の **6項目をそのまま詳細表示**する。
- Speed Index / Stamina Rating / Form Trend / Track Compatibility / Distance Fitness / Jockey Factor を個別に見せる。
- 実装済み（PR #20 premium / #21 free）。

## AK の役割（買い目判断向けの要約評価）
- shared featureScores の **6項目をそのまま表示しない**。
- 6項目から **AK 専用の 3項目へ派生変換**して表示する。
- 既存 3項目 UI（**安定性 / 能力上位性 / 展開利**）を活かす。
- ただし値は **旧 `computeImportance` の固定的な値ではなく**、featureScores 6項目から **AK 専用に再計算**する。

## AK 派生案（暫定）
6項目の `value`(0〜100) から算出。結果も 0〜100 整数。

| AK 3項目 | 派生式 |
|---|---|
| 安定性 | Form Trend 50% + Stamina Rating 25% + Jockey Factor 25% |
| 能力上位性 | Speed Index 45% + Distance Fitness 30% + Track Compatibility 25% |
| 展開利 | Track Compatibility 40% + Distance Fitness 30% + Form Trend 30% |

- null 取り扱い（設計案）: 構成要素のうち null の項目は **重みを除いて残りで再正規化**して算出。
  全構成要素が null のときだけ、その AK 項目を「データ不足」とする（要承認）。

## 説明方針
- **KI**: 「AI 内部の 6 要素を詳細表示」。Speed Index 等の個別値を説明する。
- **AK**: 「6 要素を買い目判断向けに 3 項目へ要約」。Speed Index 等の個別値は**そのまま説明しない**。
  安定性 / 能力上位性 / 展開利 という買い目判断向けの言葉で説明する。
- AK の値は KI と**競合する値ではなく**、shared featureScores から派生した**要約値**。
- これにより「どちらが正しいか分からない」「同じ馬でサイトごとに説明が食い違う」問題を、
  **役割の違い**として整理する。

## 禁止事項
- AK に KI と同じ 6項目・同じ値をそのまま表示しない。
- `featureScores.js` を変更しない。
- `generateAdvancedMetrics` の fallback を使わない。
- 旧 50.0 固定値を復活させない。
- `computeImportance` を雑に変更しない（AK 3項目 fallback の生成源・他ページも使用）。
- `HorseMainCard` / `RaceHorseSection` を安易に触らない（南関 / slug が使用）。
- 南関に影響させない。
- KI に影響させない。
- AI 総合指数・印・買い目・予想本文・過去走表示を変更しない。

## 影響範囲の閉じ込め
- shared featureScores は共通正本（両サイト共用）。
- KI は既存 6項目表示を維持。
- AK にだけ **専用の派生関数**を作る（新規 AK 専用モジュール推奨。共通受け皿 loadFeatureScores.js は読むだけ）。
- 影響を **AK の JRA 対象ページ**に閉じる（premium → 確認後 free）。
