using System.Globalization;
using System.Text;

namespace JvLinkExporter;

/// <summary>
/// JV-Data RA / SE / HR レコード解析。
///
/// 2026-04-20 更新: 2026-04-11 raw dump の実データから offset を再決定した。
///   - HR 全券種: 実測で確定 (3サンプル整合)
///   - RA Kyori/TrackCD/HassoTime: 実測で確定
///   - SE 前半フィールド: 実測で確定
///   - SE 結果系 (KakuteiJyuni/Ninki/Odds/Time/HaronL3/IJyoCD):
///       取得データのSE record は SJIS 553 bytes で結果領域 (>553) が未収録。
///       DataKubun='7' が通常の成績データと異なる variant と推定。
///       debug hex dump + 仕様書で要再検証 (TODO)。
/// </summary>
public static class RecordParser
{
    /// <summary>レコード種別ID (先頭2バイト)</summary>
    public static string GetRecordType(string record) =>
        record.Length >= 2 ? record.Substring(0, 2) : "";

    // ==================================================================
    // RA: レース詳細レコード
    // ==================================================================
    private const int RA_OFF_HONDAI       = 32;   // RaceName_Hondai (60)
    private const int RA_OFF_FUKUDAI      = 92;   // (60)
    private const int RA_OFF_KAKKO        = 152;  // (60)
    private const int RA_OFF_RYAKU10      = 572;  // (20)
    private const int RA_OFF_RYAKU6       = 592;  // (12)
    private const int RA_OFF_RYAKU3       = 604;  // (6)
    private const int RA_OFF_KUBUN        = 610;  // (1)
    private const int RA_OFF_NKAI         = 611;  // (3)
    private const int RA_OFF_GRADE        = 614;  // (1)
    // 競走条件系 (実測offset, 2026-04-11 raw dump で検証済)
    private const int RA_OFF_SYUBETU      = 616;  // (2) 競走種別CD: 11=2歳, 12=3歳, 14=4歳上, 18-20=障害 等
    private const int RA_OFF_KIGO         = 618;  // (3) 競走記号CD
    private const int RA_OFF_JURYO        = 621;  // (1) 重量種別CD
    private const int RA_OFF_JOKEN1       = 622;  // (3) 条件CD - 2歳
    private const int RA_OFF_JOKEN2       = 625;  // (3) 条件CD - 3歳
    private const int RA_OFF_JOKEN3       = 628;  // (3) 条件CD - 4歳
    private const int RA_OFF_JOKEN4       = 631;  // (3) 条件CD - 5歳上
    private const int RA_OFF_JOKEN5       = 634;  // (3) 条件CD - 混合
    private const int RA_OFF_JOKENNAME    = 637;  // (60) 条件名（テキスト直、空のことも多い）
    // 2026-04-11 実測: Kyori/TrackCD/HassoTime は仕様推定値より大きくズレていた
    private const int RA_OFF_KYORI        = 697;  // (4) was 632 — RA 0890 で "1700" 確認
    private const int RA_OFF_TRACK        = 705;  // (2) was 640 — "24" (ダート左外) 確認
    private const int RA_OFF_HASSO        = 873;  // (4) was 854 — R1 "0945", R10 "1440" 確認
    // TenkoCD / BabaCD は末尾スキャン方式 (RaTailScan) で取得

    public static RaRecord ParseRa(string r)
    {
        return new RaRecord
        {
            RecordType   = Safe(r, 0, 2),
            DataKubun    = Safe(r, 2, 1),
            MakeDate     = Safe(r, 3, 8),
            Year         = Safe(r, 11, 4),
            MonthDay     = Safe(r, 15, 4),
            JyoCD        = Safe(r, 19, 2),
            Kaiji        = Safe(r, 21, 2),
            Nichiji      = Safe(r, 23, 2),
            RaceNum      = Safe(r, 25, 2),
            RaceName     = SafeBytes(r, RA_OFF_HONDAI, 60).Trim(),
            RaceSubName  = SafeBytes(r, RA_OFF_FUKUDAI, 60).Trim(),
            RaceNameRyakusho10 = SafeBytes(r, RA_OFF_RYAKU10, 20).Trim(),
            RaceNameRyakusho6  = SafeBytes(r, RA_OFF_RYAKU6, 12).Trim(),
            GradeCD      = SafeBytes(r, RA_OFF_GRADE, 1),
            SyubetuCD    = SafeBytes(r, RA_OFF_SYUBETU, 2),
            KigoCD       = SafeBytes(r, RA_OFF_KIGO, 3),
            JuryoCD      = SafeBytes(r, RA_OFF_JURYO, 1),
            JokenCD1     = SafeBytes(r, RA_OFF_JOKEN1, 3),
            JokenCD2     = SafeBytes(r, RA_OFF_JOKEN2, 3),
            JokenCD3     = SafeBytes(r, RA_OFF_JOKEN3, 3),
            JokenCD4     = SafeBytes(r, RA_OFF_JOKEN4, 3),
            JokenCD5     = SafeBytes(r, RA_OFF_JOKEN5, 3),
            JokenName    = SafeBytes(r, RA_OFF_JOKENNAME, 60).Trim(),
            TrackCD      = SafeBytes(r, RA_OFF_TRACK, 2),
            Kyori        = SafeBytes(r, RA_OFF_KYORI, 4),
            HassoTime    = SafeBytes(r, RA_OFF_HASSO, 4),
        };
    }

