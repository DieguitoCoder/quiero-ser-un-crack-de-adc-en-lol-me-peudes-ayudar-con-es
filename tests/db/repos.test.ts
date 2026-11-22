import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as repo from "@/lib/db/repos";
import type { MatchWrite } from "@/lib/db/repos";
import type { Db } from "@/lib/db/types";
import { createTestDb, seedProfile } from "./helpers";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const NOW = 1_700_000_000_000;

function match(id: string, puuids: string[], creation: number, queueId = 420): MatchWrite {
  return {
    matchId: id, platform: "la1", gameCreation: creation, gameDurationS: 1800, queueId, patch: "14.1", isRemake: false,
    participants: puuids.map((puuid, i) => ({
      puuid, championId: i + 1, championName: `Champ${i}`, teamId: i % 2 === 0 ? 100 : 200, teamPosition: "MIDDLE",
      win: i % 2 === 0, kills: 5, deaths: 2, assists: 3, csTotal: 180, goldEarned: 10000, damageToChampions: 15000,
      visionScore: 20, controlWardsBought: 2, teamKills: 20, opponentChampionId: null, opponentChampionName: null,
      opponentCsTotal: null, csDiff10: 1.5, maxCsAdvantage: null, riotIdGameName: "P", riotIdTagLine: "LAN",
      placement: queueId === 1700 ? i + 1 : null,
    })),
  };
}

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

describe("profiles", () => {
  it("upserts, reads, and rejects a verified puuid claimed by another user", async () => {
    expect(await repo.getProfile(db, A)).toBeNull();
    const p = await repo.upsertProfile(db, { userId: A, puuid: "pa", gameName: "A", tagLine: "LAN", platform: "la1", verified: true, now: NOW });
    expect(p).toMatchObject({ userId: A, puuid: "pa", verified: true, createdAt: NOW });
    expect(await repo.findUserIdByVerifiedPuuid(db, "pa")).toBe(A);
    await expect(
      repo.upsertProfile(db, { userId: B, puuid: "pa", gameName: "A", tagLine: "LAN", platform: "la1", verified: true, now: NOW }),
    ).rejects.toBeInstanceOf(repo.RiotIdTakenError);
    // unverified link of the same puuid is allowed
    await repo.upsertProfile(db, { userId: B, puuid: "pa", gameName: "A", tagLine: "LAN", platform: "la1", verified: false, now: NOW });
  });

  it("finds summoners case-insensitively", async () => {
    await repo.upsertSummoner(db, { puuid: "p1", gameName: "Faker", tagLine: "KR1", platform: "la1", now: NOW });
    expect(await repo.findSummonerByRiotId(db, "faker", "kr1")).toMatchObject({ puuid: "p1", updatedAt: NOW });
    expect(await repo.findSummonerByRiotId(db, "nobody", "x")).toBeNull();
  });
});

describe("matches", () => {
  it("inserts idempotently and lists by queue filter, newest first", async () => {
    expect(await repo.insertMatch(db, match("M1", ["p1", "p2"], NOW), NOW)).toBe(true);
    expect(await repo.insertMatch(db, match("M1", ["p1", "p2"], NOW), NOW)).toBe(false);
    await repo.insertMatch(db, match("M2", ["p1"], NOW + 1000, 450), NOW);
    await repo.insertMatch(db, match("M3", ["p1"], NOW + 2000, 1700), NOW);
    await repo.insertMatch(db, match("M4", ["p1"], NOW + 3000, 9999), NOW);

    expect(await repo.existingMatchIds(db, ["M1", "MX"])).toEqual(new Set(["M1"]));
    expect(await repo.existingMatchIds(db, [])).toEqual(new Set());
    expect(await repo.countMatches(db, "p1")).toBe(4);
    expect(await repo.countMatches(db, "p1", { kind: "category", category: "ranked" })).toBe(1);
    expect(await repo.countMatches(db, "p1", { kind: "category", category: "other" })).toBe(1);
    expect(await repo.countMatches(db, "p1", { kind: "id", id: 450 })).toBe(1);

    const list = await repo.listMatchSummaries(db, { puuid: "p1", filter: { kind: "all" }, limit: 2, offset: 0 });
    expect(list.total).toBe(4);
    expect(list.items.map((i) => i.matchId)).toEqual(["M4", "M3"]);
    expect(list.items[1]).toMatchObject({ queueId: 1700, placement: 1, kda: 4, csPerMin: 6, hasJournal: false });
    expect(list.champions).toEqual(["Champ0"]);

    const recs = await repo.listMatchRecords(db, "p1", { kind: "all" }, 2);
    expect(recs.map((r) => r.matchId)).toEqual(["M3", "M4"]);
    expect(await repo.getMatchRecord(db, "M1", "p2")).toMatchObject({ teamId: 200, win: false, csDiff10: 1.5 });
    expect((await repo.aggregateStats(db, "p1", { kind: "all" }))?.games).toBe(4);
  });
});

