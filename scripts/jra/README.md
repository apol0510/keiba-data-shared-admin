# JRA結果インポート運用マニュアル

開催日に **Mac で1コマンド** で JRA 公式から3会場36レース分の結果を取得し、
keiba-data-shared に push → keiba-intelligence / analytics-keiba を自動更新する運用ガイド。

---

## 全体像（データの流れ）

```
JRA公式 (jra.go.jp/JRADB/accessS.html)
        │ (auto-fetch-jra-official.mjs が cheerio でスクレイピング)
        ▼
ローカルでJSON組み立て (3会場分)
        │ (--dispatch オプション付きの場合)
        ▼
keiba-data-shared (GitHub: apol0510/keiba-data-shared)
        │ (Direct push via GitHub API)
        ▼
repository_dispatch: jra-results-updated
        │
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      ▼
keiba-intelligence      analytics-keiba         data.keiba-intelligence.jp
import-results-jra      import-results-jra      (Netlify 自動再ビルド)
        │                      │
        ▼                      ▼
archiveResultsJra.json  archiveResultsJra.json
        │                      │
        ▼                      ▼
Netlify 自動再ビルド      Netlify 自動再ビルド
keiba-intelligence.jp   analytics.keiba.link
```

---

## 事前準備（初回のみ）

### 環境変数

`~/.zshrc` または `~/.bash_profile` に追記:

```bash
# keiba-data-shared への直接 push と dispatch 用
export GITHUB_TOKEN_KEIBA_DATA_SHARED=ghp_xxxxxxxxxxxx

# 必要なスコープ: repo (Full control of private repositories)
# - apol0510/keiba-data-shared への push 権限
# - apol0510/keiba-intelligence への dispatch 権限
# - apol0510/analytics-keiba への dispatch 権限
```

### 動作確認

```bash
cd /Users/apolon/Projects/keiba-data-shared-admin
node scripts/jra/auto-fetch-jra-official.mjs --help
```

---

## 🔐 token 安全運用と実行前チェック（401 再発防止）

### 結論：token 差し替えは原則不要
- 現行の `GITHUB_TOKEN_KEIBA_DATA_SHARED` は有効（`/user=200` / `keiba-data-shared/contents/jra=200` を確認済み）。
- 過去に出た `401 Bad credentials` は **token 失効ではなく環境要因**（実行シェルで token が未ロード、または無印 `GITHUB_TOKEN` への fallback を拾った）であることが多い。
- まず本番実行前チェック（下記）で切り分ける。**安易に既存 token を Regenerate / 新規作成 / Netlify 環境変数 / GitHub Secrets / dispatch token を変更しない**。

### 毎回の `export github_pat_...` 手入力は避ける
- token 値が **画面・`~/.zsh_history`・チャットに残る**事故、古い token / 別 token を貼る事故が起きやすい。
- token は **`~/.zshrc`（または各自のローカル env 管理）に1回だけ定義**し、実行前に **`source ~/.zshrc` または新規ターミナル**で読み込む。
- **token 値は手順書・コミット・PR・チャットに書かない**（本 README にも値は載せない）。

### 本番反映前チェック（同一ターミナルで・値は表示しない）
```bash
# (a) 3 トークンの SET 確認（値は出さない）
for v in GITHUB_TOKEN_KEIBA_DATA_SHARED KEIBA_INTELLIGENCE_TOKEN ANALYTICS_KEIBA_TOKEN; do
  eval "[ -n \"\$$v\" ]" && echo "$v: SET" || echo "$v: UNSET"
done
# (b) fallback 誤用検知：無印 GITHUB_TOKEN が SET なら注意（PUT 段の 401 温床）
[ -n "$GITHUB_TOKEN" ] && echo "⚠️ GITHUB_TOKEN が SET（fallback 誤用の恐れ・本番前に確認）"
# (c) shared token 認証（HTTP status のみ）
curl -s -o /dev/null -w "/user => %{http_code}\n"        -H "Authorization: Bearer $GITHUB_TOKEN_KEIBA_DATA_SHARED" -H "Accept: application/vnd.github+json" https://api.github.com/user
curl -s -o /dev/null -w "contents/jra => %{http_code}\n" -H "Authorization: Bearer $GITHUB_TOKEN_KEIBA_DATA_SHARED" -H "Accept: application/vnd.github+json" https://api.github.com/repos/apol0510/keiba-data-shared/contents/jra
```
- 判定：`/user` と `contents/jra` が **両方 200**、かつ必要な token が **SET**（`--dispatch` するなら KI/AK 両方必須）。
- **401 / 403 / UNSET が一つでもあれば本番反映しない**。

