namespace JvLinkExporter;

public static class DummyGenerator
{
    public static IntermediateDay Generate(string date) => new()
    {
        Date = date,
        Venues = new()
        {
            new IntermediateVenue {
                Code = "NAK", Name = "中山",
                Races = new() {
                    new IntermediateRace {
                        RaceNumber = 1,
                        RaceName = "3歳未勝利",
                        RaceSubtitle = "3歳　未勝利",
                        Distance = 1200, Surface = "D", Track = "右",
                        Weather = "晴", TrackCondition = "良", StartTime = "10:10",
                        Results = new() {
                            new IntermediateResult { Position = 1, HorseNumber = 3, HorseName = "ダミーホースA", Jockey = "騎手A", Popularity = 1, Odds = 2.1, Bracket = 2 },
                            new IntermediateResult { Position = 2, HorseNumber = 7, HorseName = "ダミーホースB", Jockey = "騎手B", Popularity = 3, Odds = 5.8, Bracket = 5 },
                        },
                        Payouts = new IntermediatePayouts {
                            Tansho = new() { new PayoutEntry { Number = "3", Payout = 210, Popularity = 1 } },
                            Fukusho = new() {
                                new PayoutEntry { Number = "3", Payout = 120, Popularity = 1 },
                                new PayoutEntry { Number = "7", Payout = 250, Popularity = 3 },
                            },
                            Umaren = new() { new PayoutEntry { Combination = "3-7", Payout = 1120, Popularity = 5 } },
                        }
                    }
                }
            }
        }
    };
}
