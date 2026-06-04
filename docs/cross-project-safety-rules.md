# keiba-intelligence / analytics-keiba 共通データ安全運用ルール

**最終更新**: 2026-05-25
**対象リポジトリ**: `keiba-data-shared-admin` / `keiba-data-shared` / `keiba-intelligence` / `analytics-keiba`
**読み手**: Claude（クロちゃん）および本プロジェクト群を触る全エンジニア

---

## 目的

`keiba-data-shared-admin` / `keiba-intelligence` / `analytics-keiba` にまたがる作業で、
**「片方を直したら、もう片方が壊れる」状態から卒業する**ことが目的。

そのために、`admin` / `keiba-data-shared` 側を **共通データ生成・保存・受け渡しの責任範囲** として明確化し、
両表示サイトは「共通データ契約」を読むだけにする運用に統一する。

---

## 背景

- `keiba-intelligence` と `analytics-keiba` は **切り離して運用されている**（別リポジトリ・別 Netlify サイト・別フロントエンド実装）。
- 一方で、両者が参照する **データ生成・保存・受け渡しは admin / shared data に依存している**。
- 片方の表示側だけに補完や例外処理を入れると、もう片方が壊れる・ズレる・再発する事故が繰り返し起きてきた。
  - 例: 2026-05-23 案件（dispatch ペア揃いガード未実装）／距離欠落の片サイト補完
- 今後は **表示側の場当たり修正ではなく、admin/shared data 側で共通データ契約を整備してから各サイトが読む** 方針に統一する。

---

## 基本方針

1. **admin/shared data 側を「共通データ生成・保存・受け渡しの責任範囲」として扱う。**
2. `keiba-intelligence` / `analytics-keiba` は、原則として admin/shared data が出力した **共通形式を読むだけ** にする。
3. **片方のサイトだけに独自補完を入れて問題を隠す修正は禁止**。
4. **片方の表示に合わせて、もう片方のデータ構造を壊す修正は禁止**。
5. **どちらかのサイトに寄せるのではなく、共通データ契約を先に定義する**。
6. 推測補完より null safe を優先する。
7. 全体反映より最小単位（1日1場）の確認を優先する。
8. 実装より先に **調査・影響範囲報告** を優先する。

---

## 責任範囲

| リポジトリ | 責任 |
|---|---|
| `keiba-data-shared-admin` | データ入力 UI・パース・補完・正規化・GitHub 保存・ペア揃いガード・dispatch 起点。**共通データ契約の実装責任を持つ**。 |
| `keiba-data-shared` | 共通データの保管（GitHub JSON）。書き込みは admin 経由のみ。手動編集は原則禁止。 |
| `keiba-intelligence` | 共通データを **読むだけ**。独自補完・推測埋めは原則禁止（やむを得ない場合は admin に移植）。 |
| `analytics-keiba` | 同上。 |
| `keiba-computer-web` / その他 | 同上。 |

**例外**: 片サイト固有の表示用変換（フィールド名リネーム・並び替え）は許容するが、
**データ補完・欠落穴埋め・推測**は admin/shared data 側に集約する。

---

## 禁止事項

絶対にやってはいけないこと:

- `keiba-intelligence` 側だけで無理やり補完すること
- `analytics-keiba` 側だけで無理やり補完すること
- 両サイトの表示ファイルを個別に場当たり修正すること
- 表示側の都合で shared data の構造を壊すこと
- admin 側の修正で既存の **AI総合指数 / 印 / 買い目 / 不要馬表示 / darkHorses** を変化させること
- 目的外の UI を復活させること
- 旧デザインを復活させること
- 既存の正常表示を確認せずに **全日付・全場へ一括再投入** すること
- ペア揃いガード（`netlify/lib/pair-guard.mjs`）を無効化・回避すること
- analytics-keiba 側の ±1日マージロジックを削除すること（CLAUDE.md 参照）

---

