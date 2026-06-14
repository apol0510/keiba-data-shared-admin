# 南関 entries 日次運用 runbook

**最終更新**: 2026-06-14
**ステータス**: 案A（手動 date+venue 運用）— 実地実証済み（2026-06-12 OOI 当日一気通貫 / 2026-06-10 OOI バックフィル成功）

> 南関の**過去走詳細表示**（馬の「過去5走」パネル）を、日々の運用で
> `shared → AK/KI → 本番` まで反映するための手順書。
> 手順の出典は [docs/nankan-horse-detail-display-plan.md](nankan-horse-detail-display-plan.md) §29〜§33（特に §33.7 当日 entries 一気通貫）に分散していたものを、1枚に集約したもの。

---

## 1. 目的

- 南関の過去走詳細表示を、日次運用で `shared → AK/KI → 本番` まで反映する。
- **主系統は `entries`**（出馬表由来の近走＋`finishStatus`）。
- **`recentHorseHistories` は fallback 系統**（本 runbook の日次必須手順には含めない。§14 参照）。
- **admin/shared を正本にする**。AK/KI 側で shared に無い値を推測表示しない。表示側の場当たり補完で共通データの欠陥を隠さない。

### 表示の優先順位（AK premium 南関 `nankan.astro`）
```
const recentRaces = recentRacesFromEntriesNankan.length > 0
  ? recentRacesFromEntriesNankan          // ① entries 系（主系統・本 runbook の対象）
  : getDisplayRecentRacesForNankan(horse) // ② recentHorseHistories 系（fallback）
```
entries が入っていれば entries を表示。空のときだけ recentHorseHistories（fallback）に落ちる。

---

## 2. 対象・非対象

### 対象
- **最新予想日**の南関 entries（racebook/predictions が成立している date+venue）。
- shared `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json`（**1 venue = 1 JSON**）。
- AK/KI への import（event `entries-nankan-updated`）。
- AK premium 南関の本番確認（対象 date が最新予想日と一致する場合のみ）。

### 非対象
- **過去ギャップ日のバックフィル**（過去日は本番 premium に描画されない＝§3）。必要時は別タスク。
- **free / KI UI / JRA 横展開**。
- **featureScores**（別系統・別 runbook = [nankan-feature-scores-daily-runbook.md](nankan-feature-scores-daily-runbook.md)）。
- **予測スコア / 評価記号 / 推奨系ロジック / dark-horse.mjs**（過去走表示に非接続）。
- **recentHorseHistories の日次必須運用**（fallback として維持するのみ）。

---

## 3. 日次判断基準

実行対象があるかは以下で判断する。

1. shared に最新の `nankan/racebook/YYYY/MM/{date}-{VENUE}.json` / `nankan/predictions/computer/YYYY/MM/{date}-{VENUE}.json` があるか（＝予想成立日）。
2. 対象 **date / venue** を1組に確定する（南関は基本 **1日1場**）。
3. その date が **AK premium 南関が描画する最新予想日と一致するか**。
   - **AK premium 南関は SSG（静的）で「最新予想日」のみ描画する**。日付別ルート無し（`/{date}/`=301・`?date=` はクエリ無視で同一バイト）。
   - したがって **対象 date = 最新予想日 のときだけ本番目視で確認できる**。
4. **過去日は本番目視対象外**（データ層反映完了をもって完了扱い・§13）。

> entries が最新予想日に供給されないと、premium 南関の過去走は常に fallback/空になる
> （[display-plan §23.2 / §33](nankan-horse-detail-display-plan.md)）。日次運用の主目的は「最新予想日の entries 供給」。

---

## 4. token 運用（全 Step 共通・先に読む）

