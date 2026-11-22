import { describe, expect, it } from "vitest";
import {
  aggregate,
  buildTrend,
  currentStreak,
  deriveMetrics,
  movingAverage,
  statsByChampion,
  statsByOpponent,
} from "@/lib/coach/metrics";
import { makeGame, makeSeries } from "../fixtures/coach/games";

describe("deriveMetrics", () => {
  it("computes per-game metrics", () => {
    const m = deriveMetrics(
      makeGame({ gameDurationS: 1800, csTotal: 180, kills: 8, assists: 4, deaths: 3, teamKills: 20, visionScore: 30, opponentCsTotal: 192 }),
    );
    expect(m.durationMin).toBe(30);
    expect(m.csPerMin).toBe(6);
    expect(m.kda).toBe(4);
    expect(m.killParticipation).toBe(0.6);
    expect(m.visionPerMin).toBe(1);
    expect(m.csDiffVsOpponent).toBe(-12);
  });

  it("uses max(1, deaths) for KDA and handles zero team kills / zero duration", () => {
    const m = deriveMetrics(makeGame({ kills: 3, assists: 2, deaths: 0, teamKills: 0, gameDurationS: 0 }));
    expect(m.kda).toBe(5);
    expect(m.killParticipation).toBe(0);
    expect(m.csPerMin).toBe(0);
  });

  it("returns null csDiff without opponent", () => {
    expect(deriveMetrics(makeGame({ opponentCsTotal: null })).csDiffVsOpponent).toBeNull();
  });
});

describe("aggregate", () => {
  it("returns null for empty or remake-only input", () => {
    expect(aggregate([])).toBeNull();
    expect(aggregate([makeGame({ isRemake: true })])).toBeNull();
  });

  it("weights by minutes / team kills and ignores remakes", () => {
    const stats = aggregate([
      makeGame({ gameDurationS: 1200, csTotal: 120, kills: 2, assists: 2, deaths: 2, teamKills: 10, controlWardsBought: 0, win: false }),
      makeGame({ gameDurationS: 2400, csTotal: 360, kills: 6, assists: 6, deaths: 4, teamKills: 30, controlWardsBought: 2, win: true }),
      makeGame({ isRemake: true, csTotal: 9999, deaths: 99 }),
    ]);
    expect(stats).not.toBeNull();
    expect(stats?.games).toBe(2);
    expect(stats?.wins).toBe(1);
    expect(stats?.winrate).toBe(0.5);
    expect(stats?.csPerMin).toBeCloseTo(480 / 60);
    expect(stats?.avgDeaths).toBe(3);
    expect(stats?.killParticipation).toBeCloseTo(16 / 40);
    expect(stats?.controlWardsPerGame).toBe(1);
    expect(stats?.kda).toBeCloseTo(16 / 6);
  });
});

describe("movingAverage", () => {
  it("is null until the window is full", () => {
    expect(movingAverage([1, 2, 3, 4, 5, 6], 5)).toEqual([null, null, null, null, 3, 4]);
    expect(movingAverage([1, 2], 5)).toEqual([null, null]);
    expect(movingAverage([], 5)).toEqual([]);
  });
});

describe("currentStreak", () => {
  it("is null with no games", () => {
    expect(currentStreak([])).toBeNull();
  });
  it("counts from the most recent game regardless of input order and skips remakes", () => {
    const games = makeSeries([{ win: true }, { win: false }, { win: false }, { win: true, isRemake: true }]);
    expect(currentStreak([...games].reverse())).toEqual({ kind: "loss", count: 2 });
  });
  it("detects win streaks", () => {
    expect(currentStreak(makeSeries([{ win: false }, { win: true }, { win: true }, { win: true }]))).toEqual({ kind: "win", count: 3 });
  });
});

describe("statsByChampion / statsByOpponent", () => {
  const games = makeSeries([
    { championName: "Jinx", championId: 222, win: true, opponentChampionName: "Caitlyn", csDiff10: 10 },
    { championName: "Jinx", championId: 222, win: false, opponentChampionName: "Caitlyn", csDiff10: -20 },
    { championName: "Ashe", championId: 22, win: true, opponentChampionName: "Ezreal", csDiff10: null },
    { championName: "Tristana", championId: 18, win: true, opponentChampionName: null },
    { championName: "Ashe", championId: 22, win: true, isRemake: true },
  ]);

  it("groups by champion with game counts, sorted games desc then name", () => {
    const res = statsByChampion(games);
    expect(res.map((c) => [c.championName, c.games, c.wins])).toEqual([
      ["Jinx", 2, 1],
      ["Ashe", 1, 1],
      ["Tristana", 1, 1],
    ]);
    expect(res[0]?.winrate).toBe(0.5);
  });

  it("groups by lane opponent, excluding games without one", () => {
    const res = statsByOpponent(games);
    expect(res.map((o) => [o.opponentChampionName, o.games, o.wins])).toEqual([
      ["Caitlyn", 2, 1],
      ["Ezreal", 1, 1],
    ]);
    expect(res[0]?.avgCsDiff).toBe(-5);
    expect(res[1]?.avgCsDiff).toBeNull();
  });
});

describe("buildTrend", () => {
  it("is chronological, drops remakes and nulls MA5 for the first 4 points", () => {
    const games = makeSeries([
      { deaths: 1 },
      { deaths: 2 },
      { deaths: 3 },
      { deaths: 4 },
      { deaths: 5 },
      { deaths: 9, isRemake: true },
    ]);
    const trend = buildTrend([...games].reverse());
    expect(trend).toHaveLength(5);
    expect(trend.map((t) => t.deaths)).toEqual([1, 2, 3, 4, 5]);
    expect(trend.slice(0, 4).every((t) => t.deathsMa5 === null && t.csPerMinMa5 === null)).toBe(true);
    expect(trend[4]?.deathsMa5).toBe(3);
    expect(trend[4]?.csPerMinMa5).toBeCloseTo(7);
  });
});