    /// <summary>
    /// RA レコード末尾を後方スキャンして TenkoCD / BabaCD_Shiba / BabaCD_Dirt を抽出する。
    /// (ロジックは従来通り)
    /// </summary>
    public static (string tenko, string babaShiba, string babaDirt) RaTailScan(string r, string? surfaceCode)
    {
        if (string.IsNullOrEmpty(r)) return ("", "", "");
        const int SCAN_LEN = 30;
        int len = r.Length;
        int start = Math.Max(0, len - SCAN_LEN);
        bool useShiba = surfaceCode == "T" || surfaceCode == "O";
        bool useDirt  = surfaceCode == "D";
        bool dbg = Environment.GetEnvironmentVariable("JVDBG_TAILSCAN") == "1";

        (int score, int idx, char a, char b, char c, string reason) best =
            (-1, -1, '\0', '\0', '\0', "");

        for (int i = len - 3; i >= start; i--)
        {
            char a = r[i], b = r[i + 1], c = r[i + 2];
            if (!char.IsDigit(a) || !char.IsDigit(b) || !char.IsDigit(c)) continue;
            int va = a - '0', vb = b - '0', vc = c - '0';
            if (va < 1 || va > 6) continue;
            if (vb < 0 || vb > 4) continue;
            if (vc < 0 || vc > 4) continue;

            char prev = (i > 0) ? r[i - 1] : ' ';
            char next = (i + 3 < len) ? r[i + 3] : ' ';
            if (!IsSeparator(prev) || !IsSeparator(next))
            {
                if (dbg) Console.Error.WriteLine(
                    $"[tailscan-reject] idx={i} triple='{a}{b}{c}' prev='{(char.IsControl(prev) ? '.' : prev)}'(dec={(int)prev}) next='{(char.IsControl(next) ? '.' : next)}'(dec={(int)next}) reason=separator-fail");
                continue;
            }

            int score = 0;
            var reasons = new List<string>();
            score += 1; reasons.Add("tenko-range");
            score += 1; reasons.Add("baba-range");
            if (useShiba && vb >= 1 && vb <= 4) { score += 2; reasons.Add("track-shiba"); }
            if (useDirt  && vc >= 1 && vc <= 4) { score += 2; reasons.Add("track-dirt"); }
            if (useShiba && vc == 0)             { score += 1; reasons.Add("dirt-zero"); }
            if (useDirt  && vb == 0)             { score += 1; reasons.Add("shiba-zero"); }

            if (dbg) Console.Error.WriteLine(
                $"[tailscan-cand] idx={i} triple='{a}{b}{c}' score={score} reasons=[{string.Join(",", reasons)}]");

            if (score > best.score || (score == best.score && i > best.idx))
                best = (score, i, a, b, c, string.Join(",", reasons));
        }

        if (best.score < 0)
        {
            if (dbg) Console.Error.WriteLine($"[tailscan-result] no-candidate surface='{surfaceCode}'");
            return ("", "", "");
        }

        int threshold = (useShiba || useDirt) ? 4 : 2;
        if (best.score < threshold)
        {
            if (dbg) Console.Error.WriteLine(
                $"[tailscan-result] below-threshold score={best.score} threshold={threshold} idx={best.idx} triple='{best.a}{best.b}{best.c}' surface='{surfaceCode}'");
            return ("", "", "");
        }

        if (dbg) Console.Error.WriteLine(
            $"[tailscan-result] adopted idx={best.idx} triple='{best.a}{best.b}{best.c}' score={best.score} surface='{surfaceCode}' reasons=[{best.reason}]");
        return (best.a.ToString(), best.b.ToString(), best.c.ToString());
    }