- **token 値は絶対に表示しない**（ログ・docs・コマンド出力すべて）。
- Claude の Bash env の `GITHUB_TOKEN_KEIBA_DATA_SHARED` 等は **invalid（401 Bad credentials）になることがある**。その場合は値を出さず `gh auth token` fallback を使う（apol0510 が AK/KI/shared を所有）。
  - shared PUT 用: `GITHUB_TOKEN_KEIBA_DATA_SHARED="$(gh auth token)"`
  - dispatch 用: `ANALYTICS_KEIBA_TOKEN="$(gh auth token)"` / `KEIBA_INTELLIGENCE_TOKEN="$(gh auth token)"`
  - dispatch script の gate 6（shared 存在 GET）も `GITHUB_TOKEN_KEIBA_DATA_SHARED` を読むため、**dispatch 時は 3 token すべてを fallback で設定**する。
- ログに token が混ざらないよう、出力は `grep -viE "ghp_|gho_|github_pat"` で念のため除外する。
- 詳細な token 運用方針はメモリ [[feedback_dispatch_token_runtime]] を参照。
- **外向き操作（shared PUT / AK・KI dispatch）は各 Step でマコさんの明示許可を待つ**。

---

## 5. Step 0: read-only 現状確認

```bash
# 各 repo の HEAD / origin/main / working tree
for d in keiba-data-shared-admin keiba-data-shared analytics-keiba keiba-intelligence; do
  p="/Users/user/Projects/$d"
  git -C "$p" fetch origin main -q
  echo "$d HEAD=$(git -C "$p" rev-parse --short HEAD) origin/main=$(git -C "$p" rev-parse --short origin/main)"
  git -C "$p" status --short
done

# shared を最新化して最新 racebook / predictions / entries を確認
git -C /Users/user/Projects/keiba-data-shared pull origin main -q --ff-only
find /Users/user/Projects/keiba-data-shared/nankan/racebook -name "*.json" | sort | tail -5
find /Users/user/Projects/keiba-data-shared/nankan/predictions/computer -name "*.json" | sort | tail -5
find /Users/user/Projects/keiba-data-shared/nankan/entries -name "*.json" | sort | tail -5
```

確認:
- admin/shared/AK/KI が clean・HEAD=origin/main か。
- 最新 racebook/predictions の date+venue（＝対象候補）。
- その date の entries が **既に shared にあるか（あれば実行不要）**。
- **今日実行対象があるか**（最新予想日の entries が未供給なら対象あり）。
- token 値は表示しない。

---

## 6. Step 1: entries dry-run（保存なし）

```bash
cd /Users/user/Projects/keiba-data-shared-admin
node scripts/nankan/dry-run-aggregate-entries.mjs \
  --program-url="https://www.nankankeiba.com/program/{14桁}.do" \
  --venue={OOI|KAW|FUN|URA} \
  --out=/tmp/agg-redo-{date}-{VENUE}.json   # 任意（per-row 突合用・repo外スクラッチ）
```

- program URL は当日 program 一覧、または既存 shared `nankan/entries/.../{date}-{VENUE}.json` の `sourceMeta.programUrl` から確定。
- **`--push` を付けない** ＝ 保存なし・shared PUT なし・dispatch なし・token 不読み込み（既定 dry-run）。
- `--out` は必要時のみ `/tmp`（repo 外）に。**repo/shared には書かない**。

確認項目:
- `races`（=12 等）/ `totalHorses`（馬数）/ `sourceMeta.races` の整合。
- `schema ✅ OK`（validator error 0）。
- `recentRaces` 充足率（100% が目安）。
- `finishStatus` 件数と内訳（能試/取消/出走取消/除外/中止/競走中止）。
- race 構造（raceNumbers 連番・近走行総数）。
- **想定外差分の有無**（既存 shared と比較する場合は finishStatus 付与のみが理想）。

---

## 7. Step 2: shared PUT 〔★マコさん許可〕

```bash
cd /Users/user/Projects/keiba-data-shared-admin
GITHUB_TOKEN_KEIBA_DATA_SHARED="$(gh auth token)" \
node scripts/nankan/dry-run-aggregate-entries.mjs \
  --program-url="https://www.nankankeiba.com/program/{14桁}.do" \
  --venue={VENUE} \
  --push --execute \
  --force   # 既存ファイル更新時のみ（新規 create のときは不要）
```

