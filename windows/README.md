# JvLinkExporter (Windows / C#)

JV-Link (JRA-VAN Data Lab.) から JRA結果データを取得し、
`keiba-data-shared-admin/src/lib/jra/jvlink-mapper.mjs` が受け取れる
**中間JSON** を出力する Windows 専用 .NET 8 コンソールアプリ。

## 動作要件

- Windows 11 (Parallels 可)
- .NET 8 SDK
- JV-Link (JVDTLab) インストール済み（COM登録済）
- JRA-VAN Data Lab. の有効な **Sid（利用者ID）**

## 環境変数

| 変数名 | 必須 | 内容 |
|---|---|---|
| `JVLINK_SID` | ✅ | JRA-VAN 利用者ID（`JVInit` に渡す文字列） |

## ビルド

```powershell
cd windows\JvLinkExporter
dotnet build -c Release
```

## 実行モード

### 1. ダミーモード（JV-Link 不要）
Mac 側 transform CLI までの配管をまず確認する用。
```powershell
dotnet run -- --dummy --date=2026-04-15 --out=C:\jra-data\2026-04-15.json
```
→ `C:\jra-data\2026-04-15.json` にスキーマ準拠のダミーJSONを出力。
そのまま Mac 側で `pnpm sync:jra-results --in=./2026-04-15.json --dispatch --dry-run` で検証可能。

### 2. 生レコードダンプ（オフセット検証用）
```powershell
dotnet run -- --raw-dump --date=2026-04-15 > raw.txt
```
→ RA/SE/HR の生レコードを `[####] RA|len=xxx|...` 形式で全て stdout に出力。
JV-Data仕様書のオフセット表と突合し、`RecordParser.cs` の TODO 項目を確定値に書き換える。

### 3. 通常モード（実データ取得）
```powershell
set JVLINK_SID=取得したID
dotnet run -- --date=2026-04-15 --out=C:\jra-data\2026-04-15.json
```

### オプション
| フラグ | 意味 |
|---|---|
| `--date=YYYY-MM-DD` | 対象日（未指定なら今日） |
| `--out=PATH` | 出力先（既定 `C:\jra-data\{date}.json`） |
| `--option=1` | `JVOpen` option（1=通常, 2=セットアップ。既定1）|
| `--dummy` | JV-Link呼ばずダミー出力 |
| `--raw-dump` | 生レコードを stdout に流す |
| `--dry` | JV-Link 呼ぶが JSON出力しない（疎通確認） |

## 出力JSON スキーマ（厳守）

```json
{
  "date": "YYYY-MM-DD",
  "venues": [
    {
      "code": "NAK",
      "name": "中山",
      "races": [
        {
          "raceNumber": 1,
          "raceName": "...",
          "distance": 1200,
          "surface": "T|D|O",
          "trackCondition": "良|稍重|重|不良",
          "weather": "晴|曇|雨|小雨|雪|小雪",
          "startTime": "10:10",
          "results": [
            { "position": 1, "horseNumber": 3, "horseName": "...", "jockey": "...", "popularity": 1, "odds": 2.1 }
          ],
          "payouts": {
            "tansho": [], "fukusho": [], "wakuren": [], "wide": [],
            "umaren": [], "umatan": [], "sanrenpuku": [], "sanrentan": []
          }
        }
      ]
    }
  ]
}
```

Mac 側 `src/lib/jra/jvlink-mapper.mjs` で
- `surface: 'T'→'芝' / 'D'→'ダート' / 'O'→'障害'`
- 3文字会場コード付与 (既に `code` フィールドで渡す)
- `position → rank` / `horseNumber → number` / `horseName → name` などのキー名変換

が行われる。

## Mac 側との接続

```bash
# Windows で出力した JSON を Mac に scp/共有フォルダ等で転送
cd /Users/user/Projects/keiba-data-shared-admin
GITHUB_TOKEN_KEIBA_DATA_SHARED=ghp_xxx \
  pnpm sync:jra-results --in=/path/to/2026-04-15.json --dispatch
```

## ⚠️ 本リポジトリ内の未検証項目 (TODO)

`RecordParser.cs` 内の **バイトオフセット**は JV-Data仕様書 v4.8+ を手元に
確認する必要があります。以下の理由により、著者 (Mac上のClaude) は
仕様書にアクセスできず推定値を置いています。

### 要検証 (優先度順)
1. **RA (レース詳細)**: RaceName offset, TrackCD, Kyori, TenkoCD, BabaCD, HassoTime
2. **SE (馬毎レース情報)**: Wakuban, Umaban, Bamei, KakuteiJyuni, Ninki, Odds, Time, HaronTimeL3/L4
3. **HR (払戻)**: Tansho/Fukusho/Wakuren/Wide/Umaren/Umatan/Sanrenpuku/Sanrentan の各ブロックoffsetは完全未実装（`RawTail` に生文字列を退避）

### 検証手順
1. `--raw-dump` で生レコードを取得
2. 仕様書の offset 表と照合
3. `RecordParser.cs` の TODO 行を実値に置き換え
4. `--dummy` と `--real` の JSON を diff して同一構造になるか確認

## ファイル構成

```
windows/JvLinkExporter/
├── JvLinkExporter.csproj
├── Program.cs           # CLIエントリ + モード分岐
├── JvLinkClient.cs      # JV-Link COM 呼び出しラッパー
├── RecordParser.cs      # RA/SE/HR レコード解析 (⚠️ offset 要検証)
├── Aggregator.cs        # RA+SE+HR → IntermediateDay 集約
├── IntermediateJson.cs  # 出力JSONスキーマ型定義
├── VenueCode.cs         # JyoCD(01..10) → 競馬場名/3文字コード
└── DummyGenerator.cs    # --dummy モード用固定データ
```
