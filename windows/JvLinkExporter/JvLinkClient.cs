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
}}

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
