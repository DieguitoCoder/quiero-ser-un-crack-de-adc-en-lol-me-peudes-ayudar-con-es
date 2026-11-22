/** Owner: cobalt. v2 batched sync against PGlite (createTestDb) + the RIOT_MOCK fixture client. */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/tests/db/helpers";
import { acquireSyncLease, countMatches, listMatchSummaries } from "@/lib/db/repos";
import type { Db } from "@/lib/db/types";
import type { RiotClient } from "@/lib/riot/client";
import type { MatchDto } from "@/lib/riot/dto";
import { mapMatchWrite } from "@/lib/riot/mappers";
import { createFixtureRiotClient } from "@/lib/riot/mock";
import { SYNC_COOLDOWN_MS, syncBatch, type SyncBatchDeps } from "@/lib/sync/batch";
import type { PlayerRef } from "@/lib/types";

const DIR = path.join(process.cwd(), "lib", "riot", "fixtures");
const ME: PlayerRef = {
  puuid: (JSON.parse(fs.readFileSync(path.join(DIR, "account.json"), "utf8")) as { puuid: string }).puuid,
  gameName: "xDieguinho",
  tagLine: "9250",
  platform: "la1",
};
const readMatch = (id: string) => JSON.parse(fs.readFileSync(path.join(DIR, "matches", `${id}.json`), "utf8")) as MatchDto;
const ALL_IDS = JSON.parse(fs.readFileSync(path.join(DIR, "match-ids.json"), "utf8")) as string[];

let db: Db;
let t: number;
const now = () => t;

function deps(over: Partial<SyncBatchDeps> = {}): SyncBatchDeps {
  return { db, riot: createFixtureRiotClient(DIR), player: ME, cursor: null, mock: true, now, ...over };
}

async function runChain(d: SyncBatchDeps) {
  const results = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await syncBatch({ ...d, cursor });
    if (!r.ok) throw new Error(r.error.code);
    results.push(r.data);
    if (!r.data.hasMore) break;
    cursor = r.data.cursor;
    t += 1_000;
  }
  return results;
}

beforeEach(async () => {
  db = await createTestDb();
  t = 1_800_000_000_000;
});

