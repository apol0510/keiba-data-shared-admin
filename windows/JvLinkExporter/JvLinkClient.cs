using System.Runtime.InteropServices;
using System.Text;

namespace JvLinkExporter;

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
        return new JvReadResult
        {
            ReturnCode = ret,
            Record = ret > 0 ? (oBuf?.ToString() ?? "") : "",
            FileName = oFile?.ToString()?.TrimEnd('\0', ' ') ?? "",
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
