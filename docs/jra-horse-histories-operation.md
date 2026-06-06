# 中央JRA horseHistories 運用 / 5 走表示 / 馬名クリック詳細

**最終更新**: 2026-05-29
**対象リポジトリ**: `keiba-data-shared-admin` / `keiba-data-shared` / `keiba-intelligence` / `analytics-keiba`
**読み手**: Claude（クロちゃん）・ChatGPT・本プロジェクト群を触る全エンジニア
**関連文書**: [docs/cross-project-safety-rules.md](./cross-project-safety-rules.md)

---

## 1. 目的

- 中央JRAで **admin 保存後に最大 5 走表示を成立させる** 運用フローを明文化する。
- `keiba-intelligence.jp` の中央JRAページで、**馬名クリックにより過去走詳細を表示**できるようにする（事前取り込み済み JSON 参照、外部 fetch なし）。
- **AI 指数 / 印 / 買い目 / 特徴量重要度は今後も `/admin/race-data-importer` 由来を「正」とする**。
- horseHistories は **表示専用・参考情報** として扱い、計算系に混ぜない。

---

## 2. 重要な前提

- admin 保存だけでは中央JRAの 5 走表示は完成しない。
- racebook / computer とは別に **horseHistories JSON が必要**。
- horseHistories は **JRA 公式の各開催場 1R URL を起点**に取得する。
- 各馬ページ URL を人間が 1 頭ずつ用意する必要はない。
- 各開催場の 1R URL だけを `urls.txt` に入れれば、スクリプトが同会場の **全レース (R1-R12) を巡回し、各馬の `accessU.html` URL を抽出して履歴を取得する**。
- 馬名クリック時に **JRA 公式へリアルタイム fetch しない**。
- 事前に取得・保存済みの horseHistories JSON を **サイト内で参照**する。
- 中央JRAと南関は別フロー。**南関は horseHistories 対象外**で、`recentRaces` 最大 4 走を維持する。

---

## 3. 検証済み事実（2026-05-24）

東京 / 京都 / 新潟で以下を確認済み:

- racebook / computer / horseHistories が **全揃い**。
- analytics-keiba / keiba-intelligence に horseHistories は **byte-perfect** で取り込み済み。
- `displayDistance` / `surface` は **97〜99% 台で充足**。
- 表示側は `history` から **当日除外して `slice(0, 5)`**。
- 5 走表示可能な馬は **355/526 頭 (67.5%)**。
- 4 走以下の馬は出走履歴自体が 4 走以下のため仕様通り。
- AI 指数・印・買い目・特徴量重要度には **影響なし**。

---

## 4. 正しい運用フロー

```
1. PDF → XML 化
2. admin で racebook / computer 保存
3. JRA 公式で各開催場の 1R URL を手動コピー
4. urls.txt に各場 1R URL を保存
5. auto-fetch-horse-histories.mjs で dry-run
6. 出力 JSON の品質確認
7. ユーザー許可後、keiba-data-shared へ push
8. ユーザー許可後、horse-histories-updated dispatch
9. analytics-keiba / keiba-intelligence の workflow 成功確認
10. Netlify 再ビルド確認
11. 本番で 5 走表示確認
```

各ステップは **マコさん許可がある場合のみ**進める。クロちゃん / ChatGPT は許可なく次段階に進まない。

---

## 5. 使用するスクリプト

### 中央JRA の 5 走表示用

```
scripts/jra/auto-fetch-horse-histories.mjs
```

⚠️ `auto-fetch-jra-official.mjs`（結果 + 払戻 取得用）と **混同しない**。

### dry-run（push / dispatch なし）

```bash
node scripts/jra/auto-fetch-horse-histories.mjs --urls=urls.txt
```

- 出力先: `tmp/jra-horse-histories/{YYYY-MM-DD}-{VENUE_CODE}.json`
- keiba-data-shared には書き込まない / 両 repo にも通知しない

### 本番反映（push + dispatch）

