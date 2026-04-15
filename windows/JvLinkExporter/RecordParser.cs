using System.Globalization;

namespace JvLinkExporter;

/// <summary>
/// JV-Data RA / SE / HR レコード解析。
///
/// ⚠️ 重要: 本ファイルのオフセット値は JV-Data仕様書 v4.8+ を参照して
/// 実機で必ず検証すること。私はMac上で仕様書にアクセスできないため、
/// 公知情報から推定した値を置いている。差異があれば本ファイルのみ修正すれば済む。
///
/// 検証手順:
///   1. `JvLinkExporter.exe --raw-dump --date=YYYY-MM-DD > raw.txt`
///   2. 仕様書の offset 表と raw.txt の record 頭から文字数で突合
///   3. 本ファイルの Offset 定数を修正
///   4. ユニットテストで回帰確認
/// </summary>
public static class RecordParser
{
    /// <summary>レコード種別ID (先頭2バイト)</summary>
    public static string GetRecordType(string record) =>
        record.Length >= 2 ? record.Substring(0, 2) : "";

    // ==================================================================
    // RA: レース詳細レコード
    //   仕様書 4-1 「RA: レース詳細」参照
    // ==================================================================
    public static RaRecord ParseRa(string r)
    {
        // TODO: 以下オフセットは仕様書要検証
        return new RaRecord
        {
            RecordType = Safe(r, 0, 2),
            DataKubun = Safe(r, 2, 1),
            MakeDate = Safe(r, 3, 8),
            Year = Safe(r, 11, 4),
            MonthDay = Safe(r, 15, 4),
            JyoCD = Safe(r, 19, 2),     // 競馬場コード 01..10
            Kaiji = Safe(r, 21, 2),
            Nichiji = Safe(r, 23, 2),
            RaceNum = Safe(r, 25, 2),   // レース番号
            // Race name (full) は仕様書に「漢字」60byte 想定
            RaceName = Safe(r, 32, 60).Trim(),             // TODO: offset要検証
            RaceSubName = Safe(r, 92, 60).Trim(),          // TODO: 副題 offset要検証
            // GradeCD 1文字, TrackCD 2文字, Kyori(距離) 4文字, etc.
            GradeCD = Safe(r, 152, 1),                     // TODO
            TrackCD = Safe(r, 153, 2),                     // TODO: 芝/ダート/障害 の判定に使う
            Kyori = Safe(r, 155, 4),                       // TODO: 距離
            TenkoCD = Safe(r, 159, 1),                     // TODO: 天候コード
            BabaCD_Shiba = Safe(r, 160, 1),                // TODO: 馬場コード(芝)
            BabaCD_Dirt = Safe(r, 161, 1),                 // TODO: 馬場コード(ダート)
            HassoTime = Safe(r, 162, 4),                   // TODO: 発走時刻 HHMM
        };
    }

    // ==================================================================
    // SE: 馬毎レース情報レコード (結果含む)
    //   仕様書 4-2 「SE: 馬毎レース情報」参照
    // ==================================================================
    public static SeRecord ParseSe(string r)
    {
        return new SeRecord
        {
            RecordType = Safe(r, 0, 2),
            Year = Safe(r, 11, 4),
            MonthDay = Safe(r, 15, 4),
            JyoCD = Safe(r, 19, 2),
            Kaiji = Safe(r, 21, 2),
            Nichiji = Safe(r, 23, 2),
            RaceNum = Safe(r, 25, 2),
            Wakuban = Safe(r, 27, 1),          // TODO: 枠番
            Umaban = Safe(r, 28, 2),           // TODO: 馬番
            // 馬名 36byte
            Bamei = Safe(r, 40, 36).Trim(),    // TODO
            SexCD = Safe(r, 76, 1),            // TODO: 性別コード
            BarnAge = Safe(r, 77, 2),          // TODO: 年齢
            Futan = Safe(r, 89, 3),            // TODO: 負担重量 (例: "570" = 57.0)
            KishuName = Safe(r, 100, 34).Trim(), // TODO
            ChokyoshiName = Safe(r, 142, 34).Trim(), // TODO
            KakuteiJyuni = Safe(r, 252, 2),    // TODO: 確定着順
            IJyoCD = Safe(r, 254, 1),          // TODO: 異常区分 (除外/取消/中止/失格等)
            Time = Safe(r, 258, 4),            // TODO: 走破タイム MSSS (例: "1108" = 1:10.8)
            Ninki = Safe(r, 290, 2),           // TODO: 単勝人気順位
            Odds = Safe(r, 292, 4),            // TODO: 単勝オッズ(小数点省略, x.x)
            HaronTimeL3 = Safe(r, 302, 3),     // TODO: 後3F
            HaronTimeL4 = Safe(r, 305, 3),     // TODO: 後4F
        };
    }