    private static bool IsSeparator(char ch)
    {
        if (ch == '0' || ch == ' ') return true;
        if (char.IsControl(ch)) return true;
        return false;
    }

    // ==================================================================
    // SE: 馬毎レース情報レコード
    // ==================================================================
    // 2026-04-11 raw (SJIS 553 bytes) 実測値:
    //   [0:27]    共通ヘッダ
    //   [27]      Wakuban (1)
    //   [28:30]   Umaban (2)
    //   [30:40]   KettoNum (10)
    //   [40:76]   Bamei (36)
    //   [76:78]   UmaKigoCD (2)
    //   [78]      SexCD (1)      ← 従来 80 だったのは UmaKigo=3 byte と誤推定
    //   [79]      HinsyuCD (1)
    //   [80:82]   KeiroCD (2)
    //   [82:84]   BarnAge (2)    ← 従来 85
    //   [84]      TozaiCD (1)
    //   [85:90]   ChokyoshiCode (5) ← 従来 88
    //   [90:98]   ChokyoshiRyakusho (8) ← 従来 93
    //   [98:104]  BanushiCode (6)   ← 従来 101
    //   [104:144] BanushiName (40)  ← 従来 107
    //   [144:204] Fukushoku (60)    ← 従来 147
    //   [204:288] (未解析領域 / 地方成績等 約84 bytes)
    //   [288:291] Futan (3)     ← 従来 249
    //   [291]     Blinker (1)   ← 従来 252
    //   [292:296] (4 bytes 不明)
    //   [296:301] KishuCode (5) ← 従来 207
    //   [306:314] KishuRyakusho (8) ← 従来 212 (長さ 34→8 に修正)
    //   [314:]    各種未解析フィールド
    //   [533:537] BaTaijuZougen (+XXX, sign+3digits) 確認
    //   [537:553] 結果系の候補領域だが構造不明 (TODO)
    private const int SE_OFF_BAMEI        = 40;   // (36)
    private const int SE_OFF_SEXCD        = 78;   // (1)
    private const int SE_OFF_BAREI        = 82;   // (2)
    private const int SE_OFF_CHOKYO_CODE  = 85;   // (5)
    private const int SE_OFF_CHOKYO_NAME  = 90;   // (8) 調教師名略称
    private const int SE_OFF_BANUSHI_CODE = 98;   // (6)
    private const int SE_OFF_BANUSHI_NAME = 104;  // (40)
    private const int SE_OFF_FUKUSHOKU    = 144;  // (60)
    private const int SE_OFF_FUTAN        = 288;  // (3)
    private const int SE_OFF_BLINKER      = 291;  // (1)
    private const int SE_OFF_KISHU_CODE   = 296;  // (5)
    private const int SE_OFF_KISHU_NAME   = 306;  // (8) 騎手名略称 (長さ 8, 34 ではない)

    // --- TODO: 結果系 offset 要再検証 ---
    // 現状の取得データ (SE 553 bytes / DataKubun='7') には結果領域が収録されない
    // ため、以下は常に空文字返し。debug hex dump (--debug) と JV-Data 仕様書で
    // 確定次第、offset を埋めて ParseSe 内で読み取る。

    public static SeRecord ParseSe(string r)
    {
        return new SeRecord
        {
            RecordType    = Safe(r, 0, 2),
            Year          = Safe(r, 11, 4),
            MonthDay      = Safe(r, 15, 4),
            JyoCD         = Safe(r, 19, 2),
            Kaiji         = Safe(r, 21, 2),
            Nichiji       = Safe(r, 23, 2),
            RaceNum       = Safe(r, 25, 2),
            Wakuban       = Safe(r, 27, 1),
            Umaban        = Safe(r, 28, 2),
            Bamei         = SafeBytes(r, SE_OFF_BAMEI, 36).Trim(),
            SexCD         = SafeBytes(r, SE_OFF_SEXCD, 1),
            BarnAge       = SafeBytes(r, SE_OFF_BAREI, 2),
            Futan         = SafeBytes(r, SE_OFF_FUTAN, 3),
            ChokyoshiName = SafeBytes(r, SE_OFF_CHOKYO_NAME, 8).Trim(),
            KishuName     = SafeBytes(r, SE_OFF_KISHU_NAME, 8).Trim(),
            // 結果系は TODO: offset 未確定のため空文字
            KakuteiJyuni  = "",
            IJyoCD        = "",
            Time          = "",
            Ninki         = "",
            Odds          = "",
            HaronTimeL3   = "",
            HaronTimeL4   = "",
        };
    }