```bash
export GITHUB_TOKEN_KEIBA_DATA_SHARED=github_pat_xxx
export KEIBA_INTELLIGENCE_TOKEN=github_pat_xxx
export ANALYTICS_KEIBA_TOKEN=github_pat_xxx

node scripts/jra/auto-fetch-horse-histories.mjs --urls=urls.txt \
  --push --confirm-push=keiba-data-shared \
  --dispatch --confirm-dispatch=horse-histories-updated
```

---

## 6. 安全装置

| チェック | 失敗時挙動 |
|---|---|
| `--push` 指定時に `--confirm-push=keiba-data-shared` 不一致 | `exit 3` |
| `--dispatch` 指定時に `--confirm-dispatch=horse-histories-updated` 不一致 | `exit 3` |
| `--dispatch` を `--push` なしで指定 | `exit 3`（受信側 404 防止）|
| `GITHUB_TOKEN_KEIBA_DATA_SHARED` 未設定で `--push` | `exit 3`（`GITHUB_TOKEN` フォールバック禁止）|
| `KEIBA_INTELLIGENCE_TOKEN` または `ANALYTICS_KEIBA_TOKEN` 不足で `--dispatch` | `exit 3`（**両方必須**）|
| push 件数 0 で `--dispatch` | `exit 4` |

すべて **fetch 開始前にチェック** される。9 分 fetch 後に落ちる UX は発生しない。

---

## 7. keiba-data-shared push 前の注意

`auto-fetch-horse-histories.mjs` は **GitHub Contents API 経由で push** するため、ローカル git 状態とは独立して push 自体は成功する。ただし整合性のため、push 前に以下を確認する。

```bash
cd /Users/apolon/Projects/keiba-data-shared
git status -sb
git fetch origin main
git rev-list --left-right --count HEAD...origin/main   # ahead / behind を確認
```

- **`behind` のまま無計画に push しない**。
- `pull` / `reset` / `rebase` 等を **勝手に実行しない**。必ず状況報告してマコさん判断を仰ぐ。
- working tree が clean で `ahead=0, behind>0` のみの場合は `git pull --ff-only origin main` が候補（rebase 禁止）。

---

## 8. 馬名クリック過去走詳細

### 目的

`keiba-intelligence.jp` 中央JRAページで、馬名クリック時に過去走詳細を表示する。

### 検証スコープ（重要）

- 馬名クリック詳細表示は、**まず keiba-intelligence 中央JRA で検証する**。
- ただし、データ契約は **analytics-keiba にも転用できる形**にし、**keiba-intelligence だけに寄せた実装にしない**。
- 具体的には:
  - データ源は両 repo 共通の `astro-site/src/data/horseHistories/jra/YYYY/MM/{date}-{VENUE}.json`
  - 表示変換ロジックは両 repo の `loadHorseHistoriesJra.js` と同じ思想を維持（`history` 優先 → 当日除外 → slice）
  - 注入先フィールド名 / UI コンポーネント構造を repo 間で揃える
  - keiba-intelligence でしか動かない fetch / 突合キー / 補完を入れない
- Phase 1 で KI の運用感を確認後、Phase 2 で analytics-keiba に同じ契約で展開する。

### データ源

- `horseHistories.history`（取り込み済み JSON、当日レース除外）
- 基本情報（父など）は `racebook.horses[].sire` 等を併用

### 表示方式

- **アコーディオン（`<details><summary>`）を推奨**（既存パターン流用、JS 不要、SSG / SSR 両方で安定）
- モーダルは将来の集計表示拡張時に再検討
- 通常表示は最大 5 走、詳細表示は最大 10〜20 走または全履歴

### 表示候補（過去走 1 行あたり）

| 項目 | フィールド | 出典 |
|---|---|---|
| 日付 | `date` | horseHistories |
| 競馬場 | `venue` | horseHistories |
| レース名 | `raceName` | horseHistories |
| 芝/ダ + 距離 | `displayDistance`（fallback: `${distanceMeters}m`）| horseHistories |
| 馬場 | `trackCondition` | horseHistories |
| 頭数 | `entryCount` | horseHistories |
| 人気 | `popularity` | horseHistories |
| 着順 | `finish` | horseHistories |
| 騎手 | `jockey` | horseHistories |
| 斤量 | `carryWeight` | horseHistories |
| 馬体重 | `bodyWeight` | horseHistories |
| タイム | `time` | horseHistories |
| 1着馬 | `winnerName` | horseHistories |
| 上がり3F | （現データに無し）| 将来 parser 改善で追加 |