## 共通データ契約

### 共通データ契約対象（必ず admin/shared data 側で扱う対象）

以下はすべて、表示側（intelligence / analytics）が個別に補完・推測してはならない。
admin/shared data 側で共通形式に揃え、両サイトはそれを **読むだけ** とする。

| 区分 | 対象 |
|---|---|
| 過去走系 | `pastRaces` / `recentRaces` / `history` |
| レース基本情報 | `raceName` / `surface` / `venue` / `date` |
| 距離 | `distance` / `distanceMeters` |
| 着順・人気 | `finish` / `popularity` |
| 騎手・斤量 | `jockey` / `weight` |
| タイム差 | `margin` / `timeDiff` |
| 馬体重 | `bodyWeight` |
| 上がり3F | `final3F` |
| 予想ロジック出力 | **`AI総合指数`** / **`印`** / **`買い目`** / **`不要馬表示`** / **`darkHorses`** |

**予想ロジック出力（AI総合指数 / 印 / 買い目 / 不要馬表示 / darkHorses）について特に重要**:

- 計算は admin 側 (`computer-manager` / `race-data-importer` / `save-keiba-book.mjs` / `save-computer.mjs` / `_shared/dark-horse.mjs`) で完結する。
- 表示側で再計算・再判定してはならない。
- admin 側の他の修正（例: pastRaces 補完）でこれらの出力が **絶対に変化しないこと** を BEFORE/AFTER で検証すること。
- 検証スクリプト: `scripts/verify-darkhorses-stability.mjs` / `scripts/compare-past-races.mjs`

### A. データ契約の原則

- **取得できるものは admin/shared data 側で補完する**。
- **取得できないものは推測で埋めず null にする**。
- **表示側が落ちないよう null safe 前提**にする（必須キーは null で必ず存在させる）。
- **既存値は破壊しない**（補完は「null だったキー」だけに行う）。
- **並び順を変える場合は表示側への影響を必ず明記** し、両サイトの reverse 有無を確認すること。
- **並び順を変えない場合も `displayOrder` などのメタで契約を明示する**。

### B. 過去走 (pastRaces / recentRaces / history) 契約

実装場所:
- 生成: `src/pages/admin/race-data-importer.astro`（`extractPastRaces` XML / `parseTextHorse` テキスト）
- 正規化: `netlify/lib/past-races-normalizer.mjs`
- 補完: `netlify/lib/past-races-enricher.mjs`
- 保存統合: `netlify/functions/save-keiba-book.mjs` / `save-computer.mjs`

#### B-1. 共通フィールド一覧

`pastRaces[i]` の正規形（normalizer で全件保証されるキー）:

| フィールド | 型 | 補完元 | 備考 |
|---|---|---|---|
| `date` | `YYYY-MM-DD` \| null | results 突合 | venue 末尾の M.D と当該レース日付から年を推定 |
| `venue` | string | racebook（必須） | "4中9.27" / "大井 6.13" 等 |
| `venueCode` | 3文字 \| null | results 突合 | "TOK" / "NAK" / "KYO" / "HAN" / "CHU" / "KOK" / "NII" / "FKS" / "SAP" / "HKD" / "OOI" / "KAW" / "FUN" / "URA" |
| `raceName` | string \| null | results 突合 | "3歳未勝利" / "クイーンC" 等 |
| `raceClass` | string \| null | racebook | "❶牝未勝" / "２　勝" / "クイーンC" 等（新聞表記） |
| `surface` | "芝" / "ダ" / "障" \| null | results 突合 | JRA は `trackInfo`、南関は `surface` から判定 |
| `distance` | "ダ1400" 等 \| null | racebook / results 突合 | 表示用文字列 |
| `distanceMeters` | number \| null | racebook / results 突合 | 数値 |
| `distanceGaiji` | string \| null | racebook XML | PUA 外字（results 突合できない場合のフォールバック識別子） |
| `finish` | number \| null | racebook | 着順 |
| `finishStatus` | "取消" / "除外" / "中止" / "失格" \| null | racebook | 失格系 |
| `popularity` | number \| null | results 突合 | 人気順 |
| `jockey` | string \| null | racebook | 騎手名 |
| `weight` | number \| null | racebook | 斤量 |
| `bodyWeight` | number \| null | racebook | 馬体重 |
| `bodyWeightDiff` | number \| null | results 突合 | 馬体重増減（JRA のみ） |
| `time` | string \| null | racebook | "1.27.1" / "1:33.2" 等 |
| `margin` | string \| null | results 突合 | "クビ" / "３ 1/2" 等 |
| `paceType` | "S" / "M" / "H" \| null | racebook | |
| `paceRank` | number \| null | racebook | |
| `final3F` | string \| null | racebook / results | 上がり3F |
| `courseNote` | string \| null | racebook | コース注記 |
| `cond` | string \| null | racebook | 条件 |
| `winner` | string \| null | racebook | 勝ち馬名 |

