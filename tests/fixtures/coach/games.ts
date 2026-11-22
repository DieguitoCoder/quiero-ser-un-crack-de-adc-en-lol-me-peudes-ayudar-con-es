import type { JournalEntry, MatchRecord } from "@/lib/types";

let seq = 0;

/** Healthy 30-minute game (7 CS/min, 3 deaths, KP 67%, 2 control wards) unless overridden. */
export function makeGame(overrides: Partial<MatchRecord> = {}): MatchRecord {
  seq += 1;
  return {
    matchId: `LA1_${1000 + seq}`,
    gameCreation: 1_700_000_000_000 + seq * 3_600_000,
    gameDurationS: 1800,
    queueId: 420,
    patch: "15.23",
    isRemake: false,
    puuid: "test-puuid",
    championId: 222,
    championName: "Jinx",
    teamId: 100,
    teamPosition: "BOTTOM",
    win: true,
    kills: 5,
    deaths: 3,
    assists: 5,
    csTotal: 210,
    goldEarned: 12000,
    damageToChampions: 20000,
    visionScore: 20,
    controlWardsBought: 2,
    teamKills: 15,
    opponentChampionId: 51,
    opponentChampionName: "Caitlyn",
    opponentCsTotal: 200,
    csDiff10: 0,
    maxCsAdvantage: 5,
    ...overrides,
  };
}

/** Builds games oldest-first from per-game overrides with strictly increasing timestamps. */
export function makeSeries(list: Partial<MatchRecord>[]): MatchRecord[] {
  return list.map((o, i) =>
    makeGame({ matchId: `LA1_S${i + 1}`, gameCreation: 1_700_000_000_000 + i * 3_600_000, ...o }),
  );
}

export function makeJournal(matchId: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return { matchId, deathReasons: [], lesson: "", tilt: null, updatedAt: 0, ...overrides };
}
