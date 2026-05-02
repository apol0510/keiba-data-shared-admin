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

    /// <summary>仮名/漢字 含有数（日本語らしさ指標）</summary>
    private static int CountKanaKanji(string s)
    {
        if (string.IsNullOrEmpty(s)) return 0;
        int n = 0;
        foreach (var c in s)
        {
            int cp = c;
            if ((cp >= 0x3040 && cp <= 0x309F) ||  // Hiragana
                (cp >= 0x30A0 && cp <= 0x30FF) ||  // Katakana
                (cp >= 0x3400 && cp <= 0x9FFF) ||  // CJK Unified Ideographs
                (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK Compatibility
                (cp >= 0xFF66 && cp <= 0xFF9F))    // 半角カタカナ
                n++;
        }
        return n;
    }

    /// <summary>
    /// 「すでに正しい日本語文字列」かを判定する。仕様（ユーザー指定）:
    ///   正常:
    ///     - 平仮名・片仮名・漢字 が含まれる
    ///     - 不自然な記号列がない
    ///   1つでも以下に該当 → 文字化けと判定（再デコードを必須にする）:
    ///     - "?" / "@" が多い、または連続
    ///     - "�" を含む
    ///     - 文字化けマーカー (窶/繝/蜻/荵 等)
    ///     - smart quote / em dash / bullet 等の異常記号
    ///     - U+0080-U+009F (CP1252 由来) を含む
    ///     - U+0100 以上で kana/kanji 範囲外の文字を含む
    ///     - 仮名・漢字が1つも無い（全部 ASCII / 記号）
    /// </summary>
    private static bool IsCleanJapanese(string s)
    {
        if (string.IsNullOrEmpty(s)) return true;

        int kanaKanji = 0;
        int suspicious = 0;
        int qatPairs = 0;
        int questionCount = 0;
        int atCount = 0;
        int currQ = 0, currA = 0, maxQ = 0, maxA = 0;
        bool hasReplacement = false;
        bool hasMojibakeMarker = false;
        bool hasOutOfRangeHigh = false;

        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            int cp = c;

            // ① 仮名・漢字
            if ((cp >= 0x3040 && cp <= 0x309F) ||
                (cp >= 0x30A0 && cp <= 0x30FF) ||
                (cp >= 0x3400 && cp <= 0x9FFF) ||
                (cp >= 0xF900 && cp <= 0xFAFF) ||
                (cp >= 0xFF66 && cp <= 0xFF9F))
            { kanaKanji++; currQ = 0; currA = 0; continue; }

            // ② 全角空白・全角ASCII（数字・英字・記号）→ 中立
            if (cp == 0x3000 || (cp >= 0xFF00 && cp <= 0xFF65) || (cp >= 0xFFA0 && cp <= 0xFFEF))
            { currQ = 0; currA = 0; continue; }

            // ③ 文字化けマーカー
            if (c == '�') { hasReplacement = true; continue; }
            if (c == '窶' || c == '繝' || c == '蜻' || c == '荵') { hasMojibakeMarker = true; continue; }

            // ④ "?@" 連続検出
            if (c == '?' && i + 1 < s.Length && s[i + 1] == '@')
            {
                qatPairs++; suspicious += 2; i++;
                currQ = 0; currA = 0;
                continue;
            }

            // ⑤ "?" / "@" 個数・連続性
            if (c == '?')
            {
                questionCount++;
                currQ++; if (currQ > maxQ) maxQ = currQ;
                currA = 0;
                continue;
            }
            if (c == '@')
            {
                atCount++;
                currA++; if (currA > maxA) maxA = currA;
                currQ = 0;
                continue;
            }

            // ⑥ CP1252 由来の C1 control 域 / smart quote / dash / bullet
            if (cp >= 0x0080 && cp <= 0x009F) { suspicious++; currQ = 0; currA = 0; continue; }
            if (cp >= 0x2013 && cp <= 0x2026) { suspicious++; currQ = 0; currA = 0; continue; }
            if (c == '“' || c == '”' || c == '„' || c == '‟' ||
                c == '‘' || c == '’' || c == '‚' || c == '‛' ||
                c == '•' || c == '‰')
            { suspicious++; currQ = 0; currA = 0; continue; }

            // ⑦ U+0100 以上で kana/kanji 範囲外 → 異常コードポイント
            if (cp >= 0x0100) { hasOutOfRangeHigh = true; currQ = 0; currA = 0; continue; }

            // ASCII / 数字 / 半角記号 / 制御文字
            currQ = 0; currA = 0;
        }

        // ── 異常判定（1つでも当てはまれば NG = 再デコード必須）──
        if (hasReplacement) return false;
        if (hasMojibakeMarker) return false;
        if (qatPairs >= 2) return false;                       // "?@" 2回以上
        if (maxQ >= 3 || maxA >= 3) return false;              // "?" / "@" が3連続以上
        if (questionCount + atCount >= 3) return false;        // "?" / "@" 合計3個以上
        if (suspicious >= 1) return false;                     // smart quote 等が1個でも
        if (hasOutOfRangeHigh) return false;                   // U+0100以上で kana/kanji 範囲外
        if (kanaKanji == 0) return false;                      // 仮名・漢字が無い

        return true;
    }

    /// <summary>
    /// JV-Link 受信文字列を文字化けから復元する。
    /// 「既に正しい日本語」と判定された文字列は破壊しない。
    /// それ以外は必ず Shift_JIS 再デコードを試みる:
    ///   戦略A: 各 char の低位バイトを SJIS バイト列とみなしてデコード
    ///   戦略B: CP1252 経由でバイト復元 → SJIS デコード
    /// 復元結果は IsBetterRecovery（既存より仮名/漢字が増え、かつクリーン判定をパス）の場合のみ採用。
    /// </summary>
    public static string Decode(string raw)
    {
        if (string.IsNullOrEmpty(raw)) return raw ?? "";

        if (IsCleanJapanese(raw)) return raw;

        string best = raw;
        int bestScore = CountKanaKanji(raw);

        // 戦略A: 低位バイト → SJIS
        try
        {
            var bytes = new byte[raw.Length];
            for (int i = 0; i < raw.Length; i++) bytes[i] = (byte)(raw[i] & 0xFF);
            var dec = SJIS.GetString(bytes);
            if (IsBetterRecovery(dec, bestScore))
            {
                best = dec; bestScore = CountKanaKanji(dec);
            }
        }
        catch { /* fallthrough */ }

        // 戦略B: CP1252 → SJIS
        try
        {
            var bytes = CP1252.GetBytes(raw);
            var dec = SJIS.GetString(bytes);
            if (IsBetterRecovery(dec, bestScore))
            {
                best = dec; bestScore = CountKanaKanji(dec);
            }
        }
        catch { /* fallthrough */ }

        return best;
    }

    /// <summary>
    /// 復元結果の安全性チェック。誤った CJK 出力（lossy 変換による偽復元）を排除するため
    /// 「仮名/漢字 数が増える」かつ「クリーン日本語判定をパス」の場合のみ採用する。
    /// </summary>
    private static bool IsBetterRecovery(string candidate, int currentBestScore)
    {
        int score = CountKanaKanji(candidate);
        if (score == 0) return false;
        if (score <= currentBestScore) return false;
        if (!IsCleanJapanese(candidate)) return false;
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
// ── IDispatch / VARIANT 直叩き用の P/Invoke と構造体定義 ──────────────────
//
// JV-Link は string パラメータを BSTR で受け取る。.NET の自動 marshalling は
// 実行環境の CP_ACP (システム ANSI codepage) を介して BSTR を string に変換するため、
// 非日本語 Windows やロケール周りに不整合があるとバイトレベルで情報が失われる
// （raceName が "”a?C?R..." 等にロッシー化）。
//
// 本クラスは JVRead 呼び出しを動的バインディングではなく IDispatch::Invoke 経由に
// 切り替え、SysAllocStringByteLen で確保した BSTR の生バイトを直接 Shift_JIS で
// デコードすることで、CP_ACP 依存を回避する。

[StructLayout(LayoutKind.Sequential)]
internal struct DISPPARAMS
{
    public IntPtr rgvarg;
    public IntPtr rgdispidNamedArgs;
    public int cArgs;
    public int cNamedArgs;
}

// VARIANT (16 bytes on x86 / x86-target build)
//   0:  vt (ushort)
//   2:  wReserved1 (ushort)
//   4:  wReserved2 (ushort)
//   6:  wReserved3 (ushort)
//   8:  data union (8 bytes - x86 では IntPtr + IntPtr で 8 bytes)
[StructLayout(LayoutKind.Sequential)]
internal struct VARIANT
{
    public ushort vt;
    public ushort wReserved1;
    public ushort wReserved2;
    public ushort wReserved3;
    public IntPtr data;
    public IntPtr data2;
}

internal static class VtConst
{
    public const ushort VT_EMPTY = 0;
    public const ushort VT_I4    = 3;
    public const ushort VT_BSTR  = 8;
    public const ushort VT_BYREF = 0x4000;

    public const ushort DISPATCH_METHOD = 1;

    // VARIANT 内の data フィールド開始オフセット (x86 / x64 とも 8)
    public const int VARIANT_DATA_OFFSET = 8;
}

[ComImport]
[Guid("00020400-0000-0000-C000-000000000046")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IDispatchRaw
{
    [PreserveSig] int GetTypeInfoCount(out int pctinfo);
    [PreserveSig] int GetTypeInfo(int iTInfo, int lcid, out IntPtr ppTInfo);
    [PreserveSig] int GetIDsOfNames(
        [In] ref Guid riid,
        [In, MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPWStr)] string[] rgszNames,
        int cNames,
        int lcid,
        [Out, MarshalAs(UnmanagedType.LPArray)] int[] rgDispId);
    [PreserveSig] int Invoke(
        int dispIdMember,
        [In] ref Guid riid,
        int lcid,
        ushort wFlags,
        [In] ref DISPPARAMS pDispParams,
        IntPtr pVarResult,
        IntPtr pExcepInfo,
        IntPtr puArgErr);
}

internal static class OleAut32
{
    /// <summary>引数 strIn が IntPtr.Zero の場合、cb バイトのゼロ初期化 BSTR を確保する。</summary>
    [DllImport("oleaut32.dll", PreserveSig = false)]
    public static extern IntPtr SysAllocStringByteLen(IntPtr strIn, uint cb);

    [DllImport("oleaut32.dll")]
    public static extern uint SysStringByteLen(IntPtr bstr);

    [DllImport("oleaut32.dll")]
    public static extern void SysFreeString(IntPtr bstr);
}

// ────────────────────────────────────────────────────────────────────────

public sealed class JvLinkClient : IDisposable
{
    private readonly dynamic _jv;
    private readonly IDispatchRaw _disp;
    private int _readDispId = -1;
    private bool _initialized;

    public JvLinkClient()
    {
        var t = Type.GetTypeFromProgID("JVDTLab.JVLink")
            ?? throw new InvalidOperationException("ProgID 'JVDTLab.JVLink' が見つかりません。JV-Linkが未登録です。");
        var instance = Activator.CreateInstance(t)!;
        _jv = instance;
        _disp = (IDispatchRaw)instance;
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
    ///
    /// 通常は IDispatch::Invoke 経由でバイトレベル取得し、Shift_JIS で直接デコードする
    /// （.NET の BSTR 自動 marshalling = CP_ACP 依存 を回避）。
    /// 万一 IDispatch 直叩きで失敗したら、従来の dynamic 呼び出し + JvSjisDecoder に
    /// fallback する。環境変数 JV_FORCE_LEGACY_READ=1 で強制 fallback も可能。
    /// </summary>
    public JvReadResult Read(int bufSize = 110000)
    {
        bool forceLegacy = Environment.GetEnvironmentVariable("JV_FORCE_LEGACY_READ") == "1";
        if (!forceLegacy)
        {
            try { return ReadViaIDispatch(bufSize); }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[JvLinkClient] IDispatch read failed, fallback to dynamic: {ex.Message}");
                // fallthrough to legacy path
            }
        }
        return ReadViaDynamic(bufSize);
    }

    /// <summary>
    /// 旧来の dynamic + BSTR 自動 marshalling 経路（fallback 用）。
    /// CP_ACP 依存のため特別競走名等で文字化けすることがあるが、JvSjisDecoder で
    /// 多段復元を試みる。
    /// </summary>
    private JvReadResult ReadViaDynamic(int bufSize)
    {
        object oBuf = new string(' ', bufSize);
        object oSize = bufSize;
        object oFile = new string(' ', 256);
        int ret = _jv.JVRead(ref oBuf, ref oSize, ref oFile);

        var rawRecord = ret > 0 ? (oBuf?.ToString() ?? "") : "";
        var rawFile = oFile?.ToString() ?? "";
        return new JvReadResult
        {
            ReturnCode = ret,
            Record = JvSjisDecoder.Decode(rawRecord),
            FileName = JvSjisDecoder.Decode(rawFile).TrimEnd('\0', ' '),
        };
    }

    /// <summary>
    /// IDispatch::Invoke 経由で JVRead を呼び、BSTR の生バイトを Shift_JIS でデコードする。
    /// 失敗時は例外送出。動的バインディング (string 経由) には fallback しない:
    /// なぜなら fallback すると CP_ACP 経由のロッシー変換が発生して特別競走名が壊れるため。
    /// </summary>
    private JvReadResult ReadViaIDispatch(int bufSize)
    {
        if (_readDispId < 0) _readDispId = ResolveDispId("JVRead");

        // ── BSTR を SysAllocStringByteLen で手動確保（生バイト境界を保つ）──
        IntPtr bstrBuf = OleAut32.SysAllocStringByteLen(IntPtr.Zero, (uint)bufSize);
        IntPtr bstrFile = OleAut32.SysAllocStringByteLen(IntPtr.Zero, 256);

        // BSTR ポインタのアドレスを保持するヒープ (VT_BYREF|VT_BSTR の data フィールド用)
        IntPtr bufHolder = Marshal.AllocCoTaskMem(IntPtr.Size);
        Marshal.WriteIntPtr(bufHolder, bstrBuf);
        IntPtr fileHolder = Marshal.AllocCoTaskMem(IntPtr.Size);
        Marshal.WriteIntPtr(fileHolder, bstrFile);
        IntPtr sizeHolder = Marshal.AllocCoTaskMem(4);
        Marshal.WriteInt32(sizeHolder, bufSize);

        int variantSize = Marshal.SizeOf<VARIANT>();
        IntPtr vargsPtr = Marshal.AllocCoTaskMem(variantSize * 3);
        IntPtr resultVar = Marshal.AllocCoTaskMem(variantSize);

        try
        {
            // IDispatch::Invoke は引数を逆順に並べる（rightmost から）。
            // JVRead(buf, size, filename) → vargs[0]=filename, [1]=size, [2]=buf
            WriteVariantByRef(vargsPtr + 0 * variantSize, VtConst.VT_BSTR, fileHolder);
            WriteVariantByRef(vargsPtr + 1 * variantSize, VtConst.VT_I4,   sizeHolder);
            WriteVariantByRef(vargsPtr + 2 * variantSize, VtConst.VT_BSTR, bufHolder);

            DISPPARAMS dp = new DISPPARAMS
            {
                rgvarg = vargsPtr,
                rgdispidNamedArgs = IntPtr.Zero,
                cArgs = 3,
                cNamedArgs = 0,
            };

            // 結果 VARIANT 初期化 (VT_EMPTY)
            for (int i = 0; i < variantSize; i++) Marshal.WriteByte(resultVar, i, 0);

            Guid empty = Guid.Empty;
            int hr = _disp.Invoke(_readDispId, ref empty, 0, VtConst.DISPATCH_METHOD,
                                   ref dp, resultVar, IntPtr.Zero, IntPtr.Zero);
            if (hr < 0) throw new JvLinkException($"IDispatch::Invoke(JVRead) failed: HRESULT 0x{hr:X8}");

            // 戻り値 (VT_I4 を期待)
            ushort resVt = (ushort)Marshal.ReadInt16(resultVar);
            int retCode = 0;
            if (resVt == VtConst.VT_I4)
            {
                retCode = Marshal.ReadInt32(resultVar + VtConst.VARIANT_DATA_OFFSET);
            }
            else if (resVt == (VtConst.VT_BYREF | VtConst.VT_I4))
            {
                IntPtr p = Marshal.ReadIntPtr(resultVar + VtConst.VARIANT_DATA_OFFSET);
                retCode = p != IntPtr.Zero ? Marshal.ReadInt32(p) : 0;
            }

            // JV-Link が再確保した BSTR ポインタを取得（reallocation 対応）
            IntPtr finalBstrBuf = Marshal.ReadIntPtr(bufHolder);
            IntPtr finalBstrFile = Marshal.ReadIntPtr(fileHolder);

            // ── BSTR 生バイトを取得 → UTF-16LE / SJIS のどちらで書かれているか判定してデコード ──
            byte[] recordBytes = ReadBstrBytesRaw(finalBstrBuf);
            byte[] fileBytes   = ReadBstrBytesRaw(finalBstrFile);

            string record = (retCode > 0) ? DecodeBstrPayload(recordBytes) : "";
            string filename = DecodeBstrPayload(fileBytes).TrimEnd('\0', ' ');

            return new JvReadResult
            {
                ReturnCode = retCode,
                Record = record,
                FileName = filename,
            };
        }
        finally
        {
            // BSTR 解放（JV-Link が reallocate した可能性があるので最終ポインタを使用）
            IntPtr finalBstrBuf = Marshal.ReadIntPtr(bufHolder);
            IntPtr finalBstrFile = Marshal.ReadIntPtr(fileHolder);
            if (finalBstrBuf != IntPtr.Zero) OleAut32.SysFreeString(finalBstrBuf);
            if (finalBstrFile != IntPtr.Zero) OleAut32.SysFreeString(finalBstrFile);
            Marshal.FreeCoTaskMem(bufHolder);
            Marshal.FreeCoTaskMem(fileHolder);
            Marshal.FreeCoTaskMem(sizeHolder);
            Marshal.FreeCoTaskMem(vargsPtr);
            Marshal.FreeCoTaskMem(resultVar);
        }
    }

    private static readonly Encoding SJIS = InitSjis();
    private static Encoding InitSjis()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        return Encoding.GetEncoding(932);
    }

    /// <summary>
    /// BSTR の生バイト列を取得する（バイト境界のトリムは行わない）。
    /// UTF-16LE データでは ASCII 文字の高位バイトが 0x00 なので、末尾 0x00 を雑に切ると
    /// データ自体が壊れる。デコード後の文字列レベルで NUL/空白をトリムすること。
    /// </summary>
    private static byte[] ReadBstrBytesRaw(IntPtr bstr)
    {
        if (bstr == IntPtr.Zero) return Array.Empty<byte>();
        int byteLen = (int)OleAut32.SysStringByteLen(bstr);
        if (byteLen <= 0) return Array.Empty<byte>();
        var bytes = new byte[byteLen];
        Marshal.Copy(bstr, bytes, 0, byteLen);
        return bytes;
    }

    /// <summary>
    /// BSTR バイト列をデコード。
    /// BSTR は仕様上 UTF-16LE だが、JV-Link の実装によっては SysAllocStringByteLen で
    /// SJIS 生バイトをそのまま入れているケースもあるため、両方に対応する:
    ///   1. 先頭バイトパターンが「ASCII + 0x00」 → UTF-16LE と判定 → Encoding.Unicode で読む
    ///   2. それ以外 → Shift_JIS と判定 → CP932 で読む
    /// 復号後に末尾の NUL や全角空白等の padding を string.TrimEnd で除去し、
    /// 残った文字化けに備えて JvSjisDecoder.Decode を最終段で適用する。
    /// </summary>
    private static string DecodeBstrPayload(byte[] bytes)
    {
        if (bytes.Length == 0) return "";
        string decoded = LooksLikeUtf16Le(bytes)
            ? Encoding.Unicode.GetString(bytes)
            : SJIS.GetString(bytes);
        // 末尾の NUL 文字 padding をトリム
        decoded = decoded.TrimEnd('\0');
        // 環境固有の文字化け（CP1252 経由等）が残っている場合に備えて最終段でデコーダ通す
        return JvSjisDecoder.Decode(decoded);
    }

    /// <summary>
    /// バイト列が UTF-16LE で書かれているか判定する。
    /// JV-Data レコードは先頭が必ず ASCII (RA / SE / HR / H1 / O1 等) で始まるため、
    /// UTF-16LE なら先頭4バイトが「ASCII値, 0x00, ASCII値, 0x00」のパターンになる。
    /// SJIS 生バイトなら先頭バイトの直後に 0x00 は来ない (連続 ASCII or SJIS 第2バイト)。
    /// この単純な検査で確実に判別できる。
    /// </summary>
    private static bool LooksLikeUtf16Le(byte[] bytes)
    {
        if (bytes.Length < 4) return false;
        if ((bytes.Length & 1) != 0) return false;  // UTF-16LE は必ず偶数バイト
        if (bytes[0] < 0x20 || bytes[0] >= 0x80) return false; // 先頭は ASCII 印字可能
        if (bytes[1] != 0x00) return false;
        if (bytes[2] < 0x20 || bytes[2] >= 0x80) return false;
        if (bytes[3] != 0x00) return false;
        return true;
    }

    private static void WriteVariantByRef(IntPtr variantPtr, ushort innerType, IntPtr dataHolder)
    {
        // VARIANT 全体をゼロ初期化
        int sz = Marshal.SizeOf<VARIANT>();
        for (int i = 0; i < sz; i++) Marshal.WriteByte(variantPtr, i, 0);
        Marshal.WriteInt16(variantPtr, (short)(VtConst.VT_BYREF | innerType));
        Marshal.WriteIntPtr(variantPtr + VtConst.VARIANT_DATA_OFFSET, dataHolder);
    }

    private int ResolveDispId(string memberName)
    {
        Guid empty = Guid.Empty;
        string[] names = { memberName };
        int[] ids = new int[1];
        int hr = _disp.GetIDsOfNames(ref empty, names, 1, 0, ids);
        if (hr < 0) throw new JvLinkException($"GetIDsOfNames('{memberName}') failed: 0x{hr:X8}");
        return ids[0];
    }

    public void Close()
    {
        try { _jv.JVClose(); } catch { /* noop */ }
    }

    public void Dispose()
    {
        if (_initialized) Close();
        // _disp と _jv は同一の COM オブジェクトを指す。FinalReleaseComObject は片方だけ呼べばよい。
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
