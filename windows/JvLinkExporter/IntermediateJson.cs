// 中間JSON スキーマ (Mac側 src/lib/jra/jvlink-mapper.mjs と完全一致させること)
using System.Text.Json.Serialization;

namespace JvLinkExporter;

public sealed class IntermediateDay
{
    [JsonPropertyName("date")] public string Date { get; set; } = "";
    [JsonPropertyName("venues")] public List<IntermediateVenue> Venues { get; set; } = new();
}

public sealed class IntermediateVenue
{
    [JsonPropertyName("code")] public string Code { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("races")] public List<IntermediateRace> Races { get; set; } = new();
}

public sealed class IntermediateRace
{
    [JsonPropertyName("raceNumber")] public int RaceNumber { get; set; }
    [JsonPropertyName("raceName")] public string? RaceName { get; set; }
    [JsonPropertyName("raceSubtitle")] public string? RaceSubtitle { get; set; }
    [JsonPropertyName("distance")] public int? Distance { get; set; }
    // 'T' | 'D' | 'O' (Mac側で 芝/ダート/障害 に正規化される)
    [JsonPropertyName("surface")] public string? Surface { get; set; }
    [JsonPropertyName("track")] public string? Track { get; set; }
    [JsonPropertyName("trackCondition")] public string? TrackCondition { get; set; }
    [JsonPropertyName("weather")] public string? Weather { get; set; }
    [JsonPropertyName("startTime")] public string? StartTime { get; set; }
    [JsonPropertyName("results")] public List<IntermediateResult> Results { get; set; } = new();
    [JsonPropertyName("payouts")] public IntermediatePayouts Payouts { get; set; } = new();
    [JsonPropertyName("timeData"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public object? TimeData { get; set; }
    [JsonPropertyName("cornerData")] public List<object> CornerData { get; set; } = new();
    [JsonPropertyName("comment")] public string Comment { get; set; } = "";
}

public sealed class IntermediateResult
{
    [JsonPropertyName("position")] public int? Position { get; set; }
    [JsonPropertyName("horseNumber")] public int HorseNumber { get; set; }
    [JsonPropertyName("horseName")] public string HorseName { get; set; } = "";
    [JsonPropertyName("jockey"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Jockey { get; set; }
    [JsonPropertyName("trainer"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Trainer { get; set; }
    [JsonPropertyName("bracket"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public int? Bracket { get; set; }
    [JsonPropertyName("sexAge"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? SexAge { get; set; }
    [JsonPropertyName("weight"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Weight { get; set; }
    [JsonPropertyName("time"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Time { get; set; }
    [JsonPropertyName("margin"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Margin { get; set; }
    [JsonPropertyName("lastFurlong"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? LastFurlong { get; set; }
    [JsonPropertyName("popularity"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public int? Popularity { get; set; }
    [JsonPropertyName("odds"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public double? Odds { get; set; }
}

public sealed class IntermediatePayouts
{
    [JsonPropertyName("tansho")] public List<PayoutEntry> Tansho { get; set; } = new();
    [JsonPropertyName("fukusho")] public List<PayoutEntry> Fukusho { get; set; } = new();
    [JsonPropertyName("wakuren")] public List<PayoutEntry> Wakuren { get; set; } = new();
    [JsonPropertyName("wide")] public List<PayoutEntry> Wide { get; set; } = new();
    [JsonPropertyName("umaren")] public List<PayoutEntry> Umaren { get; set; } = new();
    [JsonPropertyName("umatan")] public List<PayoutEntry> Umatan { get; set; } = new();
    [JsonPropertyName("sanrenpuku")] public List<PayoutEntry> Sanrenpuku { get; set; } = new();
    [JsonPropertyName("sanrentan")] public List<PayoutEntry> Sanrentan { get; set; } = new();
}

public sealed class PayoutEntry
{
    [JsonPropertyName("number"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Number { get; set; }
    [JsonPropertyName("combination"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Combination { get; set; }
    [JsonPropertyName("payout")] public int Payout { get; set; }
    [JsonPropertyName("popularity"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public int? Popularity { get; set; }
}