#### B-2. 並び順契約

- **並び順は `oldest-first`**（`pastRaces[0]` = 最古、`pastRaces[N-1]` = 直近）。
- 各 race 単位で `pastRacesDisplayOrder: "oldest-first"` メタを付与し、明示する。
- これは `netlify/functions/_shared/dark-horse.mjs` の `extractDarkHorses` / `extractLastFinish` が
  `pastRaces[pastRaces.length - 1]` を「直近」として参照している前提と一致する。
- **並び順を変更する場合**は、両サイトの importer の reverse 有無に注意:
  - `keiba-intelligence`: `pastRaces.slice(-5).reverse()` （oldest-first 前提で reverse して newest-first 表示）
  - `analytics-keiba`: `pastRaces.slice(0, 5)` （reverse なし、結果的に oldest-first 表示）
  - admin 側で並び順を反転すると **両サイトの表示順が同時に逆転する**。スコープ外として扱うのが安全。

#### B-3. 補完できる条件

- `{cat}/results/{Y}/{M}/{date}-{venueCode}.json` が存在するときに限り results 突合を行う。
- **2026 年以前は results が未整備** のため、推測ゼロ方針で null のまま残す。
- 補完対象フィールド: `date` / `venueCode` / `raceName` / `surface` / `distance` / `distanceMeters` / `popularity` / `margin` / `bodyWeightDiff` / `final3F`。
- 既に値があるフィールドは上書きしない。

### C. 表示側の null safe 要件

両サイトの表示側は以下を満たすこと:

- `distance` / `distanceMeters` が null でも例外なくレンダリングできる（`{x && <span>{x}m</span>}` 等の guard）
- `popularity` / `margin` / `raceName` / `surface` が null の場合は **非表示または「不明」表記**（推測しない）
- `pastRaces` 件数が 0〜5 のいずれでも落ちない
- 馬の `pastRaces` 自体が `undefined` でも落ちない（`Array.isArray` チェック）

### D. 既存契約（変更禁止）

- 競馬場コード: `src/lib/constants/venue-codes.ts` 一元管理（CLAUDE.md 参照）
- 振り分けルール: 本命=1 / 対抗=1 / 単穴=1 / 連下最上位=1 / 連下=最大3 / 補欠 / 無
- スコア定義: ◎5 / ○4 / ▲3 / svg2 / 穴2 / △1 / 無0
- COMPI_THRESHOLD = 45
- ペア揃いガード（CLAUDE.md `🛡️ dispatch ペア揃いガード` 参照）

---

## 作業前チェック

修正に着手する前に **必ず以下を確認** すること:

