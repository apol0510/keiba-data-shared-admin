using System.Runtime.InteropServices;
using System.Text;

namespace JvLinkExporter;

/// <summary>
/// JV-Link 受信文字列を Shift_JIS として正しく解釈するためのヘルパー。
///
/// 背景:
///   JV-Link は内部で SJIS バイト列を返すが、COM の BSTR 経由で受け取る際に
///   実行環境の ANSI codepage (CP_ACP) によって解釈が変わる。
///     - 日本語Windows (CP_ACP=CP932/SJIS): 完全変換され U+3000 等の正しい UTF-16
///     - 非日本語Windows (CP_ACP=CP1252等): SJIS 各バイトがCP1252マッピングで
///       smart quote (U+201C/D等) や Latin-1 (U+0080-U+00FF) に化ける
///     - さらに環境によっては ASCII fold が走り 0xE4(ä) → 'a' のように
///       ロッシーに変換されるケースもある（この場合バイトが失われ完全復元は不可）
///
///   3つの復元戦略を並行に試して、最も「日本語らしい」結果を採用する。
///   既に正しい UTF-16 ならそのまま返す（破壊しない）。
///
/// 限界:
///   ASCII fold 等のロッシーな変換が掛かったケースでは元のバイトが失われている
///   ため、本ヘルパーでは完全には復元できない。完全な解決には Windows の
///   「Unicode 非対応プログラム用の言語」を日本語に設定する必要がある。
/// </summary>
internal static class JvSjisDecoder
{
    private static readonly Encoding SJIS = InitEncoding(932);
    private static readonly Encoding CP1252 = InitEncoding(1252);

