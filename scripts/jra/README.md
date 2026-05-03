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