- [ ] 変更対象が `admin` 側か、`keiba-intelligence` 側か、`analytics-keiba` 側か明確になっているか
- [ ] その修正が **片方のサイトだけに有利な修正** になっていないか
- [ ] admin が出力している JSON 構造を確認したか（実ファイルを Read 推奨）
- [ ] `keiba-intelligence` / `analytics-keiba` がその JSON をどう読んでいるか確認したか（grep で `pastRaces` / `recentRaces` を辿る）
- [ ] JRA / 南関でデータ構造が違う場合、どこで吸収すべきか判断したか
- [ ] 無料版 / 有料版の両方で同じデータ形式を読めるか確認したか
- [ ] CLAUDE.md / 本ルール / `RESULTS_SYSTEM_ARCHITECTURE.md` 等の既存契約を再読したか

---

## 実装前報告ルール

実装着手の前に、以下を**ユーザーに必ず報告**する:

1. **過去走（など対象データ）を生成しているファイル**
2. **現在の出力JSON構造**
3. **欠落・不整合の原因**
4. **片方だけの問題か、共通データの問題か**
5. **admin 側で直すべきか、表示側で直すべきかの判断**
6. **admin 側で直す場合の影響**
7. **表示側で直す場合の影響**
8. **両方に影響する場合のリスク**
9. **最小安全修正案**
10. **触るファイル / 触らないファイル**
11. **テスト対象（URL / データファイル）**

**ユーザーの許可が出てから実装を開始する**。

---

## コミット前チェック

コミット前に **必ず以下を報告** すること:

- [ ] `git diff --stat` の出力
- [ ] 変更ファイル一覧
- [ ] `src/` 表示側を触ったかどうか
- [ ] admin 保存処理を触ったかどうか
- [ ] `keiba-intelligence` / `analytics-keiba` 側を触ったかどうか
- [ ] 既存 JSON の構造差分（fields が増えたか / 並び順が変わったか）
- [ ] **AI総合指数 / 印 / 買い目 / 不要馬表示 / darkHorses が変化していないことを検証済みか**
- [ ] JRA / 南関、無料版 / 有料版の dry-run 確認状況
- [ ] untracked file がある場合、それをコミット対象に含めるか除外するかの明示
- [ ] `pnpm build` が最後まで完走したか
- [ ] `node --check` が全変更ファイルで通ったか

---

## 本番反映ルール

### 段階的反映

1. **コミット → push → Netlify デプロイ完了を確認**
2. **まず 1 日 1 場だけ再 import**（例: JRA 2026-05-24 TOK）
3. `keiba-data-shared` の該当 JSON の差分を確認
4. `keiba-intelligence` 無料版・有料版で表示確認
5. `analytics-keiba` 無料版・有料版で表示確認
6. AI総合指数 / 印 / 買い目 / 不要馬表示 / darkHorses が変わっていないか目視確認
7. 問題なければ他場へ拡大（場単位 → 日単位）

### 禁止

- いきなり全日付・全場の一括再投入
- 1 ファイル確認なしの拡大
- 確認ログを取らない反映

---

## 回帰確認対象

修正後、以下を**必ず**確認する。

| 観点 | 確認手段 |
|---|---|
| admin の保存処理 | `pnpm build` / `node --check` / smoke import |
| `keiba-data-shared` の JSON 出力 | 1ファイル再 import → GitHub commit 差分目視 |
| `keiba-intelligence` 無料版 | 該当 URL を開いて表示確認 |
| `keiba-intelligence` 有料版 | 同上 |
| `analytics-keiba` 無料版 | 同上 |
| `analytics-keiba` 有料版 | 同上 |
| JRA | 上記すべて |
| 南関 | 上記すべて |
| AI総合指数 | dry-run 比較スクリプトで BEFORE/AFTER |
| 印 | 同上 |
| 買い目 | 同上 |
| 不要馬表示 | 同上 |
| darkHorses | `scripts/verify-darkhorses-stability.mjs` |
| 過去走表示 | `scripts/verify-past-races.mjs` / `compare-past-races.mjs` |
| 距離表示 | 同上 |
| 人気表示 | 同上 |
| raceName 表示 | 同上 |