### 基本情報

| 項目 | 出典 | 取得可否 |
|---|---|---|
| 馬名 | racebook.horses[].name / horseHistories.horseName | ✅ |
| 性齢 | racebook.horses[].sexAge | ⚠️ 一部 None あり |
| 父 | racebook.horses[].sire | ✅ |
| 母 | racebook.horses[].dam | ❌ 全頭 None（データ源未取得）|
| 母父 | racebook.horses[].damSire | ❌ 未取得 |
| 調教師 | racebook.horses[].trainer | ✅ |
| 馬主 | （未取得）| ❌ |
| 生産者 | （未取得）| ❌ |

### 馬との紐づけ

- 現状の突合キーは **`horseName` のみ**。
- racebook / computer 側に `horseId` / `umacd` は全頭ゼロ充足。
- venue 単位で読み込むため、同名衝突は実用上ほぼ起きない。
- 将来的に `horseId` を racebook に追加するのは別タスク（race-data-importer 改修）。

### 文言ルール

✅ OK:
- 「過去走データ」「馬詳細」「履歴ベース参考」「過去走 / 直近傾向（参考）」

❌ NG:
- 「AI 評価の根拠」「本命理由」「この馬が選ばれた理由」「印の理由」

→ horseHistories は **事実ベースの履歴**であって、AI 指数・印の根拠ではない。

---

## 9. 過去走分析スコア（後回し）

現時点では実装しない。実装する場合も以下を厳守する。

### 設計方針

- AI 指数・印・買い目の根拠として扱わない。
- 表示する過去走は最大 5 走でよい。
- **分析には `horseHistories.history` 全体**を使う（5 走だけだと印とズレる印象を与えやすい）。
- 近走傾向は直近 5 走中心、距離適性 / コース適性は全履歴から該当条件を抽出。

### 表示文言

「過去走分析」「近走傾向: 良好 / 標準 / 不安」「距離適性: 合う / 標準 / 要確認」など、**「参考」「履歴ベース」**を明示する。

### 優先順位

1. **Phase 1**: 馬名クリック → 過去走詳細表示（KI 中央JRA のみ）
2. **Phase 2**: analytics-keiba へ転用 / 上がり3F parser 改善 / horseId 紐づけ
3. **Phase 3**: 過去走分析スコア（任意）

---

## 10. 禁止事項

- AI 指数・印・買い目を触らない。
- 特徴量重要度の既存ロジックを触らない。
- 予想ロジックに horseHistories の値を混ぜない。
- 馬名クリック時に JRA 公式へリアルタイム fetch しない。
- `predictions` / `results` / `archiveResults` / `horseHistories` JSON を **手作業で変更しない**。
- analytics-keiba だけ / keiba-intelligence だけに寄せた修正をしない。
- 古い `urls.txt` で勝手に dry-run しない。
- URL を推測しない。CHK 値を推測しない。
- commit / push / PR / dispatch を **マコさん許可なしで実行しない**。
- **push のみを先行実行して、後から push+dispatch を再実行する2回 push 運用をしない**（§ 13 参照）。
- **本番当日に dispatch 単独機能の新規実装をしない**（必要なら別タスク化）。
- **JSON を手作業で直接改変しない**（admin/shared 経由でのみ更新）。
- 中央JRA horseHistories 作業の運用フローでは、本ドキュメント § 13 の停止ポイント 7 つを必ず守る。

---

## 11. 既知の注意点

### 函館コード矛盾（要将来対応）

| 場所 | 函館コード |
|---|---|
| `scripts/jra/auto-fetch-horse-histories.mjs` の JYO_MAP | **HAK** |
| `src/lib/constants/venue-codes.ts` | **HKD** |
| analytics-keiba `importHorseHistoriesJra.js` の `ALL_JRA_VENUES` | **HKD** |
| keiba-intelligence `importHorseHistoriesJra.js` 推定 | **HKD** |