describe("syncBatch (v2)", () => {
  it("stores every queue (no queue=420 filter) and snapshots solo + flex", async () => {
    const getMatchIds = vi.fn(createFixtureRiotClient(DIR).getMatchIds);
    const riot: RiotClient = { ...createFixtureRiotClient(DIR), getMatchIds };
    const results = await runChain(deps({ riot }));
    for (const call of getMatchIds.mock.calls) expect(call[1].queue).toBeUndefined();

    const last = results.at(-1);
    expect(last?.totalMatches).toBe(ALL_IDS.length);
    const page = await listMatchSummaries(db, { puuid: ME.puuid, filter: { kind: "all" }, limit: 100, offset: 0 });
    expect(new Set(page.items.map((m) => m.queueId))).toEqual(new Set([420, 440, 400, 450, 1700]));
    expect(last?.rank.solo?.tier).toBe("BRONZE");
    expect(last?.rank.flex?.tier).toBe("SILVER");
    expect(last?.rank.flex?.queueType).toBe("RANKED_FLEX_SR");
    expect(last?.snapshotCreated).toBe(true);
  });

  it("processes ≤ batchSize per call and resumes from the cursor", async () => {
    const first = await syncBatch(deps());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.newMatches).toBe(15);
    expect(first.data.hasMore).toBe(true);
    expect(first.data.remaining).toBe(ALL_IDS.length - 15);
    expect(first.data.cursor).toEqual(expect.any(String));
    expect(first.data.rank.solo).toBeNull(); // ranks are written at the end of the chain

    t += 1_000;
    const second = await syncBatch(deps({ cursor: first.data.cursor }));
    expect(second.ok && second.data).toMatchObject({ newMatches: ALL_IDS.length - 15, hasMore: false, cursor: null, remaining: 0 });
    expect(await countMatches(db, ME.puuid)).toBe(ALL_IDS.length);
  });

  it("resumes pending ids after an interrupted batch (no cursor needed, nothing refetched)", async () => {
    const base = createFixtureRiotClient(DIR);
    let calls = 0;
    const flaky: RiotClient = {
      ...base,
      getMatch: async (id) => {
        if (++calls === 4) throw new (await import("@/lib/riot/errors")).RiotApiError("unavailable", 503);
        return base.getMatch(id);
      },
    };
    const r1 = await syncBatch(deps({ riot: flaky }));
    expect(!r1.ok && r1.error.code).toBe("RIOT_UNAVAILABLE");
    expect(await countMatches(db, ME.puuid)).toBe(3);

    const getMatch = vi.fn(base.getMatch);
    const results = await runChain(deps({ riot: { ...base, getMatch } }));
    expect(results.at(-1)?.totalMatches).toBe(ALL_IDS.length);
    expect(getMatch).toHaveBeenCalledTimes(ALL_IDS.length - 3);
  });

  it("applies a 2-min cooldown once the chain ends", async () => {
    await runChain(deps());
    t += 1_000;
    const blocked = await syncBatch(deps());
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe("SYNC_COOLDOWN");
    expect(blocked.error.retryAfterS).toBeGreaterThan(100);
    expect(blocked.error.message).toMatch(/Espera/);

    t += SYNC_COOLDOWN_MS;
    const again = await syncBatch(deps());
    expect(again.ok && again.data).toMatchObject({ newMatches: 0, hasMore: false, snapshotCreated: false });
  });

  it("rejects a batch while another holds the lease", async () => {
    expect(await acquireSyncLease(db, ME.puuid, t, 30_000)).not.toBeNull();
    const r = await syncBatch(deps());
    expect(!r.ok && r.error.code).toBe("SYNC_IN_PROGRESS");
  });

  it("ends the batch with RIOT_RATE_LIMITED + retryAfterS on 429 before any progress", async () => {
    const base = createFixtureRiotClient(DIR);
    const { RiotApiError } = await import("@/lib/riot/errors");
    const riot: RiotClient = { ...base, getMatch: async () => Promise.reject(new RiotApiError("rate_limited", 429, 7)) };
    const r = await syncBatch(deps({ riot }));
    expect(!r.ok && r.error).toMatchObject({ code: "RIOT_RATE_LIMITED", retryAfterS: 7 });
  });

  it("shares stored matches between players: no refetch, no duplicate participants", async () => {
    const shared = "LA1_1500000100";
    const friend = readMatch(shared).info.participants.find((p) => p.puuid !== ME.puuid);
    if (!friend) throw new Error("fixture");
    const base = createFixtureRiotClient(DIR);
    await runChain(deps());

    const getMatch = vi.fn(base.getMatch);
    const friendRiot: RiotClient = {
      ...base,
      getMatchIds: async (puuid) => (puuid === friend.puuid ? [shared] : []),
      getMatch,
      getLeagueEntries: async () => [],
    };
    const friendRef: PlayerRef = { puuid: friend.puuid, gameName: "Friend", tagLine: "LAN", platform: "la1" };
    const r = await syncBatch(deps({ riot: friendRiot, player: friendRef }));
    expect(r.ok && r.data).toMatchObject({ newMatches: 0, totalMatches: 1, hasMore: false });
    expect(getMatch).not.toHaveBeenCalled();

    const rows = await db.query<{ n: number }>("select count(*)::int as n from match_participants where match_id = $1", [shared]);
    expect(rows.rows[0]?.n).toBe(10);
    const matches = await db.query<{ n: number }>("select count(*)::int as n from matches where match_id = $1", [shared]);
    expect(matches.rows[0]?.n).toBe(1);
  });
});

describe("mapMatchWrite", () => {
  it("maps every participant of an SR match with Riot IDs", () => {
    const m = mapMatchWrite(readMatch("LA1_1500000101"), "LA1");
    expect(m).toMatchObject({ queueId: 440, platform: "la1" });
    expect(m.participants).toHaveLength(10);
    expect(m.participants.every((p) => p.placement === null)).toBe(true);
  });

  it("maps Arena (1700): 16 players, placement per duo, team kills per subteam", () => {
    const dto = readMatch("LA1_1500000104");
    const m = mapMatchWrite(dto, "la1");
    expect(m.queueId).toBe(1700);
    expect(m.participants).toHaveLength(16);
    const me = m.participants.find((p) => p.puuid === ME.puuid);
    const duo = dto.info.participants.filter((p) => p.playerSubteamId === 1);
    expect(me?.placement).toBe(4);
    expect(me?.teamKills).toBe(duo.reduce((s, p) => s + p.kills, 0));
    expect(me?.opponentChampionName).toBeNull();
    expect(new Set(m.participants.map((p) => p.placement))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it("Arena placement survives storage and the queue filter", async () => {
    await runChain(deps());
    const arena = await listMatchSummaries(db, { puuid: ME.puuid, filter: { kind: "category", category: "arena" }, limit: 10, offset: 0 });
    expect(arena.items).toHaveLength(1);
    expect(arena.items[0]).toMatchObject({ queueId: 1700, placement: 4 });
  });
});