---

## 今後の判断基準

迷ったら、以下の **優先順位** に従う。

1. **既存の正常表示を壊さない**
2. **片方のサイトだけに寄せない**
3. **admin/shared data 側の共通契約を整える**
4. **表示側は共通データを読むだけにする**
5. **推測補完より null safe を優先する**
6. **全体反映より最小単位の確認を優先する**
7. **実装より先に調査・影響範囲報告を優先する**

---

## dispatch token と保存 token の分離（2026-06-03 障害の再発防止）

> 2026-06-03 に「6/3 船橋結果・6/4 船橋予想が shared には保存済みなのに AK/KI 本番へ反映されない」障害が発生した。原因は **保存用 token と dispatch 用 token が別物**で、後者が無効でも **保存自体は成功扱い**になり、未反映に気付きにくかったこと。以下を運用知識として明文化する。

### 1. 保存用 token

- `GITHUB_TOKEN_KEIBA_DATA_SHARED`
- 目的: admin → keiba-data-shared への JSON 保存
- 対象 repo: `apol0510/keiba-data-shared`
- これが無効だと、admin 保存時に GitHub API `401 Bad credentials` などで **保存自体が失敗**する

### 2. dispatch 用 token

- `ANALYTICS_KEIBA_TOKEN`
- `KEIBA_INTELLIGENCE_TOKEN`
- 目的: admin 保存後に AK/KI へ `repository_dispatch` を送る
- 対象 repo:
  - `apol0510/analytics-keiba`
  - `apol0510/keiba-intelligence`
- これが無効・未設定・権限不足でも、**shared 保存自体は成功し得る**
- その場合、**shared にはデータがあるのに AK/KI へ反映されない**状態になる
- 注意: 未設定時は fallback で `GITHUB_TOKEN_KEIBA_DATA_SHARED` が使われるが、この token は AK/KI repo への dispatch 権限を通常持たないため `❌ dispatch失敗` になり得る。**保存用 token を直しても dispatch は直らない**。

### 3. dispatch 失敗時の注意

- `netlify/lib/dispatch.mjs` は dispatch token 未設定時や失敗時にログを出す
- ただし、**dispatch 失敗は保存処理全体を必ずしも失敗にしない**（throw せずログのみ）
- そのため、admin 画面では保存成功に見えても、AK/KI に反映されていないことがあり得る
- 保存後は Netlify Functions log の以下を確認する:
  - `✅ dispatch成功`
  - `⚠️ dispatch skip: token未設定`
  - `❌ dispatch失敗`

### 4. 未反映時の切り分け順

1. keiba-data-shared に対象 JSON が存在するか確認
2. shared に存在しない場合は、保存用 token または保存処理を疑う
3. shared に存在する場合は、**再保存ではなく** AK/KI 取り込み側を疑う
4. admin Functions log で dispatch 成功/失敗を確認
5. AK/KI Actions が起動しているか確認
6. dispatch 未達なら `ANALYTICS_KEIBA_TOKEN` / `KEIBA_INTELLIGENCE_TOKEN` を確認
7. Actions が起動していて未反映なら、AK/KI 側の import script / guard / path を確認

### 5. workflow_dispatch backfill を使う条件

次の条件が揃ったら、再保存ではなく AK/KI 側の `workflow_dispatch` で backfill する。

- shared には正しいデータが存在する
- しかし AK/KI に反映されていない
- 過去日で日次 cron を待っても backfill されない（cron は当日分のみ）

例（AK / KI 共通の workflow 名）:

- 結果: `import-results-on-dispatch.yml`
  - input: `date=YYYY-MM-DD`（category 不要）
- 予想: `import-on-dispatch.yml`
  - input: `date=YYYY-MM-DD`
  - input: `category=nankan`（必須）

### 6. 再保存すべきでないケース

