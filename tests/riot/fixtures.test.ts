/** Owner: cobalt. Fixture client + mappers: fixtures satisfy ARCHITECTURE §7 requirements. */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFixtureRiotClient } from "@/lib/riot/mock";
import { mapMatch, soloQueueEntry } from "@/lib/riot/mappers";
import type { MatchRecord } from "@/lib/types";

const riot = createFixtureRiotClient(path.join(process.cwd(), "tests/fixtures/riot"));

async function loadAll(): Promise<MatchRecord[]> {
  const acc = await riot.getAccountByRiotId("xDieguinho", "9250");
  const ids = await riot.getMatchIds(acc.puuid, { queue: 420, start: 0, count: 100 });
  const out: MatchRecord[] = [];
  for (const id of ids) {
    const rec = mapMatch(await riot.getMatch(id), acc.puuid);
    if (rec) out.push(rec);
  }
  return out;
}

describe("fixture Riot client", () => {
  it("resolves the account case-insensitively and rejects other Riot IDs", async () => {
    expect((await riot.getAccountByRiotId("XDIEGUINHO", "9250")).puuid).toMatch(/^mock-/);
    await expect(riot.getAccountByRiotId("someone", "1")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("applies start/count to match ids and refuses path traversal", async () => {
    const acc = await riot.getAccountByRiotId("xDieguinho", "9250");
    expect(await riot.getMatchIds(acc.puuid, { queue: 420, start: 2, count: 3 })).toHaveLength(3);
    await expect(riot.getMatch("../account")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("contains the required scenarios", async () => {
    const games = await loadAll();
    expect(games.length).toBeGreaterThanOrEqual(12);
    expect(new Set(games.map((g) => g.championName))).toEqual(new Set(["Jinx", "MissFortune", "Tristana", "Ashe"]));
    expect(games.filter((g) => g.isRemake)).toHaveLength(1);
    expect(games.some((g) => g.win) && games.some((g) => !g.win && !g.isRemake)).toBe(true);
    expect(games.slice(0, 2).every((g) => !g.win)).toBe(true);
    expect(games.some((g) => g.teamPosition === "" && g.opponentChampionName === null)).toBe(true);
    expect(games.some((g) => !g.isRemake && g.csDiff10 === null)).toBe(true);
    const laned = games.find((g) => g.teamPosition === "BOTTOM" && !g.isRemake);
    expect(laned?.opponentChampionName).toBeTruthy();
    expect(laned?.csDiff10).not.toBeNull();
    expect(laned?.patch).toMatch(/^\d+\.\d+$/);
  });

  it("returns Bronze III as the SoloQ entry", async () => {
    const acc = await riot.getAccountByRiotId("xDieguinho", "9250");
    expect(soloQueueEntry(await riot.getLeagueEntries(acc.puuid))).toEqual({
      tier: "BRONZE",
      division: "III",
      lp: 45,
      wins: 30,
      losses: 28,
    });
  });
});