    private static Encoding InitEncoding(int codepage)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        return Encoding.GetEncoding(codepage);
    }

    /// <summary>CJK / 仮名 / 全角記号 を含む文字数をカウント（日本語らしさ指標）</summary>
    private static int CountCjkLike(string s)
    {
        if (string.IsNullOrEmpty(s)) return 0;
        int n = 0;
        foreach (var c in s)
        {
            int cp = c;
            if ((cp >= 0x3000 && cp <= 0x303F) ||  // CJK Symbols (全角空白等)
                (cp >= 0x3040 && cp <= 0x309F) ||  // Hiragana
                (cp >= 0x30A0 && cp <= 0x30FF) ||  // Katakana
                (cp >= 0x3400 && cp <= 0x9FFF) ||  // CJK Unified Ideographs
                (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK Compatibility
                (cp >= 0xFF00 && cp <= 0xFFEF))    // Halfwidth / Fullwidth Forms
                n++;
        }
        return n;
    }

    /// <summary>
    /// 文字化けらしさを検出（CP1252経由の崩れや「?@」連続パターン等）。
    /// CJK が含まれていても、これらの兆候があれば「壊れている」と判断する。
    /// </summary>
    private static bool LooksLikeMojibake(string s)
    {
        if (string.IsNullOrEmpty(s)) return false;
        int suspicious = 0;
        int qatPairs = 0;          // "?@" 連続 = SJIS 0x81 0x40 (全角空白) の典型崩れ
        bool hasMojibakeMarker = false;
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            // よく出現する文字化けマーカー
            if (c == '�' ||                                  // U+FFFD replacement
                c == '窶' || c == '繝' || c == '蜻' || c == '荵' || // よくあるUTF-8as-SJIS文字化け
                c == 'Â' || c == 'ã' || c == ' ')   // Latin-1 supplementの典型崩れ
            { hasMojibakeMarker = true; suspicious++; continue; }
            // CP1252 由来のスマートクォート/ダッシュ系
            if ((c >= '‘' && c <= '‟') ||
                (c >= '–' && c <= '—') ||
                c == '…' || c == '•' || c == '‰')
            { suspicious++; continue; }
            // U+0080-U+009F (C1 control) は通常テキストに出ない
            if (c >= '\u0080' && c <= '\u009F') { suspicious++; continue; }
            // "?@" 連続検出
            if (c == '?' && i + 1 < s.Length && s[i + 1] == '@') { qatPairs++; suspicious += 2; i++; continue; }
        }
        if (hasMojibakeMarker) return true;
        if (qatPairs >= 3) return true;                    // "?@" が3回以上 → 全角空白の連続崩れ
        if (s.Length > 0 && (suspicious * 100 / s.Length) >= 25) return true; // 25%以上が文字化け候補
        return false;
    }

    /// <summary>
    /// JV-Link から受け取った string を、SJIS の各種文字化けパターンから復元する。
    ///   1. 既に CJK 多数 ＋ mojibake 痕跡なし → そのまま（CaseA: 日本語Windows）
    ///   2. 各 char 低位バイト → SJIS デコード（CaseB-1: identity マッピング）
    ///   3. CP1252 経由 → SJIS デコード（CaseB-2: smart quote 等が混入したケース）
    ///   最も CJK チャンクが多い結果を採用。すべて失敗時は原文を返す。
    /// </summary>
    public static string Decode(string raw)
    {
        if (string.IsNullOrEmpty(raw)) return raw ?? "";

        int origCjk = CountCjkLike(raw);
        bool origMojibake = LooksLikeMojibake(raw);

        // CJK が含まれていて、かつ文字化け兆候が無ければ proper UTF-16 として素通し
        if (origCjk > 0 && !origMojibake) return raw;

        string best = raw;
        int bestScore = origCjk;

        // ── 戦略A: 低位バイト識別マッピング → SJIS デコード ──
        // U+00FF 以下のみで構成される場合に有効（COM が identity 1-byte-per-char）
        bool allLow = true;
        for (int i = 0; i < raw.Length; i++) if (raw[i] > 0xFF) { allLow = false; break; }
        if (allLow)
        {
            try
            {
                var bytes = new byte[raw.Length];
                for (int i = 0; i < raw.Length; i++) bytes[i] = (byte)(raw[i] & 0xFF);
                var dec = SJIS.GetString(bytes);
                if (IsBetterRecovery(dec, bestScore))
                {
                    best = dec; bestScore = CountCjkLike(dec);
                }
            }
            catch { /* fallthrough */ }
        }

        // ── 戦略B: CP1252 経由 → SJIS デコード ──
        // smart quote 等の高位コードポイントが混じった文字化けに有効
        try
        {
            var bytes = CP1252.GetBytes(raw);
            var dec = SJIS.GetString(bytes);
            if (IsBetterRecovery(dec, bestScore))
            {
                best = dec; bestScore = CountCjkLike(dec);
            }
        }
        catch { /* fallthrough */ }

        return best;
    }

    /// <summary>
    /// 復元結果を採用するかの判定。
    /// 既存より CJK が多く、かつ mojibake 兆候が無い場合のみ「より良い」とみなす。
    /// （部分復元で間違った CJK が混じる lossy 変換を防ぐため厳しめに判定する）
    /// </summary>
    private static bool IsBetterRecovery(string candidate, int currentBestScore)
    {
        int score = CountCjkLike(candidate);
        if (score == 0) return false;
        if (score <= currentBestScore) return false;
        if (LooksLikeMojibake(candidate)) return false;
        return true;
    }
}

/// <summary>
/// JV-Link COM 呼び出しラッパー。
///
/// - ProgID: "JVDTLab.JVLink"
/// - 主要メソッド: JVInit / JVOpen / JVRead / JVClose
/// - dataspec="RACE" で RA/SE/HR/HC 等のレース結果関連レコードが一括取得できる。
/// - 戻りコード:
///     >0 : 読み込みバイト数
///     -1 : ファイル切替 (ファイル名更新)
///      0 : 終端
///    <-1 : エラー
/// </summary>
public sealed class JvLinkClient : IDisposable
{
    private readonly dynamic _jv;
    private bool _initialized;

