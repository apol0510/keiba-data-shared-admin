# 南関 Feature Importance 再設計プラン

**作成日**: 2026-06-01
**対象repo**: keiba-data-shared-admin / analytics-keiba / keiba-intelligence / keiba-data-shared
**ステータス**: 設計提案のみ（実装なし）
**前提ドキュメント**: [nankan-past-races-audit.md](nankan-past-races-audit.md)
**関連**: [feature-scores-site-differentiation.md](feature-scores-site-differentiation.md) / [feature-scores-jra-progress.md](feature-scores-jra-progress.md) / [cross-project-safety-rules.md](cross-project-safety-rules.md)

> **大原則**: 南関 Feature Importance の改善より、**過去走データの正本化が先**。
> 欠損だらけのデータの上に重要度を載せても、根拠のない「それらしい数字」になる。
> 正本化（[nankan-past-races-audit.md](nankan-past-races-audit.md) Phase 0〜4）を完了してから着手する。

---

## 1. 現状認識（監査結果）

### AK と KI は別実装（差別化として正常）

| | エンジン | 項目数 | 算出元ファイル |
|---|---|---|---|
| **AK** | `computeImportance` | **3項目**（安定性 / 能力上位性 / 展開利） | `analytics-keiba/astro-site/src/lib/horseEnrichment.js` |
| **KI** | `generateAdvancedMetrics` | **6項目**（Speed / Stamina / Form / Track / Distance / Jockey） | `keiba-intelligence/astro-site/src/utils/featureScores.js` |

- **AK / KI は同じ値・同じ表示ではない。差別化として正常**であり、統一してはいけない（[feature-scores-site-differentiation.md](feature-scores-site-differentiation.md) の方針と整合。「6項目統一案」は撤回済み）。
- 両者とも recentRaces を実参照しており、計算実体はある（「表示だけそれらしく」ではない）。

### AK 3項目（computeImportance）の式（参考）

- **安定性** = recentRaces の3着内率（`0.55 + top3Rate*0.4`）／走歴なければ `pt/400` フォールバック
- **能力上位性** = `pt / 同レース最高pt`
- **展開利** = `last3f` の同レース中央値との相対差（JRA 33-36秒帯 / 南関 38-42秒帯の分布差を吸収するため相対化, 2026-05-16 変更）
- 役割別 CAP（本命85〜補欠74）で 65-85点に変換。**50固定・仮値なし。**

### KI 6項目（generateAdvancedMetrics）の式（参考）

| 項目 | データ使用 | recentRaces 空時 |
|---|---|---|
| Speed Index | recentRaces.slice(0,3) | **50** |
| Stamina Rating | recentRaces.slice(0,4) | **50** |
| Form Trend | recentRaces.slice(0,5) | 0 |
| Track Compatibility | recentRaces 全件（同会場3着内率） | **50** |
| Distance Fitness | recentRaces 全件（同距離帯±200m） | **50** |
| Jockey Factor | horse.role, horse.pt | recentRaces 不要 |

---

## 2. 問題点

1. **KI は recentRaces 欠損時に 50 baseline へ逃げる**（4項目が空配列時に 50 を返す）。
   南関は0〜3走の少走馬が実在する（[nankan-past-races-audit.md](nankan-past-races-audit.md) §2）ため、**6項目バーが 50 で並ぶ「偽の平均的能力」表示**が発生し得る。これが事実上の仮値残留。
2. **展開利（AK）/ Track Compatibility（KI）の根拠が弱い**。
   通過順・馬場状態・人気が構造的に欠落しているため（[nankan-past-races-audit.md](nankan-past-races-audit.md) §2）、展開・脚質に関する指標を実データで支えられていない。
3. **venue に日付が埋め込まれている**（"船橋 5.8"）ため、`Track Compatibility` の会場マッチが誤判定し得る（`raceDate` / `venue` の分離が前提）。
4. **AK / KI で recentRaces の供給経路が異なる**（[nankan-past-races-audit.md](nankan-past-races-audit.md) §1）。共通正本がないまま片方を直すと整合が崩れる。