- **`--push --execute`** で実 shared PUT。**既存更新時のみ `--force`**（既存 SHA 確認のうえ update。新規 create-only では付けない）。
- **dispatch はこの Step ではしない**（保存と送信は分離）。`--confirm-dispatch` 系オプションは付けない。
- token 値非表示（`gh auth token` fallback・出力フィルタ）。

確認（PUT 後・shared を `git pull` して read-only）:
- `PUT ✅ status 200/201` / 保存ガード PASS。
- shared latest commit。
- 対象ファイル `nankan/entries/YYYY/MM/{date}-{VENUE}.json`。
- finishStatus 件数・内訳・race 構造・馬数。
- **既存値維持**（finish/rank/time/last3f/popularity/passingOrder/margin/bodyWeight/raceName/order/jockey/carriedWeight に不要差分なし）。
- **finishStatus 以外の想定外差分があれば停止**（§9）。

---

## 8. Step 3: AK/KI dispatch 〔★マコさん許可〕

```bash
cd /Users/user/Projects/keiba-data-shared-admin
T="$(gh auth token)"
ANALYTICS_KEIBA_TOKEN="$T" KEIBA_INTELLIGENCE_TOKEN="$T" GITHUB_TOKEN_KEIBA_DATA_SHARED="$T" \
node scripts/dispatch-entries-nankan.mjs \
  --dispatch \
  --confirm-dispatch=entries-nankan-updated \
  --date {YYYY-MM-DD} \
  --venues {VENUE}
```

- event は **`entries-nankan-updated` 固定**（JRA / recentHorseHistories の event は使わない）。
- **date / venues を単一対象に限定**。**複数日一括は禁止**（GitHub Actions concurrency で中間 run が cancel される＝[display-plan §18](nankan-horse-detail-display-plan.md)）。バックフィルが必要なら 1 件ずつ逐次（1 dispatch → completed 確認 → 次）。
- 多段ゲート（--dispatch / --confirm 一致 / date 形式 / venues 南関コード / shared GET=200 / AK・KI token 有）をすべて通過時のみ実送信。
- 送信先は AK/KI 2 repo。両方 `status=204` を確認。
- token 値非表示。

---

## 9. Step 4: workflow / import 確認（単発）

```bash
# 直近 run id を取得して単発確認（長時間監視・連続 polling はしない）
gh run list --repo apol0510/analytics-keiba    --workflow="import-entries-nankan-on-dispatch.yml" --limit 2 \
  --json databaseId,status,conclusion,headSha,createdAt,displayTitle
gh run list --repo apol0510/keiba-intelligence --workflow="import-entries-nankan-on-dispatch.yml" --limit 2 \
  --json databaseId,status,conclusion,headSha,createdAt,displayTitle
```

- AK/KI workflow が **completed / success** か。
- **pending / queued / in_progress なら、状態報告して停止**（後で単発再確認）。
- **failure ならログ要点だけ確認して停止**。
- success のときのみ AK/KI を `git pull` し、import ファイルを read-only 確認:
  - AK: `astro-site/src/data/entries/nankan/YYYY/MM/{date}-{VENUE}.json`
  - KI: `astro-site/src/data/entries/nankan/YYYY/MM/{date}-{VENUE}.json`
  - 件数（finishStatus）・内訳・race 構造・馬数・近走行総数が shared と一致するか。
  - **既存値維持**（finish null 維持・rank 数値混入なし・order 着順代替なし・不要差分なし）。

---

## 10. Step 5: 本番確認（最新予想日のときのみ）

```bash
curl -s -o /tmp/ak.html -w "HTTP %{http_code} bytes=%{size_download}\n" \
  "https://analytics.keiba.link/premium-prediction/nankan/"
# 表示日付と状態語の出現を単発確認
grep -oE "2026-06-[0-9]{2}" /tmp/ak.html | sort -u
for w in 能試 取消 除外 中止; do printf "%s: " "$w"; grep -o "$w" /tmp/ak.html | wc -l; done
```

