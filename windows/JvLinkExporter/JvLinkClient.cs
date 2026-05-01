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
///     - 非日本語Windows (CP_ACP=CP1252等): SJIS 各バイトが U+00XX に展開された
///       擬似 UTF-16（"?@?@" のように見える）
///
///   後者を検出し、低バイト列を Shift_JIS で再デコードして UTF-16 に直す。
///   前者は識別子のみで何も変換せず通す（ラウンドトリップで破壊しない）。
/// </summary>
internal static class JvSjisDecoder
{
    private static readonly Encoding SJIS = InitSjis();
    private static Encoding InitSjis()
    {
        // CodePagesEncodingProvider は Program.Main でも登録するが、
        // JvLinkClient の static 初期化が先に走るケースに備えて二重登録（冪等）
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        return Encoding.GetEncoding(932); // == "Shift_JIS"
    }

    /// <summary>
    /// JV-Link から受け取った string を、SJIS bytes-as-chars 形式なら
    /// 正しい UTF-16 に復元する。既に正しい UTF-16 ならそのまま返す。
    /// </summary>
    public static string Decode(string raw)
    {
        if (string.IsNullOrEmpty(raw)) return raw ?? "";

        // Case A 判定: U+0100 以上の文字が1つでも含まれていれば
        //   COM 側で proper SJIS→UTF-16 変換が完了している（日本語Windows等）
        //   → そのまま返す（再変換すると壊れる）
        bool hasProperUnicode = false;
        for (int i = 0; i < raw.Length; i++)
        {
            if (raw[i] > 0xFF) { hasProperUnicode = true; break; }
        }
        if (hasProperUnicode) return raw;

        // Case B: 各 char の低位バイトを SJIS バイト列として復元してデコード
        var bytes = new byte[raw.Length];
        for (int i = 0; i < raw.Length; i++)
        {
            bytes[i] = (byte)(raw[i] & 0xFF);
        }
        try { return SJIS.GetString(bytes); }
        catch { return raw; }
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