describe("journal isolation", () => {
  it("user A cannot read user B's journal through repos", async () => {
    await seedProfile(db, A);
    await seedProfile(db, B);
    await repo.insertMatch(db, match("M1", ["p1"], NOW), NOW);
    await repo.upsertJournalEntry(db, B, "M1", { deathReasons: ["no_vision"], lesson: "ward", tilt: 3 }, NOW);

    expect(await repo.getJournalEntry(db, A, "M1")).toBeNull();
    expect(await repo.listJournalEntries(db, A)).toEqual([]);
    expect(await repo.listJournalEntries(db, A, ["M1"])).toEqual([]);
    expect(await repo.getJournalEntry(db, B, "M1")).toEqual({
      matchId: "M1", deathReasons: ["no_vision"], lesson: "ward", tilt: 3, updatedAt: NOW,
    });
    const forA = await repo.listMatchSummaries(db, { puuid: "p1", filter: { kind: "all" }, limit: 10, offset: 0, userId: A });
    const forB = await repo.listMatchSummaries(db, { puuid: "p1", filter: { kind: "all" }, limit: 10, offset: 0, userId: B });
    expect(forA.items[0]?.hasJournal).toBe(false);
    expect(forB.items[0]?.hasJournal).toBe(true);
  });
});

describe("deleteUserData", () => {
  it("removes all rows owned by the user and keeps shared + other users' data", async () => {
    await repo.upsertProfile(db, { userId: A, puuid: "p1", gameName: "A", tagLine: "LAN", platform: "la1", verified: false, now: NOW });
    await seedProfile(db, B);
    await repo.insertMatch(db, match("M1", ["p1"], NOW), NOW);
    await repo.upsertJournalEntry(db, A, "M1", { deathReasons: [], lesson: "a", tilt: null }, NOW);
    await repo.upsertJournalEntry(db, B, "M1", { deathReasons: [], lesson: "b", tilt: null }, NOW);

    expect(await repo.deleteUserData(db, A)).toEqual({ journalEntries: 1, profile: true });
    const left = await db.query<{ n: number }>(
      "select (select count(*) from profiles where user_id = $1) + (select count(*) from journal_entries where user_id = $1) as n",
      [A],
    );
    expect(left.rows[0]?.n).toBe(0);
    expect(await repo.getJournalEntry(db, B, "M1")).not.toBeNull();
    expect(await repo.countMatches(db, "p1")).toBe(1);
    expect(await repo.deleteUserData(db, A)).toEqual({ journalEntries: 0, profile: false });
  });
});

describe("rank snapshots", () => {
  it("inserts only on change and computes ladderScore", async () => {
    const s = { puuid: "p1", queueId: 420 as const, takenAt: NOW, queueType: "RANKED_SOLO_5x5", tier: "GOLD" as const, division: "II" as const, lp: 40, wins: 10, losses: 8 };
    expect((await repo.insertRankSnapshotIfChanged(db, s)).created).toBe(true);
    expect((await repo.insertRankSnapshotIfChanged(db, { ...s, takenAt: NOW + 1 })).created).toBe(false);
    const changed = await repo.insertRankSnapshotIfChanged(db, { ...s, takenAt: NOW + 2, lp: 60 });
    expect(changed.created).toBe(true);
    expect(changed.snapshot.ladderScore).not.toBeNull();
    expect((await repo.listRankSnapshots(db, "p1", 420)).length).toBe(2);
    expect(await repo.latestRankSnapshot(db, "p1", 440)).toBeNull();
  });
});

describe("sync lease", () => {
  it("acquires once, blocks while held, releases with patch", async () => {
    expect(await repo.acquireSyncLease(db, "p1", NOW, 30_000)).toMatchObject({ leaseUntil: NOW + 30_000, pendingMatchIds: [] });
    expect(await repo.acquireSyncLease(db, "p1", NOW + 1, 30_000)).toBeNull();
    const rel = await repo.releaseSyncLease(db, "p1", { pendingMatchIds: ["a", "b"], backfillStart: null, lastErrorCode: "RATE_LIMITED" }, NOW + 5);
    expect(rel).toMatchObject({ leaseUntil: 0, pendingMatchIds: ["a", "b"], backfillStart: null, lastErrorCode: "RATE_LIMITED", lastErrorAt: NOW + 5 });
    expect(await repo.acquireSyncLease(db, "p1", NOW + 6, 30_000)).not.toBeNull();
  });
});

describe("consumeRateLimit", () => {
  it("counts within a window, rejects over limit, resets on the next window", async () => {
    const w = 60_000;
    const t0 = 1_700_000_040_000; // window [1_699_999_980_000 .. +60s)
    const r1 = await repo.consumeRateLimit(db, "ip:x", 2, w, t0);
    const r2 = await repo.consumeRateLimit(db, "ip:x", 2, w, t0 + 1);
    const r3 = await repo.consumeRateLimit(db, "ip:x", 2, w, t0 + 2);
    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, false]);
    expect(r3.count).toBe(3);
    expect(r1.resetAt).toBe(Math.floor(t0 / w) * w + w);
    expect((await repo.consumeRateLimit(db, "ip:y", 2, w, t0)).count).toBe(1);
    const next = await repo.consumeRateLimit(db, "ip:x", 2, w, r1.resetAt);
    expect(next).toMatchObject({ allowed: true, count: 1 });
    // a stale clock does not reset the newer window
    expect((await repo.consumeRateLimit(db, "ip:x", 2, w, t0)).count).toBe(2);
  });
});