- AK premium 南関が **HTTP 200**。
- **対象 date が本番の表示日付（最新予想日）と一致する場合のみ** HTML を確認:
  - enhanced（本命/対抗/単穴）・compact（連下/補欠）に過去走と状態語が表示されるか。
  - 状態語に「着」が付いていないか（数値着順のときだけ `${rank}着`）。
  - `order` 由来の誤った「○着」表示になっていないか。通過順表示が壊れていないか。
- **過去日は本番目視不可**として扱う（SSG が最新予想日のみ描画＝§3）。
- **building / 未反映なら状態報告して停止**（長時間監視禁止・単発確認のみ）。

---

## 11. 停止条件（いずれか該当で即停止・報告）

- Step 1: schema NG / race 数・馬数異常 / recentRaces 充足率異常。
- Step 2: **finishStatus 以外の想定外差分** / shared PUT failure（非 200/201）/ 保存ガード fail。
- Step 3: dispatch failure（gate 未通過・非 204）。
- Step 4: workflow failure / 件数・構造不一致 / pending・in_progress（→単発再確認まで停止）。
- Step 5: 本番未反映 / building / HTTP 非 200。
- 共通: **token 不備**（値は出さず fallback、それでも失敗なら停止）/ **対象 date・venue 不明**。

---

## 12. 完了条件

- shared `nankan/entries/.../{date}-{VENUE}.json` 更新済み（PUT 200/201・差分は entries 内容のみ）。
- AK/KI import 済み（workflow success・import ファイル件数/構造一致）。
- **本番表示対象日（=最新予想日）なら本番確認済み**。
- **過去日はデータ層反映完了（shared＋AK/KI 一致）をもって完了扱い**（本番目視はしない）。
- 各 repo clean・HEAD=origin/main。**追加の横展開なし**（free/KI UI/JRA/featureScores 非接触）。

---

## 13. 直近実績

### 2026-06-12-OOI（当日 entries 一気通貫）
- entries 充足・**finishStatus 25件**（能試14/除外5/中止3/取消3）。
- shared 保存 → AK/KI import → **AK 本番 premium 南関で enhanced / compact とも状態語表示確認済み**。
- 最新予想日と同一日付のため本番目視まで成立（[display-plan §33.7](nankan-horse-detail-display-plan.md)）。

### 2026-06-10-OOI（バックフィル・データ層クローズ）
- shared `861274d` / AK `24dee25` / KI `de6625c`。
- **finishStatus 17件**（能試12 / 取消3 / 除外1 / 中止1）・shared/AK/KI 3層一致。
- finish null 維持・rank 数値混入なし・order 着順代替なし・finishStatus 以外の差分0。
- **本番目視は構造上不可**（premium が最新予想日 06-12 のみ描画）。**データ層反映完了でクローズ**。

---

## 14. fallback 系統（recentHorseHistories）の位置づけ（参考）

- shared `nankan/recentHorseHistories/YYYY/MM/{date}-{VENUE}.json`・event `recent-horse-histories-nankan-updated`。
- AK 注入 `injectRecentHorseHistoriesNankan.js` → `recentRacesFromHistoriesNankan` →
  `getDisplayRecentRacesForNankan(horse)` 経由で **entries が空のときだけ**表示に使われる。
- racebook+results 由来の正規化 v0（Phase 6 完了）。生成・検証・push・dispatch は
  `enrich-recent-horse-histories.mjs` / `validate-recent-horse-histories.mjs` /
  `push-recent-horse-histories.mjs` / `dispatch-recent-horse-histories-nankan.mjs`。
- **本 runbook の日次必須手順には含めない**。entries が主系統で機能している限り fallback として維持するのみ。
  日次に含めるかは別判断（メモリ [[project_nankan_past_races_normalization]] 参照）。

---

**関連 docs**: [nankan-horse-detail-display-plan.md](nankan-horse-detail-display-plan.md)（§29〜§33 設計・実証）/ [nankan-feature-scores-daily-runbook.md](nankan-feature-scores-daily-runbook.md)（別系統）
