# 中央JRA horseHistories 運用 / 5 走表示 / 馬名クリック詳細

**最終更新**: 2026-05-28
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