    // ==================================================================
    // HR: 払戻レコード (JV-Data 仕様書 4-4)
    // 2026-04-11 raw dump で全3サンプル整合確認済
    //
    //   [0:27]    共通ヘッダ
    //   [27:29]   TorokuTosu (2)
    //   [29:31]   SyussoTosu (2)
    //   [31:102]  Flags 領域 (71 bytes, 未解析 — 全ゼロ)
    //   [102:141] Tansho      3 slots × 13 (Uma2 + Pay9 + Ninki2)
    //   [141:206] Fukusho     5 slots × 13
    //   [206:245] Wakuren     3 slots × 13 (Kumi2)
    //   [245:293] Umaren      3 slots × 16 (Kumi4 + Pay9 + Ninki3)
    //   [293:405] Wide        7 slots × 16
    //   [405:453] Reserved    48 bytes (skip)
    //   [453:549] Umatan      6 slots × 16
    //   [549:603] Sanrenpuku  3 slots × 18 (Kumi6 + Pay9 + Ninki3)
    //   [603:717] Sanrentan   6 slots × 19 (Kumi6 + Pay9 + Ninki4)
    // ==================================================================
    private const int HR_OFF_TANSHO     = 102;
    private const int HR_OFF_FUKUSHO    = 141;
    private const int HR_OFF_WAKUREN    = 206;
    private const int HR_OFF_UMAREN     = 245;
    private const int HR_OFF_WIDE       = 293;
    private const int HR_OFF_UMATAN     = 453;  // 405-452 は Reserved
    private const int HR_OFF_SANRENPUKU = 549;
    private const int HR_OFF_SANRENTAN  = 603;

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
        hr.Tansho     = ParsePayouts(r, HR_OFF_TANSHO,     slots: 3, kumiLen: 2, payLen: 9, ninkiLen: 2, single: true);
        hr.Fukusho    = ParsePayouts(r, HR_OFF_FUKUSHO,    slots: 5, kumiLen: 2, payLen: 9, ninkiLen: 2, single: true);
        hr.Wakuren    = ParsePayouts(r, HR_OFF_WAKUREN,    slots: 3, kumiLen: 2, payLen: 9, ninkiLen: 2, single: false);
        hr.Umaren     = ParsePayouts(r, HR_OFF_UMAREN,     slots: 3, kumiLen: 4, payLen: 9, ninkiLen: 3, single: false);
        hr.Wide       = ParsePayouts(r, HR_OFF_WIDE,       slots: 7, kumiLen: 4, payLen: 9, ninkiLen: 3, single: false);
        hr.Umatan     = ParsePayouts(r, HR_OFF_UMATAN,     slots: 6, kumiLen: 4, payLen: 9, ninkiLen: 3, single: false);
        hr.Sanrenpuku = ParsePayouts(r, HR_OFF_SANRENPUKU, slots: 3, kumiLen: 6, payLen: 9, ninkiLen: 3, single: false);
        hr.Sanrentan  = ParsePayouts(r, HR_OFF_SANRENTAN,  slots: 6, kumiLen: 6, payLen: 9, ninkiLen: 4, single: false);
        hr.RawTail = r.Length > 27 ? r.Substring(27) : "";
        return hr;
    }

    /// <summary>
    /// HR ペイアウトセクションを一括パース。
    /// HR 内容は全て ASCII なので char offset = SJIS byte offset。
    /// 未使用スロット (payout=0) は結果に含めない。
    /// </summary>
    private static List<PayoutEntry> ParsePayouts(string r, int start, int slots, int kumiLen, int payLen, int ninkiLen, bool single)
    {
        var list = new List<PayoutEntry>();
        int entrySize = kumiLen + payLen + ninkiLen;
        for (int i = 0; i < slots; i++)
        {
            int off = start + i * entrySize;
            if (off + entrySize > r.Length) break;
            var kumi  = r.Substring(off, kumiLen);
            var pay   = r.Substring(off + kumiLen, payLen);
            var ninki = r.Substring(off + kumiLen + payLen, ninkiLen);

            // 未使用スロット (空白 / 全ゼロ払戻) はスキップ
            if (string.IsNullOrWhiteSpace(kumi)) continue;
            var payInt = ParseIntOrNull(pay);
            if (!payInt.HasValue) continue;

            var entry = new PayoutEntry
            {
                Payout = payInt.Value,
                Popularity = ParseIntOrNull(ninki),
            };
            if (single) entry.Number = TrimLeadingZeros(kumi);
            else        entry.Combination = FormatKumi(kumi);
            list.Add(entry);
        }
        return list;
    }

    /// <summary>"01" → "1", "13" → "13", "00" → "0"</summary>
    private static string TrimLeadingZeros(string s)
    {
        var t = (s ?? "").Trim();
        var stripped = t.TrimStart('0');
        return stripped.Length == 0 ? "0" : stripped;
    }

    /// <summary>
    /// Kumi 文字列を表示形式に整形。
    ///   "67"     (Wakuren 枠ペア)     → "6-7"
    ///   "1113"   (馬ペア)             → "11-13"
    ///   "111314" (三連複/三連単)      → "11-13-14"
    /// </summary>
    private static string FormatKumi(string kumi)
    {
        var s = (kumi ?? "").Trim();
        if (s.Length == 2) return $"{s[0]}-{s[1]}";
        if (s.Length == 4) return $"{TrimLeadingZeros(s.Substring(0, 2))}-{TrimLeadingZeros(s.Substring(2, 2))}";
        if (s.Length == 6) return $"{TrimLeadingZeros(s.Substring(0, 2))}-{TrimLeadingZeros(s.Substring(2, 2))}-{TrimLeadingZeros(s.Substring(4, 2))}";
        return s;
    }

    private static string Safe(string s, int start, int len)
    {
        if (start >= s.Length) return "";
        int actual = Math.Min(len, s.Length - start);
        return s.Substring(start, actual);
    }

    // ==================================================================
    // WH: 馬体重レコード (速報・dataspec=0B11)
    // 共通ヘッダオフセットは RA/SE/HR と同じレイアウトを想定。
    // 馬番別の体重明細は本クラスでは未パース（race key 抽出のみ用途）。
    // ==================================================================
    public static WhRecord ParseWh(string r)
    {
        return new WhRecord
        {
            RecordType = Safe(r, 0, 2),
            DataKubun  = Safe(r, 2, 1),
            MakeDate   = Safe(r, 3, 8),
            Year       = Safe(r, 11, 4),
            MonthDay   = Safe(r, 15, 4),
            JyoCD      = Safe(r, 19, 2),
            Kaiji      = Safe(r, 21, 2),
            Nichiji    = Safe(r, 23, 2),
            RaceNum    = Safe(r, 25, 2),
            HappyoTime = Safe(r, 27, 4),
            Raw        = r,
        };
    }

    // ================================================================
    // Shift_JIS バイトオフセット対応
    // JV-Link COM は Shift_JIS → Unicode 変換済みの string を返す。
    // JV-Data 仕様書のオフセットは Shift_JIS バイト位置のため、
    // 日本語フィールド以降は Safe() の charOffset ではズレが生じる。
    // SafeBytes は一旦 Shift_JIS bytes に戻してからバイト位置で切り出す。
    // ================================================================
    private static readonly Encoding SJIS = InitSjis();
    private static Encoding InitSjis()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        return Encoding.GetEncoding("shift_jis");
    }

    public static string SafeBytes(string s, int byteStart, int byteLen)
    {
        if (string.IsNullOrEmpty(s)) return "";
        byte[] bytes;
        try { bytes = SJIS.GetBytes(s); }
        catch { return Safe(s, byteStart, byteLen); }
        if (byteStart >= bytes.Length) return "";
        int actual = Math.Min(byteLen, bytes.Length - byteStart);
        return SJIS.GetString(bytes, byteStart, actual);
    }

    public static int? ParseIntOrNull(string s)
    {
        var raw = s ?? "";
        s = raw.Trim();
        if (s.Length == 0 || s.All(c => c == '0'))
        {
            if (Environment.GetEnvironmentVariable("JVDBG_PARSEINT") == "1")
                Console.Error.WriteLine($"[parseInt-null] raw='{raw}' trimmed='{s}'");
            return null;
        }
        if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)) return v;
        if (Environment.GetEnvironmentVariable("JVDBG_PARSEINT") == "1")
            Console.Error.WriteLine($"[parseInt-fail] raw='{raw}'");
        return null;
    }
}

