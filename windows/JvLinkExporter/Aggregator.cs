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
    private readonly List<HrRecord> _hrBuffer = new();
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

    public void ApplyRa(RaRecord ra, string? rawRecord = null)
    {
        _raCalls++;
        if (_debug && _raDbgLogged < 3 && rawRecord != null)
        {
            var len = rawRecord.Length;
            Log($"RA-RAW#{_raCalls} charLen={len}");
            // SJIS バイト変換してバイト数を確認 + 主要エリアをダンプ
            try
            {
                var sjisBytes = System.Text.Encoding.GetEncoding("shift_jis").GetBytes(rawRecord);
                Log($"  sjisBytes={sjisBytes.Length}");
                // 20byte 刻みでダンプ (byte 0..700 + 末尾50)
                void DumpRange(int from, int to)
                {
                    var enc = System.Text.Encoding.GetEncoding("shift_jis");
                    for (int pos = from; pos < to && pos < sjisBytes.Length; pos += 20)
                    {
                        int chunk = Math.Min(20, sjisBytes.Length - pos);
                        var hex = BitConverter.ToString(sjisBytes, pos, chunk);
                        var txt = enc.GetString(sjisBytes, pos, chunk).Replace('\r', '.').Replace('\n', '.').Replace('\0', '.');
                        Log($"  [{pos,4}..{pos + chunk - 1,4}] {hex}  |{txt}|");
                    }
                }
                DumpRange(0, 700);
                DumpRange(Math.Max(0, sjisBytes.Length - 50), sjisBytes.Length);
            }
            catch (Exception ex) { Log($"  SJIS dump failed: {ex.Message}"); }
        }
        var date = JyoToDate(ra.Year, ra.MonthDay) ?? "?";
        _dateCount[date] = _dateCount.GetValueOrDefault(date, 0) + 1;

        var key = RaceKey(date, ra.JyoCD, ra.RaceNum);
        if (_debug && _raDbgLogged < 3)
        {
            // Tenko/Baba は末尾スキャン後、ApplyRa 末尾の [ra-meta] で別途出力する
            Log($"RA#{_raCalls} key='{key}' year='{ra.Year}' monthDay='{ra.MonthDay}' jyoCD='{ra.JyoCD}' raceNum='{ra.RaceNum}' kyori='{ra.Kyori}' track='{ra.TrackCD}' hasso='{ra.HassoTime}' name='{ra.RaceName}' ryaku10='{ra.RaceNameRyakusho10}'");
            _raDbgLogged++;
        }
        // RA は metadata の source of truth。
        // SE が先着していた場合、既存 race object に metadata をマージし、
        // venue.Races の重複追加を避ける（順序非依存集約）。
        if (!_raceMap.TryGetValue(key, out var race))
        {
            race = new IntermediateRace
            {
                RaceNumber = RecordParser.ParseIntOrNull(ra.RaceNum) ?? 0,
            };
            _raceMap[key] = race;
            EnsureVenue(date, ra.JyoCD).Races.Add(race);
        }
        else
        {
            // raceNumber も RA を最優先（SE 由来の値は冗長に過ぎない）
            var raN = RecordParser.ParseIntOrNull(ra.RaceNum);
            if (raN.HasValue) race.RaceNumber = raN.Value;
            EnsureVenue(date, ra.JyoCD); // venue 側も冪等に確保
        }

        // raceName fallback: 本題 > 副題 > 略称10 > 略称6 > 既存
        var raName = string.IsNullOrWhiteSpace(ra.RaceName) ? null : ra.RaceName.Trim();
        var raSub  = string.IsNullOrWhiteSpace(ra.RaceSubName) ? null : ra.RaceSubName.Trim();
        var ry10   = string.IsNullOrWhiteSpace(ra.RaceNameRyakusho10) ? null : ra.RaceNameRyakusho10.Trim();
        var ry6    = string.IsNullOrWhiteSpace(ra.RaceNameRyakusho6) ? null : ra.RaceNameRyakusho6.Trim();
        var picked = raName ?? raSub ?? ry10 ?? ry6;
        if (picked != null) race.RaceName = picked;
        if (raSub != null) race.RaceSubtitle = raSub;

        // 条件戦名（3歳未勝利・4歳上1勝クラス・障害4歳上オープン 等）
        var condition = BuildRaceConditionName(ra);
        if (condition != null) race.RaceConditionName = condition;

        // 距離/馬場/天候/発走時刻は RA を source of truth として上書き（null は維持）
        var dist = RecordParser.ParseIntOrNull(ra.Kyori);
        if (dist.HasValue) race.Distance = dist;
        var surf = TrackCdToSurface(ra.TrackCD);
        if (surf != null) race.Surface = surf;
        var wx = TenkoCdToName(ra.TenkoCD);
        if (wx != null) race.Weather = wx;
        var baba = BabaCdToName(ra.BabaCD_Shiba, ra.BabaCD_Dirt, ra.TrackCD);
        if (baba != null) race.TrackCondition = baba;
        if (_debug)
        {
            var surfTag = TrackCdToSurface(ra.TrackCD) ?? "?";
            Log($"[ra-meta] key='{key}' track='{ra.TrackCD}'->surface='{surfTag}' tenko-raw='{ra.TenkoCD}'->'{wx ?? "null"}' babaShibaRaw='{ra.BabaCD_Shiba}' babaDirtRaw='{ra.BabaCD_Dirt}' baba='{baba ?? "null"}'");
        }
        var st = FormatTime(ra.HassoTime);
        if (st != null) race.StartTime = st;
    }

    public void ApplySe(SeRecord se, string? rawRecord = null)
    {
        _seCalls++;
        var date = JyoToDate(se.Year, se.MonthDay) ?? "?";
        var key = RaceKey(date, se.JyoCD, se.RaceNum);
        if (_debug && _seDbgLogged < 3)
        {
            Log($"SE#{_seCalls} key='{key}' umaban='{se.Umaban}' bamei='{se.Bamei}' kishu='{se.KishuName}' chokyo='{se.ChokyoshiName}' jyuni='{se.KakuteiJyuni}' futan='{se.Futan}'");
            if (rawRecord != null)
            {
                try
                {
                    var sjisBytes = System.Text.Encoding.GetEncoding("shift_jis").GetBytes(rawRecord);
                    Log($"  SE-RAW charLen={rawRecord.Length} sjisBytes={sjisBytes.Length}");
                    var enc = System.Text.Encoding.GetEncoding("shift_jis");
                    for (int pos = 0; pos < sjisBytes.Length; pos += 20)
                    {
                        int chunk = Math.Min(20, sjisBytes.Length - pos);
                        var hex = BitConverter.ToString(sjisBytes, pos, chunk);
                        var txt = enc.GetString(sjisBytes, pos, chunk).Replace('\r', '.').Replace('\n', '.').Replace('\0', '.');
                        Log($"  [{pos,4}..{pos + chunk - 1,4}] {hex}  |{txt}|");
                    }
                }
                catch (Exception ex) { Log($"  SE dump failed: {ex.Message}"); }
            }
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

    public void ApplyHr(HrRecord hr, string? rawRecord = null)
    {
        // HRは RA より先に来る場合があるため、ここでは必ず buffer に積むだけにする。
        // 実際の race への紐付けは Finalize() で raceMap 確定後にまとめて行う。
        _hrCalls++;
        _hrBuffer.Add(hr);
        if (_debug && _hrDbgLogged < 3)
        {
            var date = JyoToDate(hr.Year, hr.MonthDay) ?? "?";
            var key = RaceKey(date, hr.JyoCD, hr.RaceNum);
            Log($"HR#{_hrCalls} buffered key='{key}' raw.Year='{hr.Year}' raw.MonthDay='{hr.MonthDay}' raw.JyoCD='{hr.JyoCD}' raw.RaceNum='{hr.RaceNum}'");
            if (rawRecord != null)
            {
                try
                {
                    var sjisBytes = System.Text.Encoding.GetEncoding("shift_jis").GetBytes(rawRecord);
                    Log($"  HR-RAW charLen={rawRecord.Length} sjisBytes={sjisBytes.Length}");
                    var enc = System.Text.Encoding.GetEncoding("shift_jis");
                    for (int pos = 0; pos < sjisBytes.Length; pos += 20)
                    {
                        int chunk = Math.Min(20, sjisBytes.Length - pos);
                        var hex = BitConverter.ToString(sjisBytes, pos, chunk);
                        var txt = enc.GetString(sjisBytes, pos, chunk).Replace('\r', '.').Replace('\n', '.').Replace('\0', '.');
                        Log($"  [{pos,4}..{pos + chunk - 1,4}] {hex}  |{txt}|");
                    }
                }
                catch (Exception ex) { Log($"  HR dump failed: {ex.Message}"); }
            }
            _hrDbgLogged++;
        }
    }

    /// <summary>Finalize 内で呼び出される: buffered HR → raceMap への遅延紐付け</summary>
    private void FlushHrBuffer()
    {
        int exact = 0, dateIgnored = 0, missed = 0;
        foreach (var hr in _hrBuffer)
        {
            var date = JyoToDate(hr.Year, hr.MonthDay) ?? "?";
            var key = RaceKey(date, hr.JyoCD, hr.RaceNum);

            IntermediateRace? race = null;
            if (_raceMap.TryGetValue(key, out race)) { exact++; }
            else
            {
                var tail = $"|{NormJyo(hr.JyoCD)}-{NormRace(hr.RaceNum)}";
                var hit = _raceMap.FirstOrDefault(kv => kv.Key.EndsWith(tail));
                if (hit.Value != null) { race = hit.Value; dateIgnored++; }
            }

            if (race == null) { missed++; continue; }
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
        Log($"[hr-flush] buffered={_hrBuffer.Count} exact={exact} date-ignored={dateIgnored} missed={missed}");
    }

    public IntermediateDay Finalize()
    {
        // HR は順序依存を避けるため、raceMap 確定後にまとめて紐付ける
        FlushHrBuffer();

        Log($"[finalize] raCalls={_raCalls} seCalls={_seCalls} hrCalls={_hrCalls}");
        Log($"[finalize] seMatched={_seMatched}/{_seCalls} hrReMatched={_hrMatched}/{_hrCalls}");
        Log($"[finalize] date distribution: {string.Join(", ", _dateCount.Select(kv => $"{kv.Key}:{kv.Value}"))}");
        Log($"[finalize] raceMap={_raceMap.Count} venueMap={_venueMap.Count}");

        // 採用する「開催日」を決定する。
        //   - JV-Link setup は fromtime 以降の全レースを返すため、CLIで指定した
        //     --date と実際の開催日が一致しないことがある (例: fromtime=4/11 だが
        //     レースは 4/12 のみ)。
        //   - 出力JSONの date は RA/SE/HR が実際に示す「開催日」に合わせるのが
        //     Mac 側 mapper の期待に沿う。
        string selectedDate;
        if (_venueMap.Keys.Any(k => k.StartsWith(_targetDate + "|")))
        {
            selectedDate = _targetDate;
        }
        else if (_dateCount.Count > 0)
        {
            selectedDate = _dateCount.OrderByDescending(kv => kv.Value).First().Key;
            Log($"[WARN] CLI --date='{_targetDate}' の venue 無し。実データの最多日 '{selectedDate}' を採用 (JV-Link setup は fromtime 以降を返すため)");
        }
        else
        {
            selectedDate = _targetDate;
        }

        var targetVenues = _venueMap
            .Where(kv => kv.Key.StartsWith(selectedDate + "|"))
            .Select(kv => kv.Value)
            .ToList();

        // レース番号で昇順ソート
        foreach (var v in targetVenues)
            v.Races.Sort((a, b) => a.RaceNumber.CompareTo(b.RaceNumber));
        // 着順ソート
        foreach (var race in _raceMap.Values)
            race.Results.Sort((a, b) => (a.Position ?? 99).CompareTo(b.Position ?? 99));

        Log($"[finalize] output.date='{selectedDate}' (CLI --date='{_targetDate}')  venues={targetVenues.Count}  races={targetVenues.Sum(v => v.Races.Count)}");

        return new IntermediateDay
        {
            Date = selectedDate,
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
        // TrackCD で採用面を確定: 芝/障害 → shiba, ダート → dirt
        var surface = TrackCdToSurface(trackCd);
        string? cd = surface switch
        {
            "T" => shiba,
            "O" => shiba, // 障害は芝扱い
            "D" => dirt,
            _   => null,  // surface 不明時は判定不能
        };
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

    /// <summary>
    /// 競走種別CD (RA SyubetuCD) から年齢区分の表示名を返す。
    /// 仕様: 11=2歳, 12=3歳, 13=3歳上, 14=4歳上,
    ///       18=障害2歳上, 19=障害3歳上, 20=障害4歳上
    /// </summary>
    private static (string ageLabel, bool isObstacle)? AgePrefixFromSyubetu(string syubetuCd)
    {
        return (syubetuCd ?? "").Trim() switch
        {
            "11" => ("2歳", false),
            "12" => ("3歳", false),
            "13" => ("3歳上", false),
            "14" => ("4歳上", false),
            "18" => ("障害2歳上", true),
            "19" => ("障害3歳上", true),
            "20" => ("障害4歳上", true),
            _    => null,
        };
    }

    /// <summary>
    /// 競走条件CD（仕様書コード表 2003 抜粋） → 表示名
    /// 005=1勝クラス, 010=2勝クラス, 015/016=3勝クラス, 999=オープン,
    /// 701=新馬, 703=未勝利
    /// 注: 015 と 016 は 3勝クラス相当として観測されている（要再検証）
    /// </summary>
    private static string? JokenCdToLabel(string code) => (code ?? "").Trim() switch
    {
        "701" => "新馬",
        "703" => "未勝利",
        "005" => "1勝クラス",
        "010" => "2勝クラス",
        "015" => "3勝クラス",
        "016" => "3勝クラス",
        "999" => "オープン",
        _     => null,
    };

    /// <summary>
    /// グレードCD → リステッド/G1〜G3 補助表示
    /// オープン特別の場合に「リステッド」を優先したいので、Joken=999 のときに使用。
    /// </summary>
    private static string? GradeCdToOpenSuffix(string gradeCd) => (gradeCd ?? "").Trim() switch
    {
        "L" => "リステッド",
        _   => null,
    };

    /// <summary>
    /// JV-Link RA レコードから条件戦名を構築する。
    ///
    /// 優先順:
    ///   1. JokenName が直接入っている場合はそれをそのまま返す（"3歳　未勝利" 等）
    ///   2. SyubetuCD + JokenCD[1..5] から組み立てる（例: "3歳未勝利"）
    ///   3. いずれも取れない場合は null
    /// </summary>
    public static string? BuildRaceConditionName(RaRecord ra)
    {
        if (ra == null) return null;

        // ① JokenName 直書きがあれば最優先（中の全角空白は除去して整形）
        var direct = (ra.JokenName ?? "").Replace('　', ' ').Trim();
        if (direct.Length > 0)
        {
            // "3歳　未勝利" のような全角空白区切りはそのまま、空白を詰めて返す
            return System.Text.RegularExpressions.Regex.Replace(direct, "\\s+", "");
        }

        // ② コードから構築
        var age = AgePrefixFromSyubetu(ra.SyubetuCD);
        if (age == null) return null;

        // 5枠の中で最初に見つかった有効な条件CDをクラス名に変換
        var codes = new[] { ra.JokenCD1, ra.JokenCD2, ra.JokenCD3, ra.JokenCD4, ra.JokenCD5 };
        string? classLabel = null;
        foreach (var c in codes)
        {
            var t = (c ?? "").Trim();
            if (t.Length == 0 || t == "000") continue;
            classLabel = JokenCdToLabel(t);
            if (classLabel != null) break;
        }

        if (classLabel == null) return age.Value.ageLabel; // クラス未確定でも年齢区分は返す

        // ③ オープン × Listed のときは「リステッド」を併記
        if (classLabel == "オープン")
        {
            var suffix = GradeCdToOpenSuffix(ra.GradeCD);
            if (suffix != null) classLabel = $"オープン({suffix})";
        }

        return age.Value.ageLabel + classLabel;
    }
}