### 自動化版：`check-keiba-env.mjs`（手動チェックの代替）
上記 (a)〜(c) の手動確認は、以下の単独診断スクリプトで一括実行できる（**token 値は表示しない**・read-only GET のみ・dispatch/PUT 一切なし）。
```bash
source ~/.zshrc
node scripts/check-keiba-env.mjs
```
- 確認内容：3 token の SET/UNSET、shared の `/user`・`repo`・`contents/jra`、AK/KI の `/user`・`repo`（token SET 時のみ。UNSET は `SKIPPED`）、`gh auth status`。
- 出力する readiness：`READY_FOR_DRY_RUN` / `READY_FOR_SHARED_PUSH` / `READY_FOR_AK_IMPORT` / `READY_FOR_KI_IMPORT` / `READY_FOR_AK_KI_IMPORT`。
  - `MAYBE` = token は UNSET だが `gh auth` は OK（`workflow_dispatch` は実発火しないと完全確認できないため）。
- exit code：`0`=全OK / `1`=dry-run可だが import/push 一部不可・MAYBE / `2`=shared push 不可 / `3`=GitHub API 到達不可・重大エラー。
- 使い方：`READY_FOR_DRY_RUN` / `READY_FOR_SHARED_PUSH` / `READY_FOR_AK_KI_IMPORT` を確認してから、
  `run-jra-feature-pipeline.mjs` の dry-run / push / import に進む。`NO` / `BLOCKED` があれば本番反映しない。

### gh auth fallback（env token 失効時の救済・ローカル限定）
`GITHUB_TOKEN_KEIBA_DATA_SHARED` が **SET でも 401** の場合でも、ローカルの `gh auth`（`repo` scope）が
keiba-data-shared にアクセスできれば、**`gh auth token` を fallback として自動採用**する。
- 共通 resolver：`scripts/lib/github-token-resolver.mjs`（解決順：env が `/user`・`contents/jra` とも 200 → env 採用 ／ env 無効・未設定 → gh auth token を検証 → 両 200 なら gh-auth 採用 ／ どちらも不可なら BLOCKED）。
- `check-keiba-env.mjs` は env 401 でも gh auth が通れば `READY_FOR_SHARED_PUSH: YES` / `auth source: gh-auth fallback` を表示する（`env token is invalid, but gh auth fallback can access keiba-data-shared.` を明記）。
- `auto-fetch-horse-histories.mjs` の `--push`（および `--push-only-from`）は、この resolver で token を解決して PUT する。採用元は `[Token] keiba-data-shared: ...` の1行でログに出る（**token 値は表示しない**）。
- **CI / Netlify では gh auth fallback を前提にしない**（`gh` 不在・別認証のため）。本番は従来どおり `GITHUB_TOKEN_KEIBA_DATA_SHARED` を正とする。
- 第1弾の適用範囲は **診断 + horseHistories push のみ**。result 系・featureScores・pipeline 統合・netlify は対象外（別タスク）。

