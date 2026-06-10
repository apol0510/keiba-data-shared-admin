# 南関 featureScores 日次運用 runbook

**最終更新**: 2026-06-10
**ステータス**: 案A（手動 date+venue 運用）— 実地検証済み（2026-06-10 OOI 成功）

---

## 1. 目的

南関 featureScores を日次で生成し、`keiba-data-shared` に保存し、
analytics-keiba (AK) / keiba-intelligence (KI) へ import して本番表示へ反映するための手順。

本番"最新"の南関ページで featureScores 由来の表示（AK=3項目 / KI=6軸）を live 視認するには、
**表示中の日付・会場の featureScores を生成・shared保存・AK/KI import** する必要がある。
未生成日は fallback 表示（回帰ではない）になる。

---

## 2. 対象範囲

- **category=nankan のみ**（JRA は対象外。JRA は horseHistories 主の別フロー）
- venue は **OOI（大井）/ FUN（船橋）/ KAW（川崎）/ URA（浦和）**
- **1回の生成は `date + venue` 単位**（複数 venue 一括生成は非対応 → venue ごとに繰り返す）
- 南関は基本 **1日1場**運用（racebook も日付ごとに単一会場）

---

## 3. 基本方針（厳守）

- まず **racebook から対象会場を確認**（racebook = 生成器の入力。無ければ生成不可）
- 必ず **dry-run を先に実行**し品質を確認
- **品質OKの場合のみ shared push**（`--push --confirm-push=keiba-data-shared` 二段階確認）
- shared 保存確認後に **AK/KI import を workflow_dispatch**（`gh workflow run`）
- pending / failure / 件数不一致があれば**停止**
- **repository_dispatch は使わない**（後着 PUT の 404 skip を誘発するため workflow_dispatch 手動を維持）
- **wrapper / Actions 自動化はまだ行わない**（手動運用を継続）
- 外向き操作（shared PUT / AK・KI dispatch）は各 Step で**マコさんの明示許可を待つ**

---

## 4. 手順

> 例として `date=2026-06-10` / `venue=OOI` を用いる。実運用時は対象日・対象会場に置換する。

### Step 0: repo 状態確認

```bash
for r in keiba-data-shared-admin keiba-data-shared analytics-keiba keiba-intelligence; do
  echo "===== $r ====="
  cd "/Users/user/Projects/$r" || exit 1
  git checkout main >/dev/null 2>&1 || true
  git pull origin main >/dev/null 2>&1 || true
  echo "HEAD/origin: $(git rev-parse --short HEAD) / $(git rev-parse --short origin/main)"
  git status --short
done
```

期待: 各 repo main = origin/main 一致・追跡対象の未commit変更なし
（`.claude/worktrees/` など無関係 untracked は触らない）。

### Step 1: token 有無確認（値は表示しない）

```bash
cd /Users/user/Projects/keiba-data-shared-admin
source ~/.zshrc 2>/dev/null || true
[ -n "$GITHUB_TOKEN_KEIBA_DATA_SHARED" ] && echo "GITHUB_TOKEN_KEIBA_DATA_SHARED: SET" || echo "GITHUB_TOKEN_KEIBA_DATA_SHARED: UNSET"
gh auth status 2>&1 | grep -E "Logged in|Active account"
```

- shared push: `GITHUB_TOKEN_KEIBA_DATA_SHARED`（env）または `gh auth` fallback のいずれかが有効ならOK
- AK/KI import: `gh workflow run` は **gh auth で足りる**（env dispatch token 不要）
- env が UNSET かつ gh auth も不可なら shared push せず停止

### Step 2: racebook から対象会場確認

```bash
cd /Users/user/Projects/keiba-data-shared
git pull origin main >/dev/null 2>&1
ls -1 nankan/racebook/2026/06/2026-06-10-*.json
```

- 末尾の venue code（例 `OOI`）が対象会場。複数あれば全会場を順に処理
- OOI/FUN/KAW/URA 以外が出たら対象範囲を再確認して停止

