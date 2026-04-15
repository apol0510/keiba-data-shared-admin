namespace JvLinkExporter;

/// <summary>
/// RA/SE/HR レコードを受け取って IntermediateDay を組み立てる集約器。
/// RA で race の枠を作り、SE で results[] を埋め、HR で payouts を埋める。
/// </summary>
public sealed class Aggregator
{
    private readonly string _targetDate;
    private readonly bool _debug;
    private readonly Dictionary<string, IntermediateRace> _raceMap = new();
    private readonly Dictionary<string, IntermediateVenue> _venueMap = new();
    private readonly Dictionary<string, int> _dateCount = new();
    private int _raCalls, _seCalls, _hrCalls, _seMatched, _hrMatched;
    private int _raDbgLogged, _seDbgLogged, _hrDbgLogged;

    public Aggregator(string targetDate, bool debug = false)
    {
        _targetDate = targetDate;
        _debug = debug;
    }

    private static string? JyoToDate(string year, string monthDay)
    {
        var y = (year ?? "").Trim();
        var md = (monthDay ?? "").Trim();
        if (y.Length != 4 || md.Length != 4) return null;
        return $"{y}-{md.Substring(0, 2)}-{md.Substring(2, 2)}";
    }

    // Key に日付も含めて、複数日混入でも衝突しないようにする。
    // jyoCd / raceNum はTrim＋2桁ゼロ埋めで完全正規化 (RA/SE/HR 間のズレを吸収)
    private static string NormJyo(string s) => (s ?? "").Trim().PadLeft(2, '0');
    private static string NormRace(string s)
    {
        var t = (s ?? "").Trim();
        return t.Length == 0 ? "00" : t.PadLeft(2, '0');
    }
    private static string RaceKey(string date, string jyoCd, string raceNum) =>
        $"{date}|{NormJyo(jyoCd)}-{NormRace(raceNum)}";

    private static void Log(string m) => Console.Error.WriteLine($"[aggregator] {m}");

    private IntermediateVenue EnsureVenue(string date, string jyoCd)
    {
        var nj = NormJyo(jyoCd);
        var key = $"{date}|{nj}";
        if (!_venueMap.TryGetValue(key, out var v))
        {
            var (name, code) = VenueCode.Resolve(nj);
            v = new IntermediateVenue { Code = code, Name = name };
            _venueMap[key] = v;
        }
        return v;
    }

    public void ApplyRa(RaRecord ra)
    {
        _raCalls++;
        var date = JyoToDate(ra.Year, ra.MonthDay) ?? "?";
        _dateCount[date] = _dateCount.GetValueOrDefault(date, 0) + 1;

        var key = RaceKey(date, ra.JyoCD, ra.RaceNum);
        if (_debug && _raDbgLogged < 3)
        {
            Log($"RA#{_raCalls} key='{key}' year='{ra.Year}' monthDay='{ra.MonthDay}' jyoCD='{ra.JyoCD}' raceNum='{ra.RaceNum}' kyori='{ra.Kyori}' track='{ra.TrackCD}'");
            _raDbgLogged++;
        }
        var race = new IntermediateRace
        {
            RaceNumber = RecordParser.ParseIntOrNull(ra.RaceNum) ?? 0,
            RaceName = string.IsNullOrWhiteSpace(ra.RaceName) ? null : ra.RaceName,
            RaceSubtitle = string.IsNullOrWhiteSpace(ra.RaceSubName) ? null : ra.RaceSubName,
            Distance = RecordParser.ParseIntOrNull(ra.Kyori),
            Surface = TrackCdToSurface(ra.TrackCD),
            Weather = TenkoCdToName(ra.TenkoCD),
            TrackCondition = BabaCdToName(ra.BabaCD_Shiba, ra.BabaCD_Dirt, ra.TrackCD),
            StartTime = FormatTime(ra.HassoTime),
        };
        _raceMap[key] = race;
        var venue = EnsureVenue(date, ra.JyoCD);
        if (!venue.Races.Contains(race)) venue.Races.Add(race);
    }

