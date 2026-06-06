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

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `scripts/jra/auto-fetch-jra-official.mjs` | 本体スクリプト |
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
