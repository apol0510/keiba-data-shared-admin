# JV-Link 結果取込 完成までの残タスク

**最終更新**: 2026-04-20
**作業中心ディレクトリ**: `/Users/user/Projects/keiba-data-shared-admin/windows/JvLinkExporter/` + `src/lib/jra/`

---

## 🎯 今回の目的

JRA-VAN を契約し、Parallels 上の Windows で JV-Link を動かし、JvLinkExporter で取得した
JRA 結果データを以下 3 サービスへ自動反映する構成を完成させる。

- **keiba-data-shared** ← データ保存元
- **keiba-intelligence** ← 下流消費（daily workflow でキャッチアップ）
- **analytics-keiba** ← dispatch でリアルタイム反映

---

## ✅ 完成済み

### Mac 側（100%）
- `src/lib/jra/jvlink-mapper.mjs` — 中間JSON → 既存 shared 形式への変換
- `scripts/jra/transform-results.mjs` + `save-results.mjs` + `sync-jra-results.mjs` — 一気通貫パイプライン
- `netlify/lib/dispatch.mjs` — `jra-results-updated` 並列送信
- `netlify/functions/save-results-jra.mjs` — UI からの保存＋dispatch

### analytics-keiba 側（100%）
- `.github/workflows/import-results-jra.yml` で `jra-results-updated` 受信
- `astro-site/scripts/importResultsJra.js` で archive 更新＋commit

### Windows 側 — RecordParser.cs offset 確定（2026-04-20 セッション）
2026-04-11 raw dump（JG=1606, SE=1495, HR=108, RA=108 等）の実データから以下を実機検証し、`RecordParser.cs` に反映済：

| レコード | 項目 | 旧 offset | 新 offset | 備考 |
|---|---|---|---|---|
| **RA** | Kyori | 632 | **697** | `1700m`/`1200m` で検証 |
| RA | TrackCD | 640 | **705** | `24`(ダ左外)/`17`(芝左外) |
| RA | HassoTime | 854 | **873** | R1=`0945` R10=`1440` |
| **SE** | SexCD | 80 | **78** | UmaKigo=2byte と確定 |
| SE | BarnAge | 85 | **82** | -3 |
| SE | ChokyoshiCode | 88 | **85** | -3 |
| SE | ChokyoshiName | 93 | **90** | -3 |
| SE | BanushiCode | 101 | **98** | -3 |
| SE | BanushiName | 107 | **104** | -3 |
| SE | Fukushoku | 147 | **144** | -3 |
| SE | Futan | 249 | **288** | +39 |
| SE | Blinker | 252 | **291** | +39 |
| SE | KishuCode | 207 | **296** | +89 |
| SE | KishuName | 212 (34byte) | **306** (8byte) | 長さも修正 |
| **HR** | Tansho | 未実装 | **102** | 3×13 (Uma2+Pay9+Ninki2) |
| HR | Fukusho | 未実装 | **141** | 5×13 |
| HR | Wakuren | 未実装 | **206** | 3×13 (Kumi2) |
| HR | Umaren | 未実装 | **245** | 3×16 (Kumi4+Pay9+Ninki3) |
| HR | Wide | 未実装 | **293** | 7×16 |
| HR | Umatan | 未実装 | **453** | 6×16 (405-452 は Reserved) |
| HR | Sanrenpuku | 未実装 | **549** | 3×18 (Kumi6+Pay9+Ninki3) |
| HR | Sanrentan | 未実装 | **603** | 6×19 (Kumi6+Pay9+Ninki4) |

検証用スクリプト: `tmp/verify-offsets.mjs` で全レコード再パース成功

---

## ⏳ 残課題

### SE 結果系 offset は**未確定**（保留）

現状の JV-Link 取得データ：SE record は SJIS **553 bytes** で、JV-Data v4.8 仕様書が想定する ~1382 bytes より大幅に短い。全 SE が DataKubun='7' で、結果領域（KakuteiJyuni/Time/Ninki/Odds/HaronL3/IJyoCD）は**レコードに含まれていない**ように見える。

現行 `ParseSe` ではこれらフィールドは空文字返しで、JSON 出力時 `position: null`, `time: null` 等になる。