#### 第2弾：JRA results 系も対象に（gh auth fallback 拡張）
JRA 結果保存の token 解決も同じ resolver 経由に統一し、危険な `|| GITHUB_TOKEN` 暗黙フォールバックを除去した。
- 対象：`auto-fetch-jra-official.mjs`（push 直前に resolver で解決）／ `save-results.mjs`（**非 dry-run のときだけ** resolver で解決）。
- **dry-run は引き続き token 不要**（`save-results.mjs --dry-run` は無認証で動く現仕様を維持）。
- `sync-jra-results.mjs` は token を直接持たず `save-results.mjs` を子プロセスで呼ぶだけのため**直接変更なし**（save 側の resolver 化で自動的に gh auth fallback の恩恵を受ける）。
- 採用元は `[Token] keiba-data-shared: ...` の1行でログに出る（**token 値は表示しない**）。
- dispatch（`jra-results-updated` などの KI/AK 向け）token 系統は対象外（従来どおり）。

#### 第3弾：featureScores push も対象に（gh auth fallback 拡張）
featureScores の shared push token 解決も同じ resolver 経由に統一した。
- 対象：`scripts/build-feature-scores-once.mjs`（`--push` 経路でのみ resolver で解決し、GET/PUT で共有）。
- 元々 `|| GITHUB_TOKEN` の危険フォールバックは無い設計だったが、env 直読みのみで env 失効時に push が止まっていた。resolver 化で env 無効でも gh auth fallback が使える。
- **dry-run は引き続き token 不要**（`--push` 未指定なら resolver を呼ばない）。
- `--push` の二段階確認（`--confirm-push=keiba-data-shared`）は維持。env 存在チェック単独での早期停止は廃止し、可否は resolver に委譲。
- `run-jra-feature-pipeline.mjs` は `build-feature-scores-once.mjs` を子プロセスで呼ぶため**直接変更なし**（Phase 3 の featureScores push が自動的に gh auth fallback の恩恵を受ける）。
- 採用元は `[Token] keiba-data-shared: ...` の1行でログに出る（**token 値は表示しない**）。

### fallback の注意（今はコード変更しない・別タスク）
- `auto-fetch-jra-official.mjs` は `GITHUB_TOKEN_KEIBA_DATA_SHARED || GITHUB_TOKEN` の **fallback** を持つ。shared token 未ロード時に **意図しない `GITHUB_TOKEN` を拾って 401** になり得る。
- `netlify/lib/dispatch.mjs` も dispatch token の fallback（`... || GITHUB_TOKEN_KEIBA_DATA_SHARED`）を持つため、dispatch 専用 token 未設定時に **不適切な token で dispatch が 403/失敗**することがある。
- fallback 撤去・用途別 token の明示必須化は **別タスク**で検討（本 README では運用回避のみ）。

### スクリプト混同禁止（用途別）
| 用途 | スクリプト | event_type | 保存先 |
|---|---|---|---|
| **JRA 結果（results）** | `scripts/jra/auto-fetch-jra-official.mjs` | `jra-results-updated` | `jra/results/...` |
| **JRA horseHistories（5走/馬詳細）** | `scripts/jra/auto-fetch-horse-histories.mjs` | `horse-histories-updated` | `jra/horseHistories/...` |
| **featureScores 生成** | `scripts/build-feature-scores-once.mjs` | （dispatch 無・workflow_dispatch import） | `jra/featureScores/...` |

→ **JRA 結果反映 / horseHistories バックフィル / featureScores 生成は別手順**として扱う（混同しない）。

---

## 開催日の手順

### Step 1. JRA公式で 各場の R1 URL をコピー

ブラウザで JRA公式トップ → 「結果」 → 当日の各会場の **第1レース 結果** ページを開き、URL をコピー。

例:
```
https://www.jra.go.jp/JRADB/accessS.html?CNAME=pw01sde1005202602050120260502/AC
https://www.jra.go.jp/JRADB/accessS.html?CNAME=pw01sde1008202601020120260502/B0
https://www.jra.go.jp/JRADB/accessS.html?CNAME=pw01sde1004202601020120260502/55
```

### Step 2. urls.txt に貼る（3行）

```bash
cd /Users/apolon/Projects/keiba-data-shared-admin
cat > scripts/jra/urls.txt <<'EOF'
https://www.jra.go.jp/JRADB/accessS.html?CNAME=pw01sde1005202602050120260502/AC
https://www.jra.go.jp/JRADB/accessS.html?CNAME=pw01sde1008202601020120260502/B0
https://www.jra.go.jp/JRADB/accessS.html?CNAME=pw01sde1004202601020120260502/55
EOF
```

