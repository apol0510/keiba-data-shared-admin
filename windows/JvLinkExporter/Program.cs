using System.Text;
using System.Text.Json;

namespace JvLinkExporter;

public static class Program
{
    public static int Main(string[] args)
    {
        // Shift-JIS 用コードページ有効化
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

        var opts = ParseArgs(args);
        var date = opts.TryGetValue("date", out var d) ? d : DateTime.Now.ToString("yyyy-MM-dd");
        var outPath = opts.TryGetValue("out", out var o) ? o : $@"C:\jra-data\{date}.json";
        bool dummy = opts.ContainsKey("dummy");
        bool rawDump = opts.ContainsKey("raw-dump");
        bool dry = opts.ContainsKey("dry");
        // JVOpen option:
        //   1 = 通常データ (diff)       過去日でも diff しか返さない (JGなど追補のみ)
        //   2 = 今週データ
        //   3 = セットアップ (ダイアログあり)
        //   4 = セットアップ (ダイアログなし) ★ 過去日の RA/SE/HR 取得はこれ
        int option = opts.TryGetValue("option", out var optStr) && int.TryParse(optStr, out var ov) ? ov : 4;
        string dataspec = opts.TryGetValue("dataspec", out var ds) ? ds : "RACE";
        if (opts.ContainsKey("debug")) Environment.SetEnvironmentVariable("JV_DEBUG", "1");

        Log($"date={date} out={outPath} mode={(dummy ? "dummy" : rawDump ? "raw-dump" : dry ? "dry" : "real")} dataspec={dataspec} option={option}");

        try
        {
            if (dummy)
            {
                var day = DummyGenerator.Generate(date);
                WriteJson(outPath, day);
                Log($"✅ ダミーJSON出力: {outPath}");
                return 0;
            }

            if (rawDump) return DoRawDump(date, option, dataspec);

            return DoReal(date, option, outPath, dry, dataspec);
        }
        catch (Exception ex)
        {
            Log($"❌ FATAL: {ex.Message}");
            Log(ex.StackTrace ?? "");
            return 2;
        }
    }

    private static int DoReal(string date, int option, string outPath, bool dry, string dataspec)
    {
        var sid = Environment.GetEnvironmentVariable("JVLINK_SID");
        if (string.IsNullOrEmpty(sid))
        {
            Log("❌ 環境変数 JVLINK_SID が未設定です (JRA-VAN 利用者ID)");
            return 3;
        }

        using var jv = new JvLinkClient();
        jv.Init(sid);
        Log("✅ JVInit OK");

        var fromtime = date.Replace("-", "") + "000000";
        var open = jv.Open(dataspec, fromtime, option);
        Log($"[OK] JVOpen dataspec={dataspec} option={option} read={open.ReadCount} dl={open.DownloadCount} ts={open.LastFileTimestamp}");

        bool debug = Environment.GetEnvironmentVariable("JV_DEBUG") == "1";
        var agg = new Aggregator(date, debug);
        int readTotal = 0, raCount = 0, seCount = 0, hrCount = 0, skip = 0;
        var typeCounts = new Dictionary<string, int>();

        while (true)
        {
            var res = jv.Read();
            if (res.ReturnCode == 0) break;
            if (res.ReturnCode == -1) { Log($"  ├ file switch: {res.FileName}"); continue; }
            if (res.ReturnCode < -1) { Log($"❌ JVRead ret={res.ReturnCode}"); break; }

            readTotal++;
            var type = RecordParser.GetRecordType(res.Record);
            typeCounts[type] = typeCounts.GetValueOrDefault(type, 0) + 1;
            switch (type)
            {
                case "RA":
                {
                    var raRec = RecordParser.ParseRa(res.Record);
                    // TrackCD → surface code ("T"/"D"/"O") を先に解決し、末尾スキャンに渡す
                    string? surf = null;
                    if (int.TryParse(raRec.TrackCD, out var tv))
                    {
                        if (tv >= 10 && tv <= 22) surf = "T";
                        else if (tv >= 23 && tv <= 29) surf = "D";
                        else if (tv >= 51) surf = "O";
                    }
                    var (tk, bs, bd) = RecordParser.RaTailScan(res.Record, surf);
                    raRec.TenkoCD = tk;
                    raRec.BabaCD_Shiba = bs;
                    raRec.BabaCD_Dirt = bd;
                    agg.ApplyRa(raRec, res.Record);
                    raCount++;
                    break;
                }
                case "SE": agg.ApplySe(RecordParser.ParseSe(res.Record), res.Record); seCount++; break;
                case "HR": agg.ApplyHr(RecordParser.ParseHr(res.Record), res.Record); hrCount++; break;
                default: skip++; break;
            }
        }

        Log($"[records] total={readTotal} RA={raCount} SE={seCount} HR={hrCount} skip={skip}");
        var summary = string.Join(", ", typeCounts.OrderByDescending(kv => kv.Value).Select(kv => $"{kv.Key}={kv.Value}"));
        Log($"[by-type] {summary}");
        if (raCount == 0 && seCount == 0 && hrCount == 0) {
            Log("[WARN] RA/SE/HR がゼロ件です。option=4 を試してください (--option=4)");
            Log("       また dataspec=RACE が正しいか確認 (--dataspec=RACE)");
        }

        var day = agg.Finalize();
        Log($"🏟  venues={day.Venues.Count} races={day.Venues.Sum(v => v.Races.Count)}");

        if (dry) { Log("🟡 --dry: JSON出力スキップ"); return 0; }

        WriteJson(outPath, day);
        Log($"✅ JSON出力: {outPath}");
        return 0;
    }