    public JvLinkClient()
    {
        var t = Type.GetTypeFromProgID("JVDTLab.JVLink")
            ?? throw new InvalidOperationException("ProgID 'JVDTLab.JVLink' が見つかりません。JV-Linkが未登録です。");
        _jv = Activator.CreateInstance(t)!;
    }

    /// <summary>
    /// <param name="sid">JRA-VAN 利用者ID。環境変数 JVLINK_SID から取るのが推奨。</param>
    /// </summary>
    public void Init(string sid)
    {
        int ret = _jv.JVInit(sid);
        if (ret != 0) throw new JvLinkException($"JVInit failed (ret={ret}). Sidが未登録/期限切れの可能性。");
        _initialized = true;
    }

    /// <summary>
    /// 指定日 (yyyyMMdd) の当該日分だけを取得するために fromtime="yyyyMMdd000000" 、
    /// option=1 (通常データ) または 2 (セットアップ) を指定。
    /// </summary>
    public OpenResult Open(string dataspec, string fromtime, int option)
    {
        int readCount = 0;
        int downloadCount = 0;
        string lastFileTimestamp = "";
        object oReadCount = 0;
        object oDownloadCount = 0;
        object oLastFileTimestamp = "";
        int ret = _jv.JVOpen(dataspec, fromtime, option, ref oReadCount, ref oDownloadCount, ref oLastFileTimestamp);
        if (ret != 0) throw new JvLinkException($"JVOpen failed (ret={ret}) dataspec={dataspec} from={fromtime}");
        return new OpenResult {
            ReadCount = Convert.ToInt32(oReadCount),
            DownloadCount = Convert.ToInt32(oDownloadCount),
            LastFileTimestamp = oLastFileTimestamp?.ToString() ?? ""
        };
    }

    /// <summary>
    /// 1レコードずつ読み出す。ret==0 で終端、ret==-1 でファイル切替（ループ継続）、ret&lt;-1 でエラー。
    /// </summary>
    public JvReadResult Read(int bufSize = 110000)
    {
        object oBuf = new string(' ', bufSize);
        object oSize = bufSize;
        object oFile = new string(' ', 256);
        int ret = _jv.JVRead(ref oBuf, ref oSize, ref oFile);

        // JV-Link は SJIS バイト列を返すため、非日本語Windowsでは BSTR 経由で
        // 「各 SJIS バイトが U+00XX に展開された擬似UTF-16」が届くことがある。
        // JvSjisDecoder.Decode で Shift_JIS として解釈しなおして UTF-16 に直す。
        //
        // 注: Record は固定オフセットでバイト位置参照する RecordParser に渡すため、
        //     末尾NULトリムは行わない（FileName のみ末尾NUL/空白を除去する）。
        var rawRecord = ret > 0 ? (oBuf?.ToString() ?? "") : "";
        var rawFile = oFile?.ToString() ?? "";
        return new JvReadResult
        {
            ReturnCode = ret,
            Record = JvSjisDecoder.Decode(rawRecord),
            FileName = JvSjisDecoder.Decode(rawFile).TrimEnd('\0', ' '),
        };
    }

    public void Close()
    {
        try { _jv.JVClose(); } catch { /* noop */ }
    }

    public void Dispose()
    {
        if (_initialized) Close();
        try { Marshal.FinalReleaseComObject(_jv); } catch { /* noop */ }
    }
}

public sealed class OpenResult
{
    public int ReadCount { get; set; }
    public int DownloadCount { get; set; }
    public string LastFileTimestamp { get; set; } = "";
}

public sealed class JvReadResult
{
    public int ReturnCode { get; set; }
    public string Record { get; set; } = "";
    public string FileName { get; set; } = "";
}

public sealed class JvLinkException : Exception
{
    public JvLinkException(string msg) : base(msg) {}
}