- shared に対象データが既に存在し、内容が正しい場合
- この場合、再保存すると dispatch 再送・ペア揃いガード再評価・X 投稿再発火などの**副作用**が出る可能性がある
- shared にあるのに AK/KI にない場合は、**再保存ではなく backfill を優先**する

### 7. token 更新時の注意

- token 値は**絶対にログ・チャット・CLI 出力に表示しない**
- Netlify UI で更新する
- `Contains secret values` を有効にする
- Functions scope / Production context を確認する
- token 更新後は**再デプロイ推奨**
- GitHub fine-grained token の場合:
  - 対象 repo を Repository access に含める
  - `Contents: Read and write`（repository_dispatch 発火に必須）
  - `Metadata: Read`

---

## shared PUT の token 権限と 401/403/404 切り分け（2026-06-04〜05 障害の再発防止）

> 2026-06-04 に `scripts/push-recent-horse-histories.mjs --execute` で shared への create-only PUT が失敗した。
> 初回は GET `401`、2回目以降は GET `404`（未存在＝正常）→ PUT `403`。branch protection なし・ruleset なし・repo は public。
> push script が PUT 失敗時の response body（`message` / `documentation_url`）を表示していなかったため、原因の切り分けが遅れた。
> 6/4・6/5 の shared 追加は GitHub Web UI 手動で前進させたが、これは token write 問題を切り分けるための**緊急回避**であり、日常運用・正式運用としては採用しない。今後は `GITHUB_TOKEN_KEIBA_DATA_SHARED` の write 問題を解消し、`scripts/push-recent-horse-histories.mjs --execute` による shared PUT 自動化へ戻す。以下を運用知識として明文化する。

### 1. token 役割表（混同しない）

| token名 | 用途 | 主な使用場所 |
|---|---|---|
| `GITHUB_TOKEN_KEIBA_DATA_SHARED` | keiba-data-shared への Contents API **書き込み** | admin push script / Netlify save系 |
| `KEIBA_DATA_SHARED_TOKEN` | AK/KI の **Actions が shared を読む** | analytics-keiba / keiba-intelligence の workflow secret |
| `ANALYTICS_KEIBA_TOKEN` | analytics-keiba への **dispatch** | admin 側 dispatch |
| `KEIBA_INTELLIGENCE_TOKEN` | keiba-intelligence への **dispatch** | admin 側 dispatch |

- `GITHUB_TOKEN_KEIBA_DATA_SHARED`（shared 書込）と `KEIBA_DATA_SHARED_TOKEN`（AK/KI 取込読取）は**別役割**。名前が似ているので混同しない。
- **gh CLI の認証 token（`gho_` OAuth）と、script が `process.env` から読む token は別物**。`gh` が通っても script の PUT が通るとは限らない。

### 2. 401 / 403 / 404 / 422 切り分け

| status | 意味の候補 |
|---|---|
| GET 401 | token 無効・期限切れ・Bad credentials。token そのものを疑う。 |
| GET 404 | 対象ファイル未存在なら**正常**。public repo では scope 不足 token でも GET が通るため、**write 権限の証明にはならない**。 |
| PUT 403 | token に Contents write 相当の権限が無いのが**最有力**。branch protection / ruleset / repo 権限でも起こり得る。response body の `message` / `documentation_url` を必ず確認する。 |
| PUT 422 | 既存ファイルに create-only PUT した / sha 指定不足 / validation error など。 |

- 2026-06-04 の症状（GET 404 → PUT 403・保護無・public）は **token の write scope 不足と整合**（最有力推定）。
- ただし **read-only 確認では PAT の実効 write 権限は確定できない**。確定には GitHub の token 設定画面で scope を目視するか、明示許可後の write 検証が必要。
- `gh repo view` の `viewerPermission` は **gh CLI の認証主体**の権限であり、script が読む env token の権限とは別物。`permissions.push=true` も Contents API write scope の直接証明ではない。