### Step 3. 1コマンド実行

```bash
npm run jra:auto-fetch -- --urls=scripts/jra/urls.txt --date=2026-05-03 --dispatch
```

### 完了の合図

成功時のターミナル末尾:
```
✅ 京都: 12レース取得
✅ 東京: 12レース取得
✅ 新潟: 12レース取得
✅ keiba-data-shared に push 完了
✅ dispatch success: keiba-intelligence, analytics-keiba
```

`--dispatch` を付けない場合はローカル JSON 出力のみ（テスト/確認用）。

### 安全な実行順（401 / 二重反映の防止）

1. `urls.txt` の **日付・会場・R1** を確認（CNAME 末尾の `YYYYMMDD` と jyo コード。URL/CHK は推測しない）。
2. 上記「🔐 token 安全運用と実行前チェック」を実施（`/user`・`contents/jra` が 200、必要 token が SET）。401/403/UNSET なら中止。
3. **まず保存なしテスト**：
   ```bash
   node scripts/jra/auto-fetch-jra-official.mjs --urls=urls.txt
   ```
   （任意）`--dry-run` で `would PUT` / `would dispatch` を確認。
4. tmp 出力を検査（頭数・date・venue・failed=0）。
5. 問題なければ **本番反映（push + dispatch を1パス）**：
   ```bash
   node scripts/jra/auto-fetch-jra-official.mjs --urls=urls.txt --dispatch
   ```
6. **失敗（401 / 403 / PUT failed / dispatch 失敗）したら再実行せず停止**し、原因（token 未ロード・fallback 誤用・urls.txt の日付）を確認する。
7. **既に反映済みの日付を安易に再実行しない**（二重 PUT 防止）。

---

## 反映確認

dispatch から **1〜2分後** に以下が更新されます:

| URL | 反映内容 |
|-----|---------|
| https://data.keiba-intelligence.jp/jra/results/YYYY/MM/DD/ | 各レース詳細ページ |
| https://keiba-intelligence.netlify.app/archive/jra/YYYY/MM/ | 月次アーカイブ |
| https://analytics.keiba.link/archive/jra/YYYY/MM/ | 月次アーカイブ |

GitHub Actions の状態:
- https://github.com/apol0510/keiba-intelligence/actions/workflows/import-results-jra.yml
- https://github.com/apol0510/analytics-keiba/actions/workflows/import-results-jra.yml

---

## トラブルシュート

### ❌ HTTP 401 / 403

`GITHUB_TOKEN_KEIBA_DATA_SHARED` が未設定 or 期限切れ。`gh auth status` で確認、Personal Access Token を再発行。

### ❌ 「結果テーブル0件」

JRA公式の URL が古い・誤り、または開催前。R1の URL を貼り直し。

### ❌ workflow は緑なのに archive 反映されない

`archiveResultsJra.json` が `totalRaces=0, venue=""` で書かれた可能性。
原因: 会場別ファイルの venue 欠損（2026-05 で修正済）。再発時は importResultsJra.js の `fetchAndMergeVenueResults` で各 race に venue が注入されているか確認。

### ❌ Netlify ビルドが失敗（RSS）

`startTime` 形式（"9時50分" vs "9:50"）の不整合で RSS pubDate が Invalid Date 化する。auto-fetch 側で `H:MM` 正規化済（2026-05 修正）。再発時は `keiba-data-shared/src/pages/rss.xml.js` の正規表現が両形式対応か確認。

---

## 🔁 JRA featureScores 半自動パイプライン（horseHistories → featureScores → AK/KI import）

> ⚠️ ここは **結果(results)取得**（`auto-fetch-jra-official.mjs`）とは別系統。
> **予想更新後に horseHistories / featureScores / AK-KI import が別作業**になり抜け漏れが起きていたため、
> `scripts/jra/run-jra-feature-pipeline.mjs` で半自動化した（PR #64〜#70）。
> **JRA公式URLの取得・urls.txt 作成は人間が行う。pipeline はURLを推測生成しない。**