→ **6 月以降に函館開催が入る前に整合作業が必要**。別タスクで扱う。
5/30-31 の対象場（東京 / 京都 / 新潟 / 中山）には影響なし。

### 南関とは混同しない

- 南関は horseHistories **対象外**。`recentRaces` 最大 4 走を維持する。
- 南関の表示順は repo によって異なる:
  - keiba-intelligence: `slice(0, 4)`（importPrediction.js が `slice(-5).reverse()` で新→古保管）
  - analytics-keiba: `slice(-4).reverse()`（importPrediction.js が `slice(0, 5)` で古→新保管）
- **南関に reverse 統一などの修正をしない**。両 repo の保管方向が違うため。

---

## 12. 次に実装へ進む場合

1. **まず本仕様書を確認**。
2. 現在の git 状態確認（3 repo すべて）。
3. 影響ファイル確認（実装前に列挙して報告）。
4. dry-run 確認（実 fetch を伴うものはマコさん許可必須）。
5. 小さい PR に分ける（複数機能を 1 PR に混ぜない）。
6. **予想ロジックには触れない**。
7. **表示専用の変更から始める**。
8. analytics-keiba / keiba-intelligence の **両方に同じデータ契約**で展開する設計にする。
9. 馬名クリック詳細表示は **まず keiba-intelligence 中央JRA で検証する**。ただし **データ契約は analytics-keiba にも転用できる形**にし、片方だけに寄せた実装にしない。

---

## 13. 1 パス運用合意（A方針）と停止ポイント（2026-05-29 確定）

### 13.1 背景

§ 4「正しい運用フロー」を中央JRA本番反映時の実行ルールとして具体化したもの。
2026-05-29 に中央JRA horseHistories の当日運用方針として以下を確定。
今後の中央JRA過去5走作業すべてに適用する。

### 13.2 admin 保存の到達範囲

**中央JRAの過去5走は admin 保存だけでは完成しない**。

| 工程 | 完了するもの |
|---|---|
| admin 保存（race-data-importer + computer-manager） | `racebook` と `computer prediction` まで |
| **horseHistories** | 別工程（§ 5 の `auto-fetch-horse-histories.mjs`）で生成・shared に保管・dispatch |

admin 保存のみで「過去5走表示が完成した」と判断してはならない。

### 13.3 作業順（固定・1 パス運用）

| # | 工程 |
|---|---|
| 1 | dry-run のみ実行（`--urls=urls.txt` のみ、token env も付けない） |
| 2 | dry-run 結果検査（stats / failures / 距離・芝ダ・開催・着順カバレッジ） |
| 3 | 問題がなければ **次回実行で `--push --confirm-push=keiba-data-shared --dispatch --confirm-dispatch=horse-histories-updated` を同時指定**（1 回の実行で push と dispatch を同時指定する） |
| 4 | push+dispatch 完了後、shared から実ファイルを再取得して検査 |
| 5 | analytics-keiba / keiba-intelligence の workflow 成否確認 |
| 6 | 両 repo に horseHistories が取り込まれ、shared と byte-perfect 一致確認 |
| 7 | Netlify 再ビルド確認（手動押下しない、自動ビルドのみ） |
| 8 | 本番表示確認 |

### 13.4 やらないこと

- push のみを先に実行 → 後で push+dispatch を再実行する **2 回 push 運用**
- 本番当日に **dispatch 単独機能の新規実装**
- JSON を手作業で直接改変
- AI 指数 / 印 / 買い目 / 特徴量重要度 / 予想ロジックへの変更
- 南関への適用（horseHistories 対象外）
- analytics-keiba と keiba-intelligence の **UI 統一**（UI 差は正常、片寄せ修正は禁止）
- **函館 HAK / HKD 問題の修正**（§ 11.1 の通り別タスク扱い）
- 手動 Netlify 再ビルド
- 上記以外の commit / push / dispatch

### 13.5 停止ポイント 7 つ（必ず停止し、明示許可を待つ）