    // ==================================================================
    // HR: 払戻レコード
    //   仕様書 4-4 「HR: 払戻」参照
    // ==================================================================
    public static HrRecord ParseHr(string r)
    {
        var hr = new HrRecord
        {
            RecordType = Safe(r, 0, 2),
            Year = Safe(r, 11, 4),
            MonthDay = Safe(r, 15, 4),
            JyoCD = Safe(r, 19, 2),
            Kaiji = Safe(r, 21, 2),
            Nichiji = Safe(r, 23, 2),
            RaceNum = Safe(r, 25, 2),
        };

        // TODO: 以下ブロックのoffsetは仕様書を必ず確認すること。
        // 以下はプレースホルダ構造であり、実機値で必ず調整が必要。
        // 単勝: 3件(馬番2+払戻7+人気2)×3 = 33bytes
        // 複勝: 5件 同様
        // 枠連: 3件(組合せ2+払戻7+人気2)×3
        // 馬連: 3件
        // ワイド: 7件
        // 馬単: 6件
        // 三連複: 3件
        // 三連単: 6件
        // 下記は「入口」だけ用意。実際のoffsetを埋めたら fill-in すれば parse 完成。
        hr.RawTail = r.Length > 27 ? r.Substring(27) : "";
        return hr;
    }

    private static string Safe(string s, int start, int len)
    {
        if (start >= s.Length) return "";
        int actual = Math.Min(len, s.Length - start);
        return s.Substring(start, actual);
    }

    public static int? ParseIntOrNull(string s)
    {
        s = s?.Trim() ?? "";
        if (s.Length == 0 || s.All(c => c == '0')) return null;
        return int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ? v : (int?)null;
    }
}

public sealed class RaRecord
{
    public string RecordType = "", DataKubun = "", MakeDate = "";
    public string Year = "", MonthDay = "", JyoCD = "", Kaiji = "", Nichiji = "", RaceNum = "";
    public string RaceName = "", RaceSubName = "";
    public string GradeCD = "", TrackCD = "", Kyori = "";
    public string TenkoCD = "", BabaCD_Shiba = "", BabaCD_Dirt = "", HassoTime = "";
}

public sealed class SeRecord
{
    public string RecordType = "";
    public string Year = "", MonthDay = "", JyoCD = "", Kaiji = "", Nichiji = "", RaceNum = "";
    public string Wakuban = "", Umaban = "", Bamei = "";
    public string SexCD = "", BarnAge = "", Futan = "";
    public string KishuName = "", ChokyoshiName = "";
    public string KakuteiJyuni = "", IJyoCD = "";
    public string Time = "", Ninki = "", Odds = "";
    public string HaronTimeL3 = "", HaronTimeL4 = "";
}

public sealed class HrRecord
{
    public string RecordType = "";
    public string Year = "", MonthDay = "", JyoCD = "", Kaiji = "", Nichiji = "", RaceNum = "";
    // TODO: 仕様書 4-4 参照して以下を実装
    public List<PayoutEntry> Tansho { get; set; } = new();
    public List<PayoutEntry> Fukusho { get; set; } = new();
    public List<PayoutEntry> Wakuren { get; set; } = new();
    public List<PayoutEntry> Umaren { get; set; } = new();
    public List<PayoutEntry> Wide { get; set; } = new();
    public List<PayoutEntry> Umatan { get; set; } = new();
    public List<PayoutEntry> Sanrenpuku { get; set; } = new();
    public List<PayoutEntry> Sanrentan { get; set; } = new();
    /// <summary>オフセット検証するまで、HRの払戻本体を文字列のまま保持</summary>
    public string RawTail { get; set; } = "";
}