public sealed class RaRecord
{
    public string RecordType = "", DataKubun = "", MakeDate = "";
    public string Year = "", MonthDay = "", JyoCD = "", Kaiji = "", Nichiji = "", RaceNum = "";
    public string RaceName = "", RaceSubName = "";
    public string RaceNameRyakusho10 = "", RaceNameRyakusho6 = "";
    public string GradeCD = "", TrackCD = "", Kyori = "";
    public string TenkoCD = "", BabaCD_Shiba = "", BabaCD_Dirt = "", HassoTime = "";
    // 競走条件系
    public string SyubetuCD = "", KigoCD = "", JuryoCD = "";
    public string JokenCD1 = "", JokenCD2 = "", JokenCD3 = "", JokenCD4 = "", JokenCD5 = "";
    public string JokenName = "";
}

public sealed class SeRecord
{
    public string RecordType = "";
    public string Year = "", MonthDay = "", JyoCD = "", Kaiji = "", Nichiji = "", RaceNum = "";
    public string Wakuban = "", Umaban = "", Bamei = "";
    public string SexCD = "", BarnAge = "", Futan = "";
    public string KishuName = "", ChokyoshiName = "";
    // 以下 TODO: 結果系 offset が未確定のため ParseSe では常に空文字
    public string KakuteiJyuni = "", IJyoCD = "";
    public string Time = "", Ninki = "", Odds = "";
    public string HaronTimeL3 = "", HaronTimeL4 = "";
}