    private static int DoRawDump(string date, int option, string dataspec)
    {
        var sid = Environment.GetEnvironmentVariable("JVLINK_SID") ?? "UNKNOWN";
        using var jv = new JvLinkClient();
        jv.Init(sid);
        var fromtime = date.Replace("-", "") + "000000";
        var open = jv.Open(dataspec, fromtime, option);
        Log($"[OK] JVOpen dataspec={dataspec} option={option} read={open.ReadCount} dl={open.DownloadCount}");
        int i = 0;
        var typeCounts = new Dictionary<string, int>();
        while (true)
        {
            var res = jv.Read();
            if (res.ReturnCode == 0) break;
            if (res.ReturnCode == -1) { Log($"# file: {res.FileName}"); continue; }
            if (res.ReturnCode < -1) { Log($"[NG] JVRead ret={res.ReturnCode}"); break; }
            var type = RecordParser.GetRecordType(res.Record);
            typeCounts[type] = typeCounts.GetValueOrDefault(type, 0) + 1;
            Console.WriteLine($"[{i++:D4}] {type}|len={res.Record.Length}|{res.Record}");
        }
        var summary = string.Join(", ", typeCounts.OrderByDescending(kv => kv.Value).Select(kv => $"{kv.Key}={kv.Value}"));
        Log($"[by-type] {summary}");
        if (!typeCounts.ContainsKey("RA")) {
            Log("[WARN] RA が出ていません。過去日なら --option=4 (setup without dialog) を使ってください");
            Log("       例: ...JvLinkExporter.exe --raw-dump --date=2026-04-11 --option=4");
        }
        return 0;
    }

    private static void WriteJson(string path, IntermediateDay day)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        var json = JsonSerializer.Serialize(day, new JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never,
        });
        File.WriteAllText(path, json, new UTF8Encoding(false));
    }

    private static Dictionary<string, string> ParseArgs(string[] args)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var a in args)
        {
            if (!a.StartsWith("--")) continue;
            var kv = a.Substring(2).Split('=', 2);
            d[kv[0]] = kv.Length > 1 ? kv[1] : "true";
        }
        return d;
    }

    private static void Log(string msg) => Console.Error.WriteLine($"[jvlink-exporter] {msg}");
}