    public void ApplySe(SeRecord se)
    {
        _seCalls++;
        var date = JyoToDate(se.Year, se.MonthDay) ?? "?";
        var key = RaceKey(date, se.JyoCD, se.RaceNum);
        if (_debug && _seDbgLogged < 3)
        {
            Log($"SE#{_seCalls} key='{key}' umaban='{se.Umaban}' bamei='{se.Bamei}' jyuni='{se.KakuteiJyuni}'");
            _seDbgLogged++;
        }
        if (!_raceMap.TryGetValue(key, out var race))
        {
            // RA未到着でもSEが先着する可能性を考慮して空枠生成
            race = new IntermediateRace { RaceNumber = RecordParser.ParseIntOrNull(se.RaceNum) ?? 0 };
            _raceMap[key] = race;
            EnsureVenue(date, se.JyoCD).Races.Add(race);
        }
        else _seMatched++;
        race.Results.Add(new IntermediateResult
        {
            Position = RecordParser.ParseIntOrNull(se.KakuteiJyuni),
            HorseNumber = RecordParser.ParseIntOrNull(se.Umaban) ?? 0,
            Bracket = RecordParser.ParseIntOrNull(se.Wakuban),
            HorseName = se.Bamei,
            Jockey = string.IsNullOrWhiteSpace(se.KishuName) ? null : se.KishuName,
            Trainer = string.IsNullOrWhiteSpace(se.ChokyoshiName) ? null : se.ChokyoshiName,
            Popularity = RecordParser.ParseIntOrNull(se.Ninki),
            Odds = ParseOdds(se.Odds),
            Time = FormatRunTime(se.Time),
            LastFurlong = FormatFurlong(se.HaronTimeL3),
        });
    }

    public void ApplyHr(HrRecord hr)
    {
        _hrCalls++;
        var date = JyoToDate(hr.Year, hr.MonthDay) ?? "?";
        var key = RaceKey(date, hr.JyoCD, hr.RaceNum);

        // 完全一致で引けなかった場合、日付を無視した fallback を試す
        IntermediateRace? race = null;
        bool matched = _raceMap.TryGetValue(key, out race);
        string matchMode = matched ? "exact" : "?";
        if (!matched)
        {
            var tail = $"|{NormJyo(hr.JyoCD)}-{NormRace(hr.RaceNum)}";
            var hit = _raceMap.FirstOrDefault(kv => kv.Key.EndsWith(tail));
            if (hit.Value != null) { race = hit.Value; matched = true; matchMode = "date-ignored:" + hit.Key; }
        }

        if (_debug && _hrDbgLogged < 3)
        {
            var sampleKey = _raceMap.Keys.FirstOrDefault() ?? "(empty)";
            Log($"HR#{_hrCalls} key='{key}' match={matchMode} raceMapSampleKey='{sampleKey}' raw.Year='{hr.Year}' raw.MonthDay='{hr.MonthDay}' raw.JyoCD='{hr.JyoCD}' raw.RaceNum='{hr.RaceNum}'");
            _hrDbgLogged++;
        }

        if (race == null) return;
        _hrMatched++;
        race.Payouts.Tansho = hr.Tansho;
        race.Payouts.Fukusho = hr.Fukusho;
        race.Payouts.Wakuren = hr.Wakuren;
        race.Payouts.Umaren = hr.Umaren;
        race.Payouts.Wide = hr.Wide;
        race.Payouts.Umatan = hr.Umatan;
        race.Payouts.Sanrenpuku = hr.Sanrenpuku;
        race.Payouts.Sanrentan = hr.Sanrentan;
    }