### 実行コマンド（段階別・default は dry-run）

> **`--venues` は省略可能**（推奨: 省略）。省略時は urls.txt のJRA公式URL(CNAME)から
> 開催場を自動判定する（例: `0105`→TOK / `0109`→HAN、accessD/accessS 両対応）。
> 明示したい場合のみ `--venues=TOK,HAN` を付ける（指定時はその値を優先）。

```bash
# (1) dry-run のみ（保存なし）★標準: --venues なし
node scripts/jra/run-jra-feature-pipeline.mjs --urls=urls.txt --date=YYYY-MM-DD

# (2) horseHistories push まで（create-only）
node scripts/jra/run-jra-feature-pipeline.mjs --urls=urls.txt --date=YYYY-MM-DD \
  --push-horse-histories --confirm-push=keiba-data-shared

# (3) featureScores push まで（create-only事前確認）
node scripts/jra/run-jra-feature-pipeline.mjs --urls=urls.txt --date=YYYY-MM-DD \
  --push-horse-histories --push-feature-scores --confirm-push=keiba-data-shared

# (4) AK/KI import まで（workflow_dispatch 4本・success確認）★本実行
node scripts/jra/run-jra-feature-pipeline.mjs --urls=urls.txt --date=YYYY-MM-DD \
  --push-horse-histories --push-feature-scores --import-sites \
  --confirm-push=keiba-data-shared --confirm-import=ak-ki

# （任意）開催場を明示したい場合のみ --venues を付ける
#   --venues=TOK,HAN
```

フロー: hh dry-run fetch → hh tmp検査 →（push時）hh shared push(create-only)→ shared local pull
→ featureScores dry-run生成 → featureScores検査 →（push時）featureScores shared push(create-only)→ pull
→（import時）AK/KI へ `import-horse-histories-on-dispatch.yml` / `import-feature-scores-on-dispatch.yml` を workflow_dispatch → 4本 success確認。

### token 確認（push 前 preflight・PR #66）

push 経路では PUT 前に **token preflight**（`/user`=200・`contents/jra`=200）を実行し、401/403 は保存前に停止する（token値は表示しない）。手動確認:

```bash
source ~/.zshrc
curl -s -o /dev/null -w "/user => %{http_code}\n"        -H "Authorization: Bearer $GITHUB_TOKEN_KEIBA_DATA_SHARED" -H "Accept: application/vnd.github+json" https://api.github.com/user
curl -s -o /dev/null -w "contents/jra => %{http_code}\n" -H "Authorization: Bearer $GITHUB_TOKEN_KEIBA_DATA_SHARED" -H "Accept: application/vnd.github+json" https://api.github.com/repos/apol0510/keiba-data-shared/contents/jra
```

### 安全ゲート
- `--confirm-push=keiba-data-shared` が無い限り shared push しない。
- `--confirm-import=ak-ki` が無い限り AK/KI import しない。`--import-sites` は `--push-horse-histories` と `--push-feature-scores` が必須（**このpipelineで push成功したものだけを import**）。
- horseHistories / featureScores とも **既存ファイルがあれば原則停止（create-only）**。
- featureScores 生成は **excludeDate** により対象日と同じ履歴行を除外（PR #65・過去日backfillの look-ahead leak 防止）。
- import は **workflow_dispatch のみ**（repository_dispatch は使わない）。

### 停止条件（いずれかで fail-stop）
urls.txt 不在 ／ urls.txt の日付が `--date` と不一致 ／ venuesと取得JSONの venueCode 不一致 ／ hh取得失敗 ／ hh tmp検査NG ／ sameDay混入異常 ／ shared既存あり ／ shared push失敗 ／ keiba-data-shared local pull失敗 ／ featureScores dry-run失敗 ／ featureScores検査NG（NaN/undefined/50固定/全頭同値）／ featureScores push失敗 ／ AK/KI workflow_dispatch失敗 ／ run conclusion が success以外 ／ pending/in_progress が長時間（最大6分poll後タイムアウトで打ち切り・別途確認）。