### Step 3: featureScores 未生成確認

```bash
ls -1 nankan/featureScores/2026/06/2026-06-10-*.json 2>/dev/null || echo "(未生成)"
```

- 既に対象 venue の featureScores が存在する場合は**上書きになるため停止して報告**

### Step 4: dry-run

```bash
cd /Users/user/Projects/keiba-data-shared-admin
node scripts/build-feature-scores-once.mjs \
  --category nankan --date 2026-06-10 --venue OOI --source local
```

`--push` 未指定 = dry-run（shared 書き込み・GitHub PUT・dispatch なし）。

### Step 5: 品質確認（§5 基準）

dry-run 出力で品質基準を満たすか確認。逸脱があれば push せず停止。

### Step 6: shared push

```bash
node scripts/build-feature-scores-once.mjs \
  --category nankan --date 2026-06-10 --venue OOI --source local \
  --push --confirm-push=keiba-data-shared
```

- PUT 先が `nankan/featureScores/2026/06/2026-06-10-OOI.json` であること
- `PUT 完了` を確認。403 / path 不一致 / category 不一致なら停止

### Step 7: shared 保存確認

```bash
cd /Users/user/Projects/keiba-data-shared
git pull origin main
python3 - <<'PY'
import json
from pathlib import Path
p = Path("nankan/featureScores/2026/06/2026-06-10-OOI.json")
d = json.loads(p.read_text())
races = d.get("races", {})
horses = sum(len((r.get("horses") or {})) for r in races.values())
print(d.get("category"), d.get("engine"), d.get("date"), d.get("venueCode"), len(races), horses)
assert d.get("category")=="nankan" and d.get("engine")=="nankan-v1"
assert d.get("date")=="2026-06-10" and d.get("venueCode")=="OOI"
PY
```

### Step 8: AK import workflow_dispatch

```bash
cd /Users/user/Projects/analytics-keiba
gh workflow run import-feature-scores-on-dispatch.yml \
  -f category=nankan -f date=2026-06-10 -f venues=OOI
sleep 6
gh run list --workflow import-feature-scores-on-dispatch.yml --limit 3
```

### Step 9: KI import workflow_dispatch

```bash
cd /Users/user/Projects/keiba-intelligence
gh workflow run import-feature-scores-on-dispatch.yml \
  -f category=nankan -f date=2026-06-10 -f venues=OOI
sleep 6
gh run list --workflow import-feature-scores-on-dispatch.yml --limit 3
```

> import workflow（AK/KI 共通仕様）: `workflow_dispatch` のみ / inputs=category,date,venues(カンマ区切り・空=全場) /
> shared 読取は `KEIBA_DATA_SHARED_TOKEN` secret（read-only PAT）/ 404 は exit 0 で graceful skip /
> `git add src/data/featureScores/` のみ commit+push（Netlify リビルドが反映導線・新規 repository_dispatch なし）。

### Step 10: AK/KI import 結果確認

両 workflow が `completed / success` になったら各 repo を pull し、取込 JSON の件数一致を確認。

```bash
# AK
cd /Users/user/Projects/analytics-keiba && git pull origin main
# KI
cd /Users/user/Projects/keiba-intelligence && git pull origin main
# 各 astro-site/src/data/featureScores/nankan/2026/06/2026-06-10-OOI.json を
# category=nankan / engine=nankan-v1 / date / venueCode / races / horses で検証（Step 7 同様）
```

### Step 11: 本番確認

```bash
curl -sL https://analytics.keiba.link/free-prediction/nankan/ | grep -oE "安定性|能力上位性|展開利|2026-06-10"
curl -sL https://analytics.keiba.link/premium-prediction/nankan/ | grep -oE "安定性|能力上位性|展開利|2026-06-10"
curl -sL https://keiba-intelligence.netlify.app/prediction/nankan/ | grep -oE "Speed Index|Stamina Rating|Form Trend|Track Compatibility|Distance Fitness|Jockey Factor|2026-06-10"
curl -sL https://keiba-intelligence.netlify.app/free-prediction/nankan/ | grep -oE "Speed Index|Stamina Rating|Form Trend|Track Compatibility|Distance Fitness|Jockey Factor|2026-06-10"
```