    public IntermediateDay Finalize()
    {
        Log($"[finalize] raCalls={_raCalls} seCalls={_seCalls} hrCalls={_hrCalls}");
        Log($"[finalize] seMatched={_seMatched}/{_seCalls} hrMatched={_hrMatched}/{_hrCalls} (unmatched = race key 不一致)");
        Log($"[finalize] date distribution: {string.Join(", ", _dateCount.Select(kv => $"{kv.Key}:{kv.Value}"))}");
        Log($"[finalize] raceMap={_raceMap.Count} venueMap={_venueMap.Count}");

        // 対象日のみ venue を抽出
        var targetVenues = _venueMap
            .Where(kv => kv.Key.StartsWith(_targetDate + "|"))
            .Select(kv => kv.Value)
            .ToList();

        // フォールバック: 対象日 venue が 0 件なら、最多件数の日付を採用してログ出す
        if (targetVenues.Count == 0 && _venueMap.Count > 0)
        {
            var mostDate = _dateCount.OrderByDescending(kv => kv.Value).FirstOrDefault().Key;
            Log($"[WARN] 指定日 '{_targetDate}' の venue なし。最多日 '{mostDate}' を採用します (offset要確認)");
            targetVenues = _venueMap
                .Where(kv => kv.Key.StartsWith(mostDate + "|"))
                .Select(kv => kv.Value)
                .ToList();
        }

        // レース番号で昇順ソート
        foreach (var v in targetVenues)
            v.Races.Sort((a, b) => a.RaceNumber.CompareTo(b.RaceNumber));
        // 着順ソート
        foreach (var race in _raceMap.Values)
            race.Results.Sort((a, b) => (a.Position ?? 99).CompareTo(b.Position ?? 99));

        return new IntermediateDay
        {
            Date = _targetDate,
            Venues = targetVenues.OrderBy(v => v.Code).ToList(),
        };
    }

    // ---- コード変換ヘルパ (仕様書 コード表参照。TODO: 要検証) ----

    private static string? TrackCdToSurface(string trackCd)
    {
        // 仕様書 2003 TrackCD: 10-22=芝, 23-29=ダート, 51-59=障害 (おおよそ)
        if (!int.TryParse(trackCd, out var v)) return null;
        if (v >= 10 && v <= 22) return "T";
        if (v >= 23 && v <= 29) return "D";
        if (v >= 51) return "O";
        return null;
    }

    private static string? TenkoCdToName(string cd) => cd switch
    {
        "1" => "晴", "2" => "曇", "3" => "雨", "4" => "小雨", "5" => "雪", "6" => "小雪", _ => null,
    };

    private static string? BabaCdToName(string shiba, string dirt, string trackCd)
    {
        // 芝レースなら shiba、ダートなら dirt を採用 (暫定)
        var cd = TrackCdToSurface(trackCd) == "D" ? dirt : shiba;
        return cd switch { "1" => "良", "2" => "稍重", "3" => "重", "4" => "不良", _ => null };
    }

    private static string? FormatTime(string hhmm)
    {
        if (hhmm.Length != 4 || hhmm == "0000") return null;
        return $"{hhmm.Substring(0, 2)}:{hhmm.Substring(2, 2)}";
    }

    private static string? FormatRunTime(string msss)
    {
        // 4桁: M SSS (分1桁 + 秒2桁 + 1/10秒1桁) → "1:10.8"
        if (msss.Length != 4 || msss == "0000") return null;
        var m = msss[0];
        var ss = msss.Substring(1, 2);
        var d = msss[3];
        return $"{m}:{ss}.{d}";
    }

    private static string? FormatFurlong(string s)
    {
        if (s.Length != 3 || s == "000") return null;
        return $"{s.Substring(0, 2)}.{s[2]}";
    }

    private static double? ParseOdds(string s)
    {
        if (string.IsNullOrWhiteSpace(s) || s.All(c => c == '0')) return null;
        if (!double.TryParse(s.Trim(), out var v)) return null;
        return v / 10.0; // 小数点省略補正 (暫定)
    }
}
