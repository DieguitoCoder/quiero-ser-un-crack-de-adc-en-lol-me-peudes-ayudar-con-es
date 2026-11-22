import { describe, expect, it } from "vitest";
import { isTilted, summarizeRecent, tipsForMatch } from "@/lib/coach/coach";
import { makeGame, makeJournal, makeSeries } from "../fixtures/coach/games";
import type { CoachRuleId, MatchRecord, Phase, TiltLevel } from "@/lib/types";

const ids = (g: MatchRecord, phase: Phase = "BRONZE"): CoachRuleId[] => tipsForMatch(g, phase).map((t) => t.ruleId);
const tipOf = (g: MatchRecord, phase: Phase, id: CoachRuleId) => tipsForMatch(g, phase).find((t) => t.ruleId === id);

describe("tipsForMatch", () => {
  it("returns [] for remakes", () => {
    expect(tipsForMatch(makeGame({ isRemake: true, deaths: 20 }), "BRONZE")).toEqual([]);
  });

  it("GOOD_GAME for a healthy game, with win/loss wording", () => {
    const win = tipsForMatch(makeGame({ win: true }), "BRONZE");
    const loss = tipsForMatch(makeGame({ win: false }), "BRONZE");
    expect(win).toHaveLength(1);
    expect(win[0]).toMatchObject({ ruleId: "GOOD_GAME", severity: "positive" });
    expect(win[0]?.message).toContain("Buena partida");
    expect(loss[0]?.message).toContain("aunque perdiste");
  });

  it("HIGH_DEATHS thresholds: above target medium, 8+ high, per phase", () => {
    expect(ids(makeGame({ deaths: 5 }))).not.toContain("HIGH_DEATHS");
    expect(tipOf(makeGame({ deaths: 6 }), "BRONZE", "HIGH_DEATHS")?.severity).toBe("medium");
    expect(tipOf(makeGame({ deaths: 7 }), "BRONZE", "HIGH_DEATHS")?.severity).toBe("medium");
    expect(tipOf(makeGame({ deaths: 8 }), "BRONZE", "HIGH_DEATHS")?.severity).toBe("high");
    expect(ids(makeGame({ deaths: 5 }), "GOLD")).toContain("HIGH_DEATHS");
    expect(ids(makeGame({ deaths: 4 }), "GOLD")).not.toContain("HIGH_DEATHS");
  });

  it("HIGH_DEATHS message is actionable (review deaths, ward river)", () => {
    const msg = tipOf(makeGame({ deaths: 9 }), "BRONZE", "HIGH_DEATHS")?.message ?? "";
    expect(msg).toContain("Moriste 9 veces");
    expect(msg).toContain("río antes del minuto 3");
  });

  it("LOW_CS thresholds: below target medium, below target-1 high; phase targets", () => {
    expect(ids(makeGame({ csTotal: 180 }))).not.toContain("LOW_CS");
    expect(tipOf(makeGame({ csTotal: 179 }), "BRONZE", "LOW_CS")?.severity).toBe("medium");
    expect(tipOf(makeGame({ csTotal: 150 }), "BRONZE", "LOW_CS")?.severity).toBe("medium");
    expect(tipOf(makeGame({ csTotal: 149 }), "BRONZE", "LOW_CS")?.severity).toBe("high");
    expect(ids(makeGame({ csTotal: 200 }), "SILVER")).toContain("LOW_CS");
    expect(ids(makeGame({ csTotal: 210 }), "SILVER")).not.toContain("LOW_CS");
    expect(tipOf(makeGame({ csTotal: 179 }), "BRONZE", "LOW_CS")?.message).toContain(
      "last-hit 10 minutos en la Herramienta de Práctica",
    );
  });

  it("LOST_LANE_CS fires at csDiff10 <= -15 only", () => {
    expect(ids(makeGame({ csDiff10: -14 }))).not.toContain("LOST_LANE_CS");
    expect(tipOf(makeGame({ csDiff10: -15 }), "BRONZE", "LOST_LANE_CS")?.message).toContain("15 CS menos");
    expect(ids(makeGame({ csDiff10: null }))).not.toContain("LOST_LANE_CS");
  });

  it("NO_CONTROL_WARD: low in Bronze, medium in Silver/Gold, absent with 1 ward", () => {
    const g = makeGame({ controlWardsBought: 0 });
    expect(tipsForMatch(g, "BRONZE")[0]).toMatchObject({ ruleId: "NO_CONTROL_WARD", severity: "low" });
    expect(tipsForMatch(g, "SILVER")[0]?.severity).toBe("medium");
    expect(tipsForMatch(g, "GOLD")[0]?.severity).toBe("medium");
    expect(tipsForMatch(g, "BRONZE")[0]?.message).toContain("en cada regreso a base");
    expect(ids(makeGame({ controlWardsBought: 1 }))).not.toContain("NO_CONTROL_WARD");
  });

  it("LOW_KILL_PARTICIPATION: needs teamKills >= 10 and KP below 40%", () => {
    expect(ids(makeGame({ teamKills: 10, kills: 2, assists: 2 }))).not.toContain("LOW_KILL_PARTICIPATION");
    const low = makeGame({ teamKills: 10, kills: 2, assists: 1 });
    expect(ids(low)).toContain("LOW_KILL_PARTICIPATION");
    expect(ids(makeGame({ teamKills: 9, kills: 0, assists: 0 }))).not.toContain("LOW_KILL_PARTICIPATION");
    expect(tipOf(low, "BRONZE", "LOW_KILL_PARTICIPATION")?.severity).toBe("low");
    expect(tipOf(low, "GOLD", "LOW_KILL_PARTICIPATION")?.severity).toBe("medium");
    expect(tipOf(low, "BRONZE", "LOW_KILL_PARTICIPATION")?.message).toContain("30%");
    expect(tipOf(low, "BRONZE", "LOW_KILL_PARTICIPATION")?.message).toContain("primera torre");
  });

  it("LOW_VISION: below 0.4 per minute only", () => {
    expect(ids(makeGame({ visionScore: 12 }))).not.toContain("LOW_VISION");
    expect(ids(makeGame({ visionScore: 11 }))).toContain("LOW_VISION");
  });

  it("keeps at most 3 tips ordered by severity, ties by rule order", () => {
    const bad = makeGame({
      deaths: 10,
      csTotal: 100,
      csDiff10: -30,
      controlWardsBought: 0,
      visionScore: 5,
      teamKills: 20,
      kills: 1,
      assists: 1,
    });
    const tips = tipsForMatch(bad, "BRONZE");
    expect(tips.map((t) => t.ruleId)).toEqual(["HIGH_DEATHS", "LOW_CS", "LOST_LANE_CS"]);
    expect(tips.map((t) => t.severity)).toEqual(["high", "high", "medium"]);
  });

  it("is deterministic", () => {
    const g = makeGame({ deaths: 7, controlWardsBought: 0 });
    expect(tipsForMatch(g, "SILVER")).toEqual(tipsForMatch(g, "SILVER"));
  });
});

