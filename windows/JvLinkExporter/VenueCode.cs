namespace JvLinkExporter;

/// <summary>
/// JV-Data の競馬場コード (01..10) → 競馬場名 / shared 3文字コード
/// Mac 側 src/lib/constants/venue-codes.ts と完全に一致させること。
/// </summary>
public static class VenueCode
{
    // JV-Data "JyoCD" 01..10 (参照: JV-Data仕様書 コード表 2001)
    private static readonly Dictionary<string, (string Name, string Code)> Map = new()
    {
        ["01"] = ("札幌", "SAP"),
        ["02"] = ("函館", "HKD"),
        ["03"] = ("福島", "FKS"),
        ["04"] = ("新潟", "NII"),
        ["05"] = ("東京", "TOK"),
        ["06"] = ("中山", "NAK"),
        ["07"] = ("中京", "CHU"),
        ["08"] = ("京都", "KYO"),
        ["09"] = ("阪神", "HAN"),
        ["10"] = ("小倉", "KOK"),
    };

    public static (string Name, string Code) Resolve(string jyoCd)
    {
        return Map.TryGetValue(jyoCd, out var v) ? v : ("不明", "TOK");
    }
}
