/** Owner: cobalt. Incremental sync against fixtures and an in-memory DB. */
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/lib/db/connection";
import { countMatches, listMatchRecords } from "@/lib/db/repositories/matches";
import { listSnapshots } from "@/lib/db/repositories/rank-snapshots";
import { getSetting } from "@/lib/db/repositories/settings";
import type { RiotClient } from "@/lib/riot/client";
import { RiotApiError } from "@/lib/riot/errors";
import { createFixtureRiotClient } from "@/lib/riot/mock";
import { SYNC_MAX_NEW_MATCHES, syncPlayer, type SyncDeps } from "@/lib/sync/sync";

const FIXTURES = path.join(process.cwd(), "lib/riot/fixtures");
let db: Db | null = null;

function deps(riot: RiotClient = createFixtureRiotClient(FIXTURES)): SyncDeps {
  db = openDatabase(":memory:");
  let t = 1_763_800_000_000;
  return { db, riot, gameName: "xDieguinho", tagLine: "9250", platform: "la1", mock: true, now: () => (t += 10) };
}

afterEach(() => {
  db?.close();
  db = null;
});

describe("syncPlayer", () => {
  it("is idempotent: a second sync inserts nothing and creates no duplicate snapshot", async () => {
    const d = deps();
    const first = await syncPlayer(d);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.newMatches).toBe(13);
    expect(first.data.totalMatches).toBe(13);
    expect(first.data.hasMore).toBe(false);
    expect(first.data.snapshotCreated).toBe(true);
    expect(first.data.rank).toMatchObject({ tier: "BRONZE", division: "III", lp: 45, ladderScore: 545 });

    const second = await syncPlayer(d);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.newMatches).toBe(0);
    expect(second.data.totalMatches).toBe(13);
    expect(second.data.snapshotCreated).toBe(false);

    const puuid = getSetting(d.db, "tracked_puuid") ?? "";
    expect(countMatches(d.db, puuid)).toBe(13);
    expect(listSnapshots(d.db, puuid)).toHaveLength(1);
    const records = listMatchRecords(d.db, puuid, { limit: 100 });
    expect(records.filter((r) => r.isRemake)).toHaveLength(1);
    expect(getSetting(d.db, "last_sync_at")).not.toBeNull();
    expect(getSetting(d.db, "last_sync_error_code")).toBeNull();
  });

  it("caps new matches per run and backfills on the next run", async () => {
    const base = createFixtureRiotClient(FIXTURES);
    const fixtureMatch = await base.getMatch("LA1_1500000100");
    const ids = Array.from({ length: 50 }, (_, i) => `LA1_${2000000000 - i}`);
    const riot: RiotClient = {
      getAccountByRiotId: (g, t) => base.getAccountByRiotId(g, t),
      getLeagueEntries: (p) => base.getLeagueEntries(p),
      getMatchIds: async (_p, q) => ids.slice(q.start, q.start + q.count),
      getMatch: async (id) => ({ ...fixtureMatch, metadata: { ...fixtureMatch.metadata, matchId: id } }),
    };
    const d = deps(riot);
    const first = await syncPlayer(d);
    expect(first.ok && first.data.newMatches).toBe(SYNC_MAX_NEW_MATCHES);
    expect(first.ok && first.data.hasMore).toBe(true);
    const second = await syncPlayer(d);
    expect(second.ok && second.data.newMatches).toBe(10);
    expect(second.ok && second.data.hasMore).toBe(false);
  });

  it("rejects a concurrent sync with SYNC_IN_PROGRESS", async () => {
    const d = deps();
    const [a, b] = await Promise.all([syncPlayer(d), syncPlayer(d)]);
    expect(a.ok).toBe(true);
    expect(!b.ok && b.error.code).toBe("SYNC_IN_PROGRESS");
  });

  it("maps an expired key to RIOT_KEY_INVALID with the Spanish message and records the error code", async () => {
    const base = createFixtureRiotClient(FIXTURES);
    const riot: RiotClient = {
      ...base,
      getAccountByRiotId: async () => {
        throw new RiotApiError("unauthorized", 403);
      },
    };
    const d = deps(riot);
    const res = await syncPlayer(d);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("RIOT_KEY_INVALID");
    expect(res.error.message).toMatch(/developer\.riotgames\.com/);
    expect(getSetting(d.db, "last_sync_error_code")).toBe("RIOT_KEY_INVALID");
  });

  it("maps an unknown Riot ID to SUMMONER_NOT_FOUND", async () => {
    const d = { ...deps(), gameName: "nadie" };
    const res = await syncPlayer(d);
    expect(!res.ok && res.error.code).toBe("SUMMONER_NOT_FOUND");
  });
});