### 既存ファイルの扱い
- horseHistories / featureScores とも: 既存なし=create ／ 既存あり=原則停止 ／ 再取得・再生成・上書きは別途判断。

### 運用上の注意
- JRA公式fetchは時間がかかる（~18分）。**失敗時に安易に再fetchしない**。
- **fetch成功後に PUT だけ失敗**した場合は、`auto-fetch-horse-histories.mjs --push-only-from=<tmp dir> --push --confirm-push=keiba-data-shared`（PR #66・create-only）で**再fetchせず救済**できる。
- featureScores は **shared local clone の horseHistories を読む**ため、hh push後に **keiba-data-shared を local pull** する（pipeline は自動で実行）。
- AK/KI import後は **Netlify 反映待ち**がある。**AK=latest-only / KI=過去日URLあり**。

### 禁止事項
- shared JSON 手編集禁止 ／ AK・KI 片側寄せ修正禁止 ／ AI指数・印・買い目を触らない ／ featureScores生成値を手編集しない ／ token値を表示しない ／ `git add .`・`git add -A`・`git clean` 禁止 ／ untracked 保護ファイルを巻き込まない。

### 検証記録: 2026-06-07 dry-run（TOK,HAN）
半自動pipeline の実運用テスト（dry-run）を実施し、想定どおり動作することを確認した。
- 条件: `--date=2026-06-07 --venues=TOK,HAN`（東京R1=jyo05 / 阪神R1=jyo09 の公式URL）。**push/import/dispatch なし**。
- horseHistories dry-run: 成功（TOK/HAN failures=0・**当日(6/7)混入0・未来日混入0**）。
- featureScores dry-run: 成功（engine=jra-v1・**50固定0・NaN0・undefined0・全頭同値なし**・TOK=182/HAN=175 records）。`git status` clean。
- 既存反映確認: 6/7 の hh・featureScores は **keiba-data-shared / AK / KI の3層すべてに既存**（前セッションで反映済み）。
- 結論: **本実行(push/import)はスキップ**（既反映のため不要）。pipeline は **未反映日なら1コマンドで push→import／既反映日なら create-only で安全停止** という設計どおりに動くことを確認。**push→import のフル経路検証は、次回の未反映JRA開催日**で行う。

---

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `scripts/jra/run-jra-feature-pipeline.mjs` | **半自動パイプライン**（hh→featureScores→AK/KI import） |
| `scripts/jra/auto-fetch-horse-histories.mjs` | horseHistories 取得 / push / push-only救済 / token preflight |
| `scripts/build-feature-scores-once.mjs` | featureScores 生成（excludeDate・dry-run / --push） |
| `scripts/jra/auto-fetch-jra-official.mjs` | 本体スクリプト（**結果取得・別系統**） |
| `scripts/jra/urls.txt` | 開催日ごとに書き換える R1 URL リスト |
| `netlify/lib/dispatch.mjs` | repository_dispatch 共通ヘルパー |
| `keiba-data-shared/jra/results/YYYY/MM/YYYY-MM-DD-VENUE.json` | 出力先（push される結果データ） |
| `analytics-keiba/astro-site/scripts/importResultsJra.js` | 受け側の取込スクリプト |
| `keiba-intelligence/astro-site/scripts/importResultsJra.js` | 受け側の取込スクリプト |

---

## 過去の主要な修正履歴

- **2026-05-03**: JV-Link 撤退、JRA公式スクレイピングへ全面移行
- **2026-05-03**: RSS startTime 両形式対応（`9時50分` / `9:50`）
- **2026-05-03**: 表示テンプレート両対応（`rank`/`position`、`number`/`combination`、`timeData`/`halonTime`、`cornerData`/`cornerPassDetail`）
- **2026-05-03**: 会場別マージ時の venue 欠損バグ修正（importResultsJra.js）
- **2026-05-03**: レースサマリ精度向上（脚質判定 + 上がり3F最速比較）