public sealed class HrRecord
{
    public string RecordType = "";
    public string Year = "", MonthDay = "", JyoCD = "", Kaiji = "", Nichiji = "", RaceNum = "";
    public List<PayoutEntry> Tansho { get; set; } = new();
    public List<PayoutEntry> Fukusho { get; set; } = new();
    public List<PayoutEntry> Wakuren { get; set; } = new();
    public List<PayoutEntry> Umaren { get; set; } = new();
    public List<PayoutEntry> Wide { get; set; } = new();
    public List<PayoutEntry> Umatan { get; set; } = new();
    public List<PayoutEntry> Sanrenpuku { get; set; } = new();
    public List<PayoutEntry> Sanrentan { get; set; } = new();
    /// <summary>払戻領域のoffset確定後は未使用。互換のため残置。</summary>
    public string RawTail { get; set; } = "";
}

/// <summary>
/// WH: 馬体重レコード（速報・dataspec=0B11）
///
/// JV-Data 仕様（JV-Linkリファレンス）:
///   [0:2]    "WH"
///   [2:3]    DataKubun (1)
///   [3:11]   MakeDate "yyyymmdd" (8) ← データ作成日
///   [11:15]  Year (4)
///   [15:19]  MonthDay (4)
///   [19:21]  JyoCD (2)
///   [21:23]  Kaiji (2)
///   [23:25]  Nichiji (2)
///   [25:27]  RaceNum (2)
///   [27:31]  HappyoTime (HHMM, 4 bytes)
///   [31:]    馬番別の体重データ (繰り返し: Umaban(2) + BaTaiju(3) + ZogenFugo(1) + ZogenSa(3) = 9bytes/頭)
///
/// 主用途: 0B11 でWHレコードしか返らない場合、ここから race key を抽出して
///         0B12 等の race-level key 必須 dataspec を再呼び出しするための情報源として使う。
/// </summary>
public sealed class WhRecord
{
    public string RecordType = "";
    public string DataKubun = "";
    public string MakeDate = "";   // [3:11] 8桁
    public string Year = "", MonthDay = "", JyoCD = "", Kaiji = "", Nichiji = "", RaceNum = "";
    public string HappyoTime = "";

    /// <summary>WHレコードの生 charデータ (key variant のraw切り出しに使用)。</summary>
    public string Raw = "";

    /// <summary>race-level key 形式 "yyyymmddJJKKHHRR" (16桁)</summary>
    public string RaceKey16
    {
        get
        {
            if (string.IsNullOrEmpty(Year) || string.IsNullOrEmpty(MonthDay)) return "";
            return $"{Year}{MonthDay}{JyoCD}{Kaiji}{Nichiji}{RaceNum}";
        }
    }
}
