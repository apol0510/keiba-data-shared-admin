using System.Text;
using System.Text.Json;

namespace JvLinkExporter;

public static class Program
{
    public static int Main(string[] args)
    {
        // Shift-JIS 用コードページ有効化
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

        // ─────────────────────────────────────────────────────────────────
        //  Modes Overview
        // ─────────────────────────────────────────────────────────────────
        //  ▸ 通常モード (JVOpen 蓄積系):
        //      - 用途: 確定データ取得 (rank/payout 完備)
        //      - 出力先: `out` (デフォルト C:\jra-data\<date>.json) → 後段で
        //               keiba-data-shared/jra/results/ に保存される正規データ
        //      - バリデーション: rank必須・HR必須 (満たさないと exit 4)
        //      - JRA-VAN 確定後 (通常翌日朝) に実行する想定
        //
        //  ▸ --rt モード (JVRTOpen 速報系):
        //      - 用途: レース当日のライブストリーム (WH/SE速報/HR速報)
        //      - 出力先: `out` (デフォルト C:\jra-data\<date>-live.json)
        //               リアルタイム表示用なので別パス (live サフィックス)
        //      - バリデーション: 緩い (rank=null/HR=0 でも保存OK、warnのみ)
        //      - 確定データではないので analytics-keiba 側で「速報表示」として扱う
        //      - 確定保存 (jra/results) には使わず、後で通常モードで上書きする
        //
        //  どちらのモードでも JVInit + (JVOpen or JVRTOpen) + JVRead ループ。
        // ─────────────────────────────────────────────────────────────────
        var opts = ParseArgs(args);
        var date = opts.TryGetValue("date", out var d) ? d : DateTime.Now.ToString("yyyy-MM-dd");
        bool dummy = opts.ContainsKey("dummy");
        bool rawDump = opts.ContainsKey("raw-dump");
        bool dry = opts.ContainsKey("dry");
        bool rt = opts.ContainsKey("rt");
        bool forceSave = opts.ContainsKey("force-save");
        // 出力先: --rt 時はデフォルトで -live.json を使い、確定データと混ざらないようにする。
        var outPath = opts.TryGetValue("out", out var o)
            ? o
            : (rt ? $@"C:\jra-data\{date}-live.json" : $@"C:\jra-data\{date}.json");
        // JVOpen option:
        //   1 = 通常データ (diff)       過去日でも diff しか返さない (JGなど追補のみ)
        //   2 = 今週データ
        //   3 = セットアップ (ダイアログあり)
        //   4 = セットアップ (ダイアログなし) ★ 過去日の RA/SE/HR 取得はこれ
        int option = opts.TryGetValue("option", out var optStr) && int.TryParse(optStr, out var ov) ? ov : 4;
        string dataspec = opts.TryGetValue("dataspec", out var ds) ? ds : "RACE";
        // --rt モード時の dataspec リスト (ライブ系)
        // 0B11 は WH (馬体重) → 確認済み。他は実機で要検証 (本実装はライブ用なので
        // データ完備性は要求しない。確定データは通常モード=JVOpen で別途取得)。
        string rtSpecs = opts.TryGetValue("rt-spec", out var rs) ? rs : "0B11,0B20,0B30,0B41,0B51,0B12";
        if (opts.ContainsKey("debug")) Environment.SetEnvironmentVariable("JV_DEBUG", "1");

        Log($"date={date} out={outPath} mode={(dummy ? "dummy" : rawDump ? "raw-dump" : rt ? "rt(live)" : dry ? "dry" : "real(batch)")} dataspec={dataspec} option={option}{(rt ? " rt-spec=" + rtSpecs : "")}{(forceSave ? " force-save" : "")}");

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

            if (rt) return DoRt(date, outPath, dry, rtSpecs, forceSave);

            return DoReal(date, option, outPath, dry, dataspec, forceSave);
        }
        catch (Exception ex)
        {
            Log($"❌ FATAL: {ex.Message}");
            Log(ex.StackTrace ?? "");
            return 2;
        }
    }

    /// <summary>
    /// 通常モード (JVOpen 蓄積系)。確定データの保存パス。
    /// rank/payout が揃っていない場合は exit 4 でabort（--force-save で回避可能）。
    /// </summary>
    private static int DoReal(string date, int option, string outPath, bool dry, string dataspec, bool forceSave)
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

        // ── バリデーション (確定データ要件: rank/payout/日付一致) ──────
        // --dry でも実行する。dry はあくまで「JSON書き込みをスキップする」だけ。
        // 不完全データ・日付ズレを早期に exit code 4 で検出し、CI/コミット前
        // チェックとして機能させる。--force-save 指定時のみバイパス可能。
        var raceList = day.Venues.SelectMany(v => v.Races).ToList();
        int totalRaces = raceList.Count;
        int racesWithRank = raceList.Count(r => r.Results.Any(x => x.Position.HasValue));
        int racesWithUmatan = raceList.Count(r => r.Payouts?.Umatan != null && r.Payouts.Umatan.Count > 0);

        var problems = new List<string>();
        if (hrCount == 0) problems.Add("HR=0 (払戻データ未取得)");
        if (totalRaces > 0 && racesWithRank == 0) problems.Add("全レースで rank が null (着順未確定)");
        if (totalRaces > 0 && racesWithUmatan == 0) problems.Add("全レースで umatan 払戻が空");
        // CLI で指定した --date と aggregator が確定した output.date が一致しない場合は
        // 「別日のデータが採用された」可能性があるため確実に弾く。
        if (!string.IsNullOrEmpty(day.Date) && day.Date != date)
        {
            problems.Add($"output.date='{day.Date}' が CLI date='{date}' と不一致");
        }
        // 該当日に venue が一つも存在しない（=取得時に target date のレコードゼロ）も検出
        if (string.IsNullOrEmpty(day.Date) && totalRaces == 0)
        {
            problems.Add($"output.date 未確定 / races=0 (CLI date='{date}' のデータが取得できていない)");
        }

        if (problems.Count > 0)
        {
            Log("⚠️  バリデーション失敗 (確定データ要件未達):");
            foreach (var p in problems) Log($"   - {p}");
            Log($"   races={totalRaces} rank埋まり={racesWithRank} umatan払戻あり={racesWithUmatan} HR={hrCount} output.date='{day.Date}' CLI.date='{date}'");
            if (!forceSave)
            {
                Log(dry ? "❌ dry-run validation failed" : "❌ 保存スキップ。JRA-VAN確定後に再実行するか --force-save で強制保存。");
                return 4;
            }
            Log("⚠️  --force-save 指定のため、不完全データのまま継続します。");
        }
        else
        {
            Log($"✅ バリデーションOK: races={totalRaces} rank埋まり={racesWithRank} umatan払戻あり={racesWithUmatan} output.date='{day.Date}'");
        }

        if (dry) { Log("🟡 --dry: JSON出力スキップ (validation passed)"); return 0; }

        WriteJson(outPath, day);
        Log($"✅ JSON出力: {outPath}");
        return 0;
    }

    /// <summary>
    /// 速報系API (JVRTOpen) を使用したリアルタイム取得モード。
    ///
    /// レース当日の確定直後に着順・払戻を取得するために使用。
    /// 蓄積系 (JVOpen) と異なり、JRA-VAN の翌日確定を待たずに最新データが取れる。
    ///
    /// dataspec ごとに JVRTOpen → JVRead ループを繰り返し、Aggregator にまとめて投入。
    ///   "0B11" 速報成績  → RA / SE (KakuteiJyuni 含む)
    ///   "0B12" 速報払戻  → HR (Tansho/Fukusho/Umaren/Umatan/Sanrenpuku/Sanrentan 等)
    ///
    /// key 形式は "yyyymmdd" (date-level)。当日全レース分を取得。
    ///
    /// バリデーション:
    ///   HR=0 もしくは 全 SE.KakuteiJyuni 空 の場合は取得失敗とみなし保存スキップ。
    ///   --force-save 指定時のみ強制保存。
    /// </summary>
    /// <summary>
    /// 1スイープ分のJVRTOpen + JVRead ループを実行し、Aggregator に投入する。
    /// dataspec 単位で呼ばれる。retがJV-Linkエラー時は例外を投げず統計だけ返す。
    /// </summary>
    private record SweepStats(int Read, int Ra, int Se, int Hr, int Wh, int Skip, int SeRankFilled, Dictionary<string, int> Types, Dictionary<string, int> UnknownDumpedTypes, bool KeyError202);

    private static SweepStats RunRtSweep(JvLinkClient jv, Aggregator agg, string spec, string key, bool dumpUnknown)
    {
        Log($"━━ JVRTOpen dataspec={spec} key={key} ━━");
        try
        {
            var rt = jv.RtOpen(spec, key);
            Log($"[OK] JVRTOpen ret={rt.ReturnCode}");
        }
        catch (Exception ex)
        {
            // -202 = key 形式不正の典型エラー。Phase 2 で race-level key リトライ対象になる。
            if (ex.Message.Contains("ret=-202"))
            {
                Log($"⚠️ JVRTOpen 失敗 dataspec={spec} ret=-202 (key形式不正 → race-level keyへPhase2でretry)");
                return new SweepStats(0, 0, 0, 0, 0, 0, 0, new(), new(), KeyError202: true);
            }
            Log($"❌ JVRTOpen 失敗 dataspec={spec}: {ex.Message}");
            return new SweepStats(0, 0, 0, 0, 0, 0, 0, new(), new(), KeyError202: false);
        }

        int read = 0, ra = 0, se = 0, hr = 0, wh = 0, skip = 0, seRankFilled = 0;
        var typeCounts = new Dictionary<string, int>();
        var unknownDumped = new Dictionary<string, int>();
        while (true)
        {
            var res = jv.Read();
            if (res.ReturnCode == 0) break;
            if (res.ReturnCode == -1) { Log($"  ├ file switch: {res.FileName}"); continue; }
            if (res.ReturnCode < -1) { Log($"❌ JVRead ret={res.ReturnCode} (dataspec={spec})"); break; }

            read++;
            var type = RecordParser.GetRecordType(res.Record);
            typeCounts[type] = typeCounts.GetValueOrDefault(type, 0) + 1;
            switch (type)
            {
                case "RA":
                {
                    var raRec = RecordParser.ParseRa(res.Record);
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
                    ra++;
                    break;
                }
                case "SE":
                {
                    var seRec = RecordParser.ParseSe(res.Record);
                    if (!string.IsNullOrWhiteSpace(seRec.KakuteiJyuni)) seRankFilled++;
                    agg.ApplySe(seRec, res.Record);
                    se++;
                    break;
                }
                case "HR":
                    agg.ApplyHr(RecordParser.ParseHr(res.Record), res.Record);
                    hr++;
                    break;
                case "WH":
                    agg.ApplyWh(RecordParser.ParseWh(res.Record), res.Record);
                    wh++;
                    break;
                default:
                    skip++;
                    // 未対応レコードは最初の1件だけ hex dump して構造を判定可能にする
                    if (dumpUnknown && !unknownDumped.ContainsKey(type))
                    {
                        try
                        {
                            var sjisBytes = System.Text.Encoding.GetEncoding("shift_jis").GetBytes(res.Record);
                            Log($"  [unknown-rec] type={type} charLen={res.Record.Length} sjisBytes={sjisBytes.Length}");
                            var enc = System.Text.Encoding.GetEncoding("shift_jis");
                            int dumpMax = Math.Min(sjisBytes.Length, 200);
                            for (int pos = 0; pos < dumpMax; pos += 20)
                            {
                                int chunk = Math.Min(20, dumpMax - pos);
                                var hex = BitConverter.ToString(sjisBytes, pos, chunk);
                                var txt = enc.GetString(sjisBytes, pos, chunk).Replace('\r', '.').Replace('\n', '.').Replace('\0', '.');
                                Log($"    [{pos,4}..{pos + chunk - 1,4}] {hex}  |{txt}|");
                            }
                        }
                        catch (Exception ex) { Log($"  [unknown-rec dump failed]: {ex.Message}"); }
                        unknownDumped[type] = 1;
                    }
                    break;
            }
        }

        Log($"[records spec={spec}] total={read} RA={ra} SE={se} HR={hr} WH={wh} skip={skip}");
        var summary = string.Join(", ", typeCounts.OrderByDescending(kv => kv.Value).Select(kv => $"{kv.Key}={kv.Value}"));
        Log($"[by-type spec={spec}] {summary}");

        return new SweepStats(read, ra, se, hr, wh, skip, seRankFilled, typeCounts, unknownDumped, KeyError202: false);
    }

    private static int DoRt(string date, string outPath, bool dry, string rtSpecs, bool forceSave)
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

        bool debug = Environment.GetEnvironmentVariable("JV_DEBUG") == "1";
        var agg = new Aggregator(date, debug);
        var dateKey = date.Replace("-", ""); // "yyyymmdd"

        int totalRead = 0, raTotal = 0, seTotal = 0, hrTotal = 0, whTotal = 0, seRankFilled = 0;

        // ── Phase 1: date-level key で全 dataspec を一巡 ─────────────────
        // -202 失敗した spec は Phase 2 (stream-mode) で別 key 形式を試行。
        var specs = rtSpecs.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var phase2Specs = new List<string>();
        foreach (var spec in specs)
        {
            var s = RunRtSweep(jv, agg, spec, dateKey, dumpUnknown: true);
            totalRead += s.Read; raTotal += s.Ra; seTotal += s.Se; hrTotal += s.Hr; whTotal += s.Wh; seRankFilled += s.SeRankFilled;
            if (s.KeyError202) phase2Specs.Add(spec);
        }

        // ── Phase 2: stream-mode retry ──────────────────────────────────────
        // Phase 1 で -202 で失敗した spec を、JVRTOpen の「stream モード」相当で再試行する。
        // race-level key は前ターンで全敗確認済みのため使用しない。
        // 試行する key:
        //   1. ""              空文字 (stream all)
        //   2. dateKey         "yyyymmdd" (Phase 1 と同じだが念のため)
        //   3. fromtime        "yyyymmddhhmmss" 起点 (蓄積系互換フォーマット)
        // 成功した key を採用し、ストリームから全レコードを読み取って Aggregator に投入。
        // 日付フィルタは Aggregator 内に既存（race info に基づく）ため、target date 以外も
        // 安全に投入できる（race info が target date に一致するレコードのみが採用される）。
        if (phase2Specs.Count > 0)
        {
            Log($"━━ Phase 2: stream-mode retry. specs=[{string.Join(",", phase2Specs)}] ━━");
            var streamKeys = new (string name, string key)[]
            {
                ("empty",     ""),
                ("date8",     dateKey),
                ("fromtime",  dateKey + "000000"),
            };

            foreach (var spec in phase2Specs)
            {
                bool resolved = false;
                foreach (var (vName, vKey) in streamKeys)
                {
                    Log($"━━ stream JVRTOpen dataspec={spec} variant={vName} key='{vKey}' ━━");
                    var s = RunRtSweep(jv, agg, spec, vKey, dumpUnknown: true);
                    if (!s.KeyError202)
                    {
                        // -202 以外（成功 or 別エラー）。成功時は本sweepで全レコードがAggregator投入済み。
                        Log($"[stream-result] spec={spec} variant={vName} read={s.Read} RA={s.Ra} SE={s.Se} HR={s.Hr} WH={s.Wh} SE_rank={s.SeRankFilled}");
                        totalRead += s.Read; raTotal += s.Ra; seTotal += s.Se; hrTotal += s.Hr; whTotal += s.Wh; seRankFilled += s.SeRankFilled;
                        resolved = true;
                        break; // 次 spec へ
                    }
                    Log($"[stream-NG-202] spec={spec} variant={vName} key='{vKey}'");
                }
                if (!resolved)
                {
                    Log($"⚠️ Phase 2 spec={spec}: 全 stream key で -202。dataspec自体が無効の可能性。");
                }
            }
        }

        Log($"━━ 集計 total: read={totalRead} RA={raTotal} SE={seTotal} HR={hrTotal} WH={whTotal} SE_rank_filled={seRankFilled} ━━");

        var day = agg.Finalize();
        Log($"🏟  venues={day.Venues.Count} races={day.Venues.Sum(v => v.Races.Count)}");

        // ── バリデーション (--rt モードは緩い: warn-only) ────────────────
        // ライブストリームでは rank=null や HR=0 が普通に発生する (試合中・払戻未確定等)。
        // 確定データの保存・配信は通常モード (JVOpen) で別途行うため、ここでは保存を阻止しない。
        var raceList = day.Venues.SelectMany(v => v.Races).ToList();
        int totalRaces = raceList.Count;
        int racesWithRank = raceList.Count(r => r.Results.Any(x => x.Position.HasValue));
        int racesWithUmatan = raceList.Count(r => r.Payouts?.Umatan != null && r.Payouts.Umatan.Count > 0);

        Log($"📊 ライブデータ状況: races={totalRaces} rank埋まり={racesWithRank} umatan払戻あり={racesWithUmatan} HR受信={hrTotal} WH受信={whTotal}");
        if (hrTotal == 0) Log($"   ℹ️  HR=0 (払戻まだ未取得 — 確定後に通常モードで取得予定)");
        if (totalRaces > 0 && racesWithRank == 0) Log($"   ℹ️  rank全null (着順速報まだ — ライブ取得継続中)");
        if (totalRaces > 0 && racesWithUmatan == 0) Log($"   ℹ️  umatan全空 (払戻まだ — ライブでは正常)");

        if (dry) { Log("🟡 --dry: JSON出力スキップ"); return 0; }

        // --rt モードはライブ用なので原則として常に保存（不完全でも）。
        // 完全データ要求は通常モード (JVOpen) の責務。
        WriteJson(outPath, day);
        Log($"✅ ライブJSON出力: {outPath} (確定データは別途 JVOpen で取得すること)");
        return 0;
    }

    /// <summary>
    /// WHレコードから複数の key variant を生成する。
    /// JVRTOpen は dataspec ごとに必要な key 形式が異なるため、ブルートフォースで試行。
    ///
    /// 「長さ違い」だけでなく「構造違い」も試す:
    ///   - WH raw の MakeDate と race info の連結
    ///   - 順序入れ替え
    ///   - WH raw の生切り出し
    /// </summary>
    private static List<(string name, string key)> BuildKeyVariants(WhRecord wh)
    {
        var d8       = wh.Year + wh.MonthDay;                                    // "20260502"
        var mk8      = wh.MakeDate;                                              // "20260502" (作成日)
        var k10      = d8 + wh.JyoCD;                                            // 10
        var k12      = k10 + wh.Kaiji;                                           // 12
        var k14      = k12 + wh.Nichiji;                                         // 14
        var k16      = k14 + wh.RaceNum;                                         // 16 (現行)
        var jjkkhhrr = wh.JyoCD + wh.Kaiji + wh.Nichiji + wh.RaceNum;            // 8 (場+開催+日+R)

        // raw切り出し (charベース)。WH raw が短い場合は空文字。
        string RawSlice(int start, int len) =>
            (wh.Raw != null && wh.Raw.Length >= start + len) ? wh.Raw.Substring(start, len) : "";

        var variants = new List<(string, string)>
        {
            // ── 長さバリエーション ──────────────────────────────
            ("k08-date",                            d8),
            ("k10-date+jyo",                        k10),
            ("k12-date+jyo+kai",                    k12),
            ("k14-date+jyo+kai+nichi",              k14),
            ("k16-date+jyo+kai+nichi+race",         k16),
            ("k17-pad-space",                       k16 + " "),
            ("k18-pad-double-space",                k16 + "  "),

            // ── 構造バリエーション (順序入れ替え) ────────────────
            ("k16-jyo+date+kai+nichi+race",         wh.JyoCD + d8 + wh.Kaiji + wh.Nichiji + wh.RaceNum),
            ("k16-jjkkhhrr+date",                   jjkkhhrr + d8),

            // ── MakeDate と race-info の結合 (WH raw 観察より) ───
            // WH raw: "WH 1 [MakeDate8] [Year4][MonthDay4][JJ2][KK2][HH2][RR2] ..."
            // → 前半 8桁 + 後半 16桁 = 24桁ブロック
            ("k24-makedate+racekey16",              mk8 + k16),
            ("k24-racekey16+makedate",              k16 + mk8),
            ("k24-date+racekey16",                  d8 + k16),
            ("k24-double-date",                     d8 + d8 + jjkkhhrr),

            // 中央挿入型: d8 + k12 (date+jyo+kai) + Nichiji + RaceNum
            ("k20-d8+k12+nichi+race",               d8 + k12 + wh.Nichiji + wh.RaceNum),

            // ── prefix付き (dataspec名を含めるパターン) ──────────
            ("k20-prefix0B12+k16",                  "0B12" + k16),
            ("k20-prefix0B+k16+pad",                "0B" + k16 + "  "),

            // ── WH raw 完全抽出系 ────────────────────────────────
            // [3:27] = MakeDate(8) + Year(4)+MonthDay(4)+JJ(2)+KK(2)+HH(2)+RR(2) = 24桁
            ("kRaw[3:27]-24",                       RawSlice(3, 24)),
            // [3:31] = 上記 + HappyoTime(4) = 28桁
            ("kRaw[3:31]-28",                       RawSlice(3, 28)),
            // [11:27] = race info のみ 16桁 (= k16 と同じはず)
            ("kRaw[11:27]-16",                      RawSlice(11, 16)),
            // [3:11] = MakeDate のみ 8桁
            ("kRaw[3:11]-8",                        RawSlice(3, 8)),
        };

        // 重複除去（同じ key 値の variant を片方だけ残す: 名前は最初に出てきた方を採用）
        var seen = new HashSet<string>();
        var unique = new List<(string, string)>();
        foreach (var v in variants)
        {
            if (string.IsNullOrEmpty(v.Item2)) continue; // 空keyはスキップ
            if (seen.Add(v.Item2)) unique.Add(v);
        }
        return unique;
    }

    /// <summary>variant 名を指定して該当 key を WH から再生成する。</summary>
    private static string BuildKeyByName(WhRecord wh, string variantName)
    {
        var variants = BuildKeyVariants(wh);
        foreach (var (n, k) in variants) if (n == variantName) return k;
        // フォールバック: 16桁
        return wh.Year + wh.MonthDay + wh.JyoCD + wh.Kaiji + wh.Nichiji + wh.RaceNum;
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