describe("isTilted", () => {
  it("needs the 2 most recent non-remake games to be losses", () => {
    expect(isTilted(makeSeries([{ win: true }, { win: false }, { win: false }]))).toBe(true);
    expect(isTilted(makeSeries([{ win: false }, { win: false }, { win: true }]))).toBe(false);
    expect(isTilted(makeSeries([{ win: false }]))).toBe(false);
    expect(isTilted([])).toBe(false);
  });
  it("ignores remakes and input order", () => {
    const g = makeSeries([{ win: false }, { win: false }, { win: true, isRemake: true }]);
    expect(isTilted([...g].reverse())).toBe(true);
  });
});

describe("summarizeRecent", () => {
  const rules = (games: MatchRecord[], journal: Parameters<typeof summarizeRecent>[1] = []) =>
    summarizeRecent(games, journal, "BRONZE").insights.map((i) => i.ruleId);

  it("handles no games", () => {
    expect(summarizeRecent([], [], "BRONZE")).toEqual({ games: 0, stats: null, tilt: false, insights: [] });
  });

  it("limits to the last 10 non-remake games", () => {
    const games = makeSeries([...Array.from({ length: 14 }, () => ({})), { isRemake: true }]);
    const s = summarizeRecent(games, [], "BRONZE");
    expect(s.games).toBe(10);
    expect(s.stats?.games).toBe(10);
  });

  it("TILT_LOSS_STREAK on 2 losses, listed first, with rest message", () => {
    const s = summarizeRecent(makeSeries([{ win: true }, { win: false }, { win: false }, { win: false }]), [], "BRONZE");
    expect(s.tilt).toBe(true);
    expect(s.insights[0]).toMatchObject({ ruleId: "TILT_LOSS_STREAK", severity: "high" });
    expect(s.insights[0]?.message).toContain("3 derrotas seguidas");
    expect(s.insights[0]?.message).toContain("Descansa un rato antes de la próxima ranked");
  });

  it("no tilt on a single loss", () => {
    const games = makeSeries([{ win: true }, { win: false }]);
    expect(summarizeRecent(games, [], "BRONZE").tilt).toBe(false);
    expect(rules(games)).not.toContain("TILT_LOSS_STREAK");
  });

  it("TILT_SELF_REPORTED: at least 2 of the 3 most recent entries with tilt >= 4", () => {
    const games = makeSeries([{}, {}, {}, {}]);
    const j = (i: number, tilt: TiltLevel) => makeJournal(games[i]?.matchId ?? "", { tilt });
    expect(rules(games, [j(3, 4), j(2, 2), j(1, 5), j(0, 5)])).toContain("TILT_SELF_REPORTED");
    expect(rules(games, [j(3, 4), j(2, 3), j(1, 3), j(0, 5)])).not.toContain("TILT_SELF_REPORTED");
  });

  it("TOP_DEATH_REASON needs count >= 3 and breaks ties by DEATH_REASONS order", () => {
    const games = makeSeries(Array.from({ length: 6 }, () => ({})));
    const entries = (reasons: ("no_vision" | "greed")[][]) =>
      reasons.map((r, i) => makeJournal(games[i]?.matchId ?? "", { deathReasons: r }));
    expect(rules(games, entries([["greed"], ["greed"]]))).not.toContain("TOP_DEATH_REASON");
    const tie = entries([["greed"], ["greed"], ["greed", "no_vision"], ["no_vision"], ["no_vision"]]);
    const t = summarizeRecent(games, tie, "BRONZE").insights.find((i) => i.ruleId === "TOP_DEATH_REASON");
    expect(t?.message).toContain("(3 veces)");
    expect(t?.message).toContain("Sin visión"); // no_vision precedes greed in DEATH_REASONS
  });

  it("DEATHS_TREND and CS_TREND need 10 games and respect the boundaries", () => {
    const mk = (prevDeaths: number, lastDeaths: number, prevCs: number, lastCs: number) =>
      makeSeries([
        ...Array.from({ length: 5 }, () => ({ deaths: prevDeaths, csTotal: prevCs * 30 })),
        ...Array.from({ length: 5 }, () => ({ deaths: lastDeaths, csTotal: lastCs * 30 })),
      ]);
    const rule = (g: MatchRecord[], id: CoachRuleId) => summarizeRecent(g, [], "BRONZE").insights.find((i) => i.ruleId === id);
    expect(rule(mk(3, 4, 7, 7), "DEATHS_TREND")?.severity).toBe("medium");
    expect(rule(mk(3, 3.9, 7, 7), "DEATHS_TREND")).toBeUndefined();
    expect(rule(mk(5, 4, 7, 7), "DEATHS_TREND")?.severity).toBe("positive");
    expect(rule(mk(3, 3, 7, 6.5), "CS_TREND")?.severity).toBe("medium");
    expect(rule(mk(3, 3, 7, 6.6), "CS_TREND")).toBeUndefined();
    expect(rule(mk(3, 3, 6, 6.5), "CS_TREND")?.severity).toBe("positive");
    expect(rule(mk(1, 9, 7, 3).slice(1), "DEATHS_TREND")).toBeUndefined();
  });

  it("WORST_CHAMPION (<= 34%, 3+ games) and BEST_CHAMPION (>= 60%, 3+ games)", () => {
    const games = makeSeries([
      { championName: "Ashe", win: false },
      { championName: "Ashe", win: false },
      { championName: "Ashe", win: true },
      { championName: "Jinx", win: true },
      { championName: "Jinx", win: true },
      { championName: "Jinx", win: false },
      { championName: "Tristana", win: true },
    ]);
    const ins = summarizeRecent(games, [], "BRONZE").insights;
    expect(ins.find((i) => i.ruleId === "WORST_CHAMPION")?.message).toContain("Ashe vas 1-2");
    expect(ins.find((i) => i.ruleId === "BEST_CHAMPION")?.message).toContain("Jinx es tu mejor pick ahora (2-1)");
  });

  it("champion rules do not fire under 3 games or between thresholds", () => {
    const two = makeSeries([{ championName: "Ashe", win: false }, { championName: "Ashe", win: false }]);
    expect(rules(two)).not.toContain("WORST_CHAMPION");
    const mid = makeSeries([
      { championName: "Ashe", win: true },
      { championName: "Ashe", win: false },
      { championName: "Ashe", win: false },
      { championName: "Ashe", win: true },
    ]);
    expect(rules(mid)).not.toContain("WORST_CHAMPION");
    expect(rules(mid)).not.toContain("BEST_CHAMPION");
  });

  it("returns at most 4 insights, high severity first", () => {
    const games = makeSeries([
      ...Array.from({ length: 5 }, () => ({ championName: "Ashe", win: true, deaths: 2, csTotal: 240 })),
      ...Array.from({ length: 5 }, () => ({ championName: "Jinx", win: false, deaths: 6, csTotal: 150 })),
    ]);
    const entries = games.slice(-3).map((g) => makeJournal(g.matchId, { tilt: 5, deathReasons: ["greed"] }));
    const s = summarizeRecent(games, entries, "BRONZE");
    expect(s.insights).toHaveLength(4);
    expect(s.insights.slice(0, 2).map((i) => i.ruleId)).toEqual(["TILT_LOSS_STREAK", "TILT_SELF_REPORTED"]);
  });
});
