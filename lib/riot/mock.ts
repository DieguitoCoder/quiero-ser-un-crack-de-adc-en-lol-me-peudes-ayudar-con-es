/**
 * RIOT_MOCK=1 client backed by tests/fixtures/riot/**. Owner: cobalt.
 * Layout (ARCHITECTURE §7): account.json, match-ids.json, matches/{id}.json, league-entries.json.
 * Behaves like the HTTP client: unknown match → RiotApiError("not_found").
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { RiotClient } from "@/lib/riot/client";
import type { AccountDto, LeagueEntryDto, MatchDto } from "@/lib/riot/dto";
import { RiotApiError } from "@/lib/riot/errors";

const SAFE_MATCH_ID = /^[A-Z0-9]{2,5}_\d{1,20}$/;

async function readJson<T>(file: string): Promise<T> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    throw new RiotApiError("not_found", 404);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RiotApiError("bad_response", 200);
  }
}

export function createFixtureRiotClient(fixturesDir: string): RiotClient {
  const accountFile = path.join(fixturesDir, "account.json");

  async function account(): Promise<AccountDto> {
    return readJson<AccountDto>(accountFile);
  }

  return {
    async getAccountByRiotId(gameName, tagLine) {
      const acc = await account();
      const same = (a: string | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();
      if (!same(acc.gameName, gameName) || !same(acc.tagLine, tagLine)) throw new RiotApiError("not_found", 404);
      return acc;
    },

    async getMatchIds(puuid, query) {
      const acc = await account();
      if (acc.puuid !== puuid) return [];
      const ids = await readJson<string[]>(path.join(fixturesDir, "match-ids.json"));
      const count = Math.min(100, Math.max(1, query.count));
      return ids.slice(Math.max(0, query.start), Math.max(0, query.start) + count);
    },

    async getMatch(matchId) {
      // Prevent path traversal: only well-formed match ids map to files.
      if (!SAFE_MATCH_ID.test(matchId)) throw new RiotApiError("not_found", 404);
      return readJson<MatchDto>(path.join(fixturesDir, "matches", `${matchId}.json`));
    },

    async getLeagueEntries(puuid) {
      const acc = await account();
      if (acc.puuid !== puuid) return [];
      return readJson<LeagueEntryDto[]>(path.join(fixturesDir, "league-entries.json"));
    },
  };
}
