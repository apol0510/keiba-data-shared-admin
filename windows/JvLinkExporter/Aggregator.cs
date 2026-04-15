namespace JvLinkExporter;

/// <summary>
/// RA/SE/HR レコードを受け取って IntermediateDay を組み立てる集約器。
/// RA で race の枠を作り、SE で results[] を埋め、HR で payouts を埋める。
/// </summary>
public sealed class Aggregator
{
    private readonly string _targetDate;
    private readonly Dictionary<string, IntermediateRace> _raceMap = new();
    private readonly Dictionary<string, IntermediateVenue> _venueMap = new();

    public Aggregator(string targetDate) { _targetDate = targetDate; }

    private string? JyoToDate(string year, string monthDay)
    {
        if (year.Length != 4 || monthDay.Length != 4) return null;
        return $"{year}-{monthDay.Substring(0, 2)}-{monthDay.Substring(2, 2)}";
    }

    private string RaceKey(string jyoCd, string raceNum) => $"{jyoCd}-{raceNum}";

    private IntermediateVenue EnsureVenue(string jyoCd)
    {
        if (!_venueMap.TryGetValue(jyoCd, out var v))
        {
            var (name, code) = VenueCode.Resolve(jyoCd);
            v = new IntermediateVenue { Code = code, Name = name };
            _venueMap[jyoCd] = v;
        }
        return v;
    }

    public void ApplyRa(RaRecord ra)
    {
        if (JyoToDate(ra.Year, ra.MonthDay) != _targetDate) return;
        var key = RaceKey(ra.JyoCD, ra.RaceNum);
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
        var venue = EnsureVenue(ra.JyoCD);
        if (!venue.Races.Contains(race)) venue.Races.Add(race);
    }

    public void ApplySe(SeRecord se)
    {
        if (JyoToDate(se.Year, se.MonthDay) != _targetDate) return;
        var key = RaceKey(se.JyoCD, se.RaceNum);
        if (!_raceMap.TryGetValue(key, out var race))
        {
            // RA未到着でもSEが先着する可能性を考慮して空枠生成
            race = new IntermediateRace { RaceNumber = RecordParser.ParseIntOrNull(se.RaceNum) ?? 0 };
            _raceMap[key] = race;
            EnsureVenue(se.JyoCD).Races.Add(race);
        }
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
        if (JyoToDate(hr.Year, hr.MonthDay) != _targetDate) return;
        var key = RaceKey(hr.JyoCD, hr.RaceNum);
        if (!_raceMap.TryGetValue(key, out var race)) return;
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
        // レース番号で昇順ソート
        foreach (var v in _venueMap.Values)
            v.Races.Sort((a, b) => a.RaceNumber.CompareTo(b.RaceNumber));
        // 着順ソート
        foreach (var race in _raceMap.Values)
            race.Results.Sort((a, b) => (a.Position ?? 99).CompareTo(b.Position ?? 99));
        return new IntermediateDay
        {
            Date = _targetDate,
            Venues = _venueMap.Values.OrderBy(v => v.Code).ToList(),
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