### 3. push script の 403 診断（2026-06-05 改善）

- `scripts/push-recent-horse-histories.mjs` は PUT / GET 失敗時に `formatGithubError()` で **`message` と `documentation_url` のみ**を whitelist 表示する。
- **表示しない**: token 値 / Authorization header / request body の `content` / base64 化 JSON / env 値。
- 403 が再発したら、まずこの `message`（例: `Resource not accessible by personal access token`）を読んで scope 不足か保護かを切り分ける。

### 4. `.zshrc` への token 直書き廃止方針

- `~/.zshrc` への長期 token 直書きは**廃止推奨**（2026-06 時点で classic PAT `ghp_` が直書きされていた）。
- 置換候補: GitHub Secrets / Netlify env / 1Password 等の password manager / `direnv` + `.envrc`（git 管理外）/ 一時的なシェル export。
- token 値を docs・ログ・チャット・CLI 出力に**残さない**。

### 5. 手動追加は緊急回避のみ。正式運用には採用しない

- 2026-06-04〜05 の 6/4 FUN・6/5 FUN では、`GITHUB_TOKEN_KEIBA_DATA_SHARED` の write 問題切り分けのため、GitHub Web UI 手動追加で一時的に前進した。
- これは**緊急回避の実績**であり、日常運用・正式運用としては**採用しない**。
- recentHorseHistories の shared 追加は、`GITHUB_TOKEN_KEIBA_DATA_SHARED` の write 問題を解消し、`scripts/push-recent-horse-histories.mjs --execute` による**自動 PUT へ戻す**。
- 手動追加を前提にした運用設計・日常手順化・admin 自動 dispatch 配線の回避策は採用しない。

### 6. 本番 shared PUT 復旧ゲート

本番 `recentHorseHistories` を shared へ PUT する前に、以下を満たすこと。

1. `GITHUB_TOKEN_KEIBA_DATA_SHARED` の対象 repo / Contents write 権限が確認済み
2. `~/.zshrc` への長期 token 直書きを撤去、または安全な注入方法へ変更済み
3. `diagnostics/shared-put/...` など本番 JSON とは無関係な throwaway path で write 検証が成功済み
4. `scripts/push-recent-horse-histories.mjs` の 4xx 診断表示が有効
5. PUT対象の `recentHorseHistories` JSON が validate PASS
6. PUT前に保存先 path / sha256 / races / horses / recentRaces 件数を表示
7. create-only PUT で既存ファイルを上書きしない
8. PUT後に GET で sha256 / 件数一致を確認
9. その後に AK/KI 取り込み dispatch へ進む

---

## 関連ドキュメント

- `CLAUDE.md` — プロジェクト全体方針・禁止事項・基本構成
- `jra-horse-histories-operation.md` — 中央JRA horseHistories 運用と停止ポイント
- `CLAUDE.details.md` — 詳細仕様
- `CLAUDE.archive.md` — 修正履歴
- `RESULTS_SYSTEM.md` — 結果ページ仕様
- `../keiba-data-shared/RESULTS_SYSTEM_ARCHITECTURE.md` — 結果アーキテクチャ
- `../keiba-data-shared/MULTI_VENUE_CHECK.md` — 複数会場検査
- `VENUE_CODE_GUIDE.md` — 競馬場コード規約
- `VENUE_MIX_BUG_FIX_REPORT.md` — 会場混入バグ修正報告
- `DATA_FLOW.md` — データフロー

---

## 改訂履歴

| 日付 | 内容 |
|---|---|
| 2026-05-25 | 初版作成。pastRaces 共通契約・並び順契約・本番反映ルールを明文化 |
| 2026-06-03 | dispatch token と保存 token の分離を明文化（6/3 船橋結果・6/4 船橋予想 未反映障害の再発防止）。未反映時の切り分け順・workflow_dispatch backfill 条件・再保存禁止ケース・token 更新時の注意を追記 |