| # | タイミング | 報告内容 |
|---|---|---|
| 1 | 出馬表公開確認後 | 対象日の開催場と会場キー |
| 2 | urls.txt 作成後 | 全 URL が対象日かつ各場 R1 であることの確認結果 |
| 3 | dry-run 実行前 | 実行予定コマンド |
| 4 | dry-run 完了後 | stats / failures / 距離・芝ダ・開催・着順カバレッジ |
| 5 | push+dispatch 実行前 | 実行予定コマンド・対象会場・push 先・dispatch 先 |
| 6 | push+dispatch 完了後 | shared 反映・両 repo workflow・両 repo 取り込み状況 |
| 7 | Netlify ビルド確認後 | 本番表示確認 URL と確認項目 |

各停止ポイントで **マコさんの明示許可が出るまで次に進まない**。許可なしで先行実行しない。

### 13.6 関連

- 本フローは § 4「正しい運用フロー」を A 方針（1 パス運用）で具体化したもの。両者は同じ手順を別粒度で記述しており、矛盾はない。
- 函館 HAK/HKD 整合は本フローでは触らず、§ 11.1 の別タスクで扱う。
- pastRaces 等の共通契約は [docs/cross-project-safety-rules.md](./cross-project-safety-rules.md) を参照。

---

## 14. 過去日バックフィル運用と featureScores leak 注意（2026-05-30 実績）

### 14.1 背景：2026-05-30 JRA horseHistories 欠落と復旧

2026-05-30 JRA は **racebook / results / predictions が TOK/KYO とも存在していた**が、
**horseHistories だけが shared / AK / KI の3層で欠落**していた（同日の取得が漏れていた）。
このため 2026-05-30 の馬詳細アコーディオン（historyForDetails）が未注入で非表示になっていた。

復旧（2026-06-06 実施・本ドキュメント § 4 / § 13 のフロー準拠、案B = push のみ + workflow_dispatch import）:

- `auto-fetch-horse-histories.mjs --urls=urls.txt`（東京R1 / 京都R1・20260530）で dry-run → push。
- shared に **create**（上書きでない）:
  - `jra/horseHistories/2026/05/2026-05-30-TOK.json`（**179頭**・commit `115b7c0`）
  - `jra/horseHistories/2026/05/2026-05-30-KYO.json`（**182頭**・commit `9ac0ec9`）
- dispatch token 不在のため repository_dispatch は使わず、AK/KI の
  `import-horse-histories-on-dispatch.yml` を **workflow_dispatch**（date=2026-05-30 / venues=TOK,KYO）で import。
- AK/KI とも shared と JSON 内容一致・import success。
- **KI 本番（`/free-prediction/jra/2026-05-30`）で馬詳細アコーディオン復旧を確認**：
  通算成績 / 勝率 / 連対率 / 条件別成績（芝・ダ・同距離・同会場）/ 競走成績（過去走）が表示。
  内部キー漏れなし・表示崩れなし。

### 14.2 過去日バックフィルの注意：raw history に「当日」が含まれる

**過去日をバックフィルした horseHistories の raw `history` には、JRA 公式に結果が掲載済みのため、
当日（そのレース日）のレースが含まれる場合がある**。

- 例: 2026-05-30 backfill hh は当日（05-30）行を **全馬含む**（TOK 179/179・KYO 182/182）。
  対して **同日取得**の 05-31 / 06-06 は当日行を含まない（取得時点で結果未掲載のため）。
- **表示側は問題なし**：`loadHorseHistoriesJra.js` の `pickHistoryForDetails(entry, excludeDate)` /
  `pickRecentRacesFromHistories(entry, excludeDate)` が **excludeDate（=レース当日）で当日を除外**する設計。
  馬詳細・近5走・条件別集計のいずれも当日を使わない。
- **注意**：**表示側（excludeDate あり）と生成側（後述・excludeDate なし）で当日除外の有無が異なる**。

### 14.3 05-30 featureScores は look-ahead leak 回避のため生成見送り