**次に必要な切り分け**:
- `--debug` で SE レコードの SJIS hex dump を出力 → 実際のバイト長と末尾領域の構造を確認
- JV-Data 仕様書 v4.8+ で DataKubun='7' の SE レイアウトを確認
- option=1 (通常データ) で取得すれば結果付き SE になるか試行
- 別 dataspec (例: 成績特化) があるか調査

---

## 🛠️ Windows で実行してもらうコマンド

```powershell
# 0. 前提: JVLINK_SID は常に UNKNOWN（この環境の方針）
$env:JVLINK_SID = "UNKNOWN"

# 1. 再ビルド
cd windows\JvLinkExporter
dotnet clean
dotnet build -c Release -r win-x86

# 2. 本番実行（offset 反映後の最新版）
.\bin\Release\net8.0-windows\win-x86\JvLinkExporter.exe `
  --date=2026-04-11 --option=4 `
  --out=C:\jra-data\2026-04-11.json

# 3. Mac に JSON をコピー
Copy-Item "C:\jra-data\2026-04-11.json" `
  "C:\Mac\Home\Projects\keiba-data-shared-admin\tmp\2026-04-11.json" -Force

# 4. (任意) SE 結果系の再調査用に debug hex dump を取得
$env:JV_DEBUG = "1"
.\bin\Release\net8.0-windows\win-x86\JvLinkExporter.exe `
  --date=2026-04-11 --option=4 `
  --out=C:\jra-data\2026-04-11.json --debug `
  2> C:\jra-data\debug-2026-04-11.log
```

> 💡 4/11 は PowerShell の NativeCommandError 回避のため、**JSON 出力を標準エラーに混ぜない**よう `--out` 指定を優先。debug.log はオプション。

---

## 📥 Mac 側で受け取るファイル

| ファイル | 用途 | 必須 |
|---|---|---|
| `tmp/2026-04-11.json` | offset 修正後の中間JSON（distance=1700 / tansho=250円 等確認） | ✅ |
| `tmp/debug-2026-04-11.log` | SE 結果系 offset 再調査用（SJIS hex dump） | 任意 |

---

## 🔧 受領後の確認と本番反映（Mac）

```bash
cd /Users/user/Projects/keiba-data-shared-admin

# 1. JSON の品質確認（distance/tansho が入っているか）
jq '.venues[0].races[0] | {raceNumber, distance, startTime, payouts: .payouts.tansho}' \
  tmp/2026-04-11.json

# 2. dry-run で transform を確認
pnpm sync:jra-results --in=./tmp/2026-04-11.json --dry

# 3. 本番保存 + dispatch
GITHUB_TOKEN_KEIBA_DATA_SHARED=xxx \
  pnpm sync:jra-results --in=./tmp/2026-04-11.json --dispatch
```

成功すると：
- `keiba-data-shared/jra/results/2026/04/2026-04-11-{FKS,HAN,NAK}.json` が保存
- `analytics-keiba` に `jra-results-updated` dispatch → workflow が archive 更新
- Netlify 自動ビルドで `analytics.keiba.link` に反映

---

## 📌 重要な設計判断メモ

1. **JVLINK_SID は常に UNKNOWN** — この環境の方針。他の値は入れない
2. **event_type は `jra-results-updated` で統一**（南関の `nankan-results-updated` と対称）
3. **保存単位は venue 別ファイル** (`YYYY-MM-DD-{CODE}.json`)
4. **mapper は欠損フィールドを null で埋める** — 下流が壊れない（position=null でも通る）
5. **Windows は x86 固定ビルド** — JV-Link が 32bit COM
6. **JVOpen option=4 が既定値** — 過去日の RA/SE/HR を取るには setup モード必須

---

## 🚫 やらないこと

- Mac 側 mapper の再設計
- analytics-keiba / keiba-intelligence の workflow 変更
- 仕様書なしでの SE 結果系 offset 当て推量修正（現状 `+XXX 0314 ...` 構造不明）

---

**作成者**: Claude Opus（2026-04-20 セッション、offset確定）
**前セッション**: 2026-04-16（骨格完成まで）