- AK 南関: featureScores 由来 **3項目（安定性 / 能力上位性 / 展開利）**
- KI 南関: featureScores 由来 **6軸（Speed Index / Stamina Rating / Form Trend / Track Compatibility / Distance Fitness / Jockey Factor）**
- 買い目・印・AI指数・予想本体が消えていないこと
- Netlify 本番反映に数分かかる場合あり。未反映なら「本番反映待ち」と報告して停止

---

## 5. 品質チェック基準（Step 5）

- `engine=nankan-v1`
- `races` / `horses` 件数が妥当（例: OOI 12R / 156頭）
- 固定値 50/100 検査 = **0件**
- 全頭同値検査 = **OK**
- `==96` 張り付きが過剰でない（南関 slope=18・center56）
- null / insufficient 件数が過剰でない（trackCompatibility / distanceFitness に少数出るのは新馬・初コース等で正常）
- 過去走なし馬が極端でない

---

## 6. 停止条件（いずれか該当で停止・報告）

- racebook が無い（生成不可）
- OOI/FUN/KAW/URA 以外の対象外会場が混入
- 対象 venue の featureScores が**既に存在**し上書きになる
- dry-run で異常（固定値多発 / 全頭同値 / 件数大幅変動 / エラー）
- PUT 失敗（403 等）/ path 不一致 / category 不一致
- shared 保存件数・属性の不一致
- AK / KI workflow が failure / cancelled
- AK / KI import 後の JSON 件数不一致
- 本番ページ破損

---

## 7. 2026-06-10 OOI 成功記録

| 項目 | 値 |
|---|---|
| category | nankan |
| engine | nankan-v1 |
| date | 2026-06-10 |
| venue / venueCode | 大井 / OOI |
| races | 12 |
| horses | 156 |
| shared path | `nankan/featureScores/2026/06/2026-06-10-OOI.json` |
| dry-run 品質 | 固定値50/100=0件・全頭同値OK・96張り付きなし・null=trackCompat12/distanceFitness13・過去走なし馬0 |

**AK import**
- run `27268721810` → completed / success / commit `c60d739`
- path `astro-site/src/data/featureScores/nankan/2026/06/2026-06-10-OOI.json`（12R/156頭）

**KI import**
- run `27268724518` → completed / success / commit `e82a4f8`
- path `astro-site/src/data/featureScores/nankan/2026/06/2026-06-10-OOI.json`（12R/156頭）

**本番確認**
- AK free/premium nankan: featureScores 由来 3項目表示を確認
- KI prediction/free nankan: featureScores 由来 6軸表示を確認
- 買い目・印・AI指数・予想本体への影響なし

---

## 8. 今後の自動化方針

- **短期**: 手動 `date+venue` 運用を継続（本 runbook）。南関1日1場・既存安全機構・追加実装ゼロ。
- **中期**: dry-run 限定 wrapper を検討。
  `date` 指定 → racebook glob → 対象会場列挙 → dry-run 一括レポート。
  push / import は wrapper に含めず人間の明示操作に残す。
  JRA の `scripts/jra/run-jra-feature-pipeline.mjs`（dry-run統合の子プロセス wrapper）が雛形。
  南関は horseHistories fetch 段が不要な分さらに単純化できる。
- **長期**: GitHub Actions workflow 化は token / 権限設計が固まってから。
  admin→shared 自動 PUT の CI 化は dispatch token 運用（マコさん環境前提）と相性が悪く、**現時点では非推奨**。

---

**関連**: `scripts/build-feature-scores-once.mjs`（生成器・engine/slope 変更禁止）、
`docs/feature-scores-jra-progress.md`（JRA側）、
analytics-keiba `docs/dark-horse-picks-stability-plan.md`（南関 featureScores 整備＋AK/KI 配線 完了記録）。