---

## 3. Feature Importance を作る前に必要な前提条件

[nankan-past-races-audit.md](nankan-past-races-audit.md) のロードマップ Phase 0〜4 が完了していること。具体的には:

- `nankan/recentHorseHistories`（南関専用契約）が設計・整備され、AK / KI が**共通の正本**を読む状態。
- `dataQualityFlags` が各過去走に付与され、欠損を契約として判定可能。
- `raceDate` / `venue` が分離され、会場マッチ・距離適性が正しく計算できる。
- 不足項目（通過順・人気・着差・馬場）が `results` 突合等で可能な範囲まで補完されている。

---

## 4. 再設計の方針（実装は許可後）

> **admin/shared 側を南関過去走データ契約の中心**とし、AK / KI はそれぞれの式で派生する（[cross-project-safety-rules.md](cross-project-safety-rules.md) 準拠）。

1. **50 baseline 退避を `dataQualityFlags` ベースへ置換**（KI）。
   recentRaces 不足や `no-track-condition` / `no-corner` 等のフラグがある場合、**50 で埋めるのをやめ、バー非表示または「データ不足」表記に統一**する。KI には既に recentRaces 0件時の警告ログがある＝素地あり。
2. **AK 3項目 / KI 6項目の差別化は維持**（[feature-scores-site-differentiation.md](feature-scores-site-differentiation.md)）。統一しない。
3. **表示コンポーネント（HorseMainCard / RaceHorseSection / dhc-recent-*）は変更しない**。データ契約の整流で対応する。
4. **片寄せ禁止**: AK の computeImportance か KI の generateAdvancedMetrics いずれか片方だけ直さない。共通正本（recentHorseHistories）の整備とセットで進める。

---

## 5. ロードマップ上の位置づけ

[nankan-past-races-audit.md](nankan-past-races-audit.md) のロードマップにおける本ドキュメントの担当範囲:

| Phase | 担当 |
|---|---|
| Phase 0〜4 | 過去走正本化（[nankan-past-races-audit.md](nankan-past-races-audit.md) 主管） |
| **Phase 5** | **KI の 50 baseline 退避を `dataQualityFlags` ベースに見直す**（本ドキュメント） |
| **Phase 6** | **南関 Feature Importance を再設計**（本ドキュメント） |
| **Phase 7** | **AK / KI 差別化表示へ展開**（本ドキュメント） |

各 Phase はマコさんの明示許可後に着手する。

---

## 6. 危険箇所

- 🔴 **pair-guard / ±1日マージ事故の再来**: 新ソースを racebook と別パスで dispatch すると、取込側の日付マージで前日データ混入（2026-05-24 案件）を再発させ得る。**新規 dispatch を pair-guard ガード外で増やさない。**
- 🟠 **KI の 50 固定が南関の少走馬で表面化**: 新馬・転入直後で 6項目すべて 50 → 偽の「平均的能力」。
- 🟠 **片寄せ修正**: AK か KI 片方だけ直すとサイト間整合が崩れる。
- 🟠 **JRA horseHistories 流用**: surface / trackCondition / 通過順 が南関では別フォーマット。流用すると null だらけの「形だけ」契約になる。
- 🟠 **venue 日付埋込**を正規化せず特徴量に渡すと、会場適性が誤判定。

---

## 7. 禁止事項

- **`featureScores.js` / `computeImportance` / `HorseMainCard` / `RaceHorseSection` を場当たり的に変更しない。**
- **AK だけ、または KI だけに寄せた修正をしない。**
- **表示側だけで場当たり修正しない。**
- **JRA horseHistories を南関にそのまま流用しない。**
- **AI総合指数・印・買い目・予想本文・過去走表示を巻き込まない。**
- **既存 JSON を手作業で補完しない。**
- **`keiba.go.jp` の robots Disallow パスを自動取得しない。**
- **workflow_dispatch / shared への PUT は明示許可なしに実行しない。**

詳細は [cross-project-safety-rules.md](cross-project-safety-rules.md) を参照。
