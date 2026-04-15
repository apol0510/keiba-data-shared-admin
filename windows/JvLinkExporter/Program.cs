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
        int option = opts.TryGetValue("option", out var optStr) && int.TryParse(optStr, out var ov) ? ov : 1;

        Log($"📅 date={date}  out={outPath}  mode={(dummy ? "dummy" : rawDump ? "raw-dump" : dry ? "dry" : "real")}");

        try
        {
            if (dummy)
            {
                var day = DummyGenerator.Generate(date);
                WriteJson(outPath, day);
                Log($"✅ ダミーJSON出力: {outPath}");
                return 0;
            }

            if (rawDump) return DoRawDump(date, option);

            return DoReal(date, option, outPath, dry);
        }
        catch (Exception ex)
        {
            Log($"❌ FATAL: {ex.Message}");
            Log(ex.StackTrace ?? "");
            return 2;
        }
    }

    private static int DoReal(string date, int option, string outPath, bool dry)
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
        var open = jv.Open("RACE", fromtime, option);
        Log($"✅ JVOpen OK read={open.ReadCount} dl={open.DownloadCount} ts={open.LastFileTimestamp}");

        var agg = new Aggregator(date);
        int readTotal = 0, raCount = 0, seCount = 0, hrCount = 0, skip = 0;

        while (true)
        {
            var res = jv.Read();
            if (res.ReturnCode == 0) break;
            if (res.ReturnCode == -1) { Log($"  ├ file switch: {res.FileName}"); continue; }
            if (res.ReturnCode < -1) { Log($"❌ JVRead ret={res.ReturnCode}"); break; }

            readTotal++;
            var type = RecordParser.GetRecordType(res.Record);
            switch (type)
            {
                case "RA": agg.ApplyRa(RecordParser.ParseRa(res.Record)); raCount++; break;
                case "SE": agg.ApplySe(RecordParser.ParseSe(res.Record)); seCount++; break;
                case "HR": agg.ApplyHr(RecordParser.ParseHr(res.Record)); hrCount++; break;
                default: skip++; break;
            }
        }

        Log($"📊 records: total={readTotal} RA={raCount} SE={seCount} HR={hrCount} skip={skip}");

        var day = agg.Finalize();
        Log($"🏟  venues={day.Venues.Count} races={day.Venues.Sum(v => v.Races.Count)}");

        if (dry) { Log("🟡 --dry: JSON出力スキップ"); return 0; }

        WriteJson(outPath, day);
        Log($"✅ JSON出力: {outPath}");
        return 0;
    }

    private static int DoRawDump(string date, int option)
    {
        var sid = Environment.GetEnvironmentVariable("JVLINK_SID") ?? "UNKNOWN";
        using var jv = new JvLinkClient();
        jv.Init(sid);
        var fromtime = date.Replace("-", "") + "000000";
        jv.Open("RACE", fromtime, option);
        int i = 0;
        while (true)
        {
            var res = jv.Read();
            if (res.ReturnCode == 0) break;
            if (res.ReturnCode == -1) { Log($"# file: {res.FileName}"); continue; }
            if (res.ReturnCode < -1) break;
            var type = RecordParser.GetRecordType(res.Record);
            Console.WriteLine($"[{i++:D4}] {type}|len={res.Record.Length}|{res.Record}");
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