- `keiba-data-shared-admin/scripts/build-feature-scores-once.mjs` の `normalizeJra` は
  `hhEntry.history` を **全件**使用し、**excludeDate / 当日除外ロジックを持たない**。
- そのため 05-30 のように当日結果を含む backfill hh から featureScores を生成すると、
  **各馬の「05-30 の実着順」を使って 05-30 のレースを評価する後出し評価（look-ahead leak）**になる。
- よって **2026-05-30 featureScores は生成しない判断**とした。
  KI の 6 項目 Feature Importance は未表示でも許容する（馬詳細本体は horseHistories で復旧済み）。
- featureScores は表示用であり、AI 指数 / 印 / 買い目 / 予想ロジックには非接続。生成見送りでこれらに影響はない。

### 14.4 将来対応（別タスク）

過去日 backfill 済み horseHistories から featureScores を生成する場合は、**先に**:

1. `build-feature-scores-once.mjs` / `normalizeJra` 側に **excludeDate（`h.date === opts.date` を除外）**を実装する。
2. dry-run で **当日（そのレース日）の行が normalizedPastRaces に混入していないこと**を検証する。
3. そのうえで分布確認（null/NaN/50固定/分布）→ push → workflow_dispatch import。

`scaleFeature` の 96 張り付き緩和は本件とは独立の別課題（→ [feature-scores-jra-progress.md](feature-scores-jra-progress.md) の監査記録を参照）。

---

## 15. 半自動パイプライン（horseHistories → featureScores → AK/KI import）

PR #64〜#70 で、予想更新後の手作業（horseHistories取得・featureScores生成・AK/KI import）を
1コマンドに統合した半自動パイプライン `scripts/jra/run-jra-feature-pipeline.mjs` を整備した。

- **運用手順・段階別コマンド・token preflight・停止条件・禁止事項の「正」は
  [scripts/jra/README.md](../scripts/jra/README.md) の「🔁 JRA featureScores 半自動パイプライン」節**（本ドキュメントと重複させない）。
- horseHistories 側の要点（本ドキュメントの管轄）:
  - **push-only 救済**（PR #66）: fetch成功後に PUT だけ失敗した場合、
    `auto-fetch-horse-histories.mjs --push-only-from=<tmp dir> --push --confirm-push=keiba-data-shared` で
    **再fetchせず create-only PUT** で救済（PUT前に token preflight）。
  - **create-only**: 既存ファイルがあれば停止（誤上書き/merge防止）。
  - 過去日バックフィルの当日混入は § 14、featureScores の excludeDate は
    [feature-scores-jra-progress.md](feature-scores-jra-progress.md) を参照。
  - import は **workflow_dispatch**（`import-horse-histories-on-dispatch.yml`）。
    repository_dispatch 版（§5 本番反映）は token 必須でマコさん端末向け。

---

## 関連スクリプト・設定

| 場所 | 役割 |
|---|---|
| `keiba-data-shared-admin/scripts/jra/auto-fetch-horse-histories.mjs` | horseHistories 取得 + push + dispatch |
| `keiba-data-shared/jra/horseHistories/YYYY/MM/{date}-{VENUE}.json` | 共通データ保管先 |
| `keiba-intelligence/.github/workflows/import-horse-histories-on-dispatch.yml` | dispatch 受信 → import |
| `keiba-intelligence/astro-site/scripts/importHorseHistoriesJra.js` | shared → repo 内へ転記 |
| `keiba-intelligence/astro-site/src/utils/loadHorseHistoriesJra.js` | 表示時に当日除外 + slice(0,5) |
| `keiba-intelligence/astro-site/netlify.toml` | `included_files = ["src/data/horseHistories/**"]` |
| `analytics-keiba/.github/workflows/import-horse-histories-on-dispatch.yml` | 同上 |
| `analytics-keiba/astro-site/scripts/importHorseHistoriesJra.js` | 同上 |
| `analytics-keiba/astro-site/src/lib/loadHorseHistoriesJra.js` | 同上 |
| analytics-keiba の中央JRA ページ | `prerender = true` で SSG → `included_files` 不要 |

---

**作成者**: Claude Code（クロちゃん）
**協力者**: マコさん
