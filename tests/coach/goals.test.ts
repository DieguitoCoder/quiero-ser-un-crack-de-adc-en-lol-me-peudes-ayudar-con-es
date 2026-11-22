import { describe, expect, it } from "vitest";
import { evaluateGoals, evaluateValue, GOALS, GOAL_WINDOW, PHASE_GOALS } from "@/lib/coach/goals";
import { makeGame, makeSeries } from "../fixtures/coach/games";
import type { MatchRecord } from "@/lib/types";

/** n identical games with the given overrides. */
const many = (n: number, o: Partial<MatchRecord>): MatchRecord[] => makeSeries(Array.from({ length: n }, () => o));
/** 30-min game with the requested cs/min. */
const cs = (perMin: number): Partial<MatchRecord> => ({ csTotal: perMin * 30 });

describe("evaluateValue thresholds (gte)", () => {
  const def = GOALS.bronze_cs_per_min; // >= 6
  it("green at exactly target", () => expect(evaluateValue(def, 6).status).toBe("green"));
  it("yellow at exactly 90% of target", () => expect(evaluateValue(def, 5.4).status).toBe("yellow"));
  it("red just under 90%", () => expect(evaluateValue(def, 5.39).status).toBe("red"));
  it("progress is capped at 1 and proportional", () => {
    expect(evaluateValue(def, 12).progress).toBe(1);
    expect(evaluateValue(def, 3).progress).toBe(0.5);
  });
});

describe("evaluateValue thresholds (lte)", () => {
  const def = GOALS.bronze_deaths; // <= 5
  it("green at exactly target", () => expect(evaluateValue(def, 5)).toEqual({ status: "green", progress: 1 }));
  it("yellow at exactly 110% of target", () => expect(evaluateValue(def, 5.5).status).toBe("yellow"));
  it("red just over 110%", () => expect(evaluateValue(def, 5.51).status).toBe("red"));
  it("progress decays and floors at 0", () => {
    expect(evaluateValue(def, 6).progress).toBeCloseTo(0.8);
    expect(evaluateValue(def, 20).progress).toBe(0);
  });
});

describe("evaluateGoals", () => {
  it("returns the phase goal list with carried flags", () => {
    const goals = evaluateGoals("GOLD", many(5, {}));
    expect(goals.map((g) => [g.id, g.carried])).toEqual(PHASE_GOALS.GOLD.map((g) => [g.id, g.carried]));
  });

  it("is insufficient below MIN_GOAL_SAMPLE (remakes do not count)", () => {
    const games = [...many(4, {}), makeGame({ isRemake: true })];
    for (const g of evaluateGoals("BRONZE", games)) {
      expect(g).toMatchObject({ value: null, status: "insufficient", progress: 0 });
    }
  });

  it("evaluates exactly at the minimum sample", () => {
    const [csGoal] = evaluateGoals("BRONZE", many(5, cs(6)));
    expect(csGoal).toMatchObject({ id: "bronze_cs_per_min", status: "green", target: 6 });
    expect(csGoal?.value).toBeCloseTo(6);
  });

  it("Bronze: cs/min and avg deaths", () => {
    const [csGoal, deathGoal] = evaluateGoals("BRONZE", many(10, { ...cs(5.5), deaths: 6 }));
    expect(csGoal?.status).toBe("yellow");
    expect(deathGoal?.status).toBe("red");
    expect(deathGoal?.value).toBe(6);
  });

  it("Silver: control wards per game, with carried Bronze deaths", () => {
    const goals = evaluateGoals("SILVER", many(10, { ...cs(7), controlWardsBought: 1, deaths: 5 }));
    expect(goals.map((g) => g.status)).toEqual(["green", "green", "green"]);
    expect(goals[2]?.carried).toBe(true);
    const zero = evaluateGoals("SILVER", many(10, { controlWardsBought: 0 }));
    expect(zero[1]?.status).toBe("red");
  });

  it("Gold: kill participation >= 50% and deaths <= 4", () => {
    const ok = evaluateGoals("GOLD", many(10, { kills: 5, assists: 5, teamKills: 20, deaths: 4 }));
    expect(ok[0]).toMatchObject({ status: "green", value: 0.5 });
    expect(ok[1]?.status).toBe("green");
    const low = evaluateGoals("GOLD", many(10, { kills: 4, assists: 5, teamKills: 20, deaths: 5 }));
    expect(low[0]?.status).toBe("yellow"); // 0.45 = exactly 90% of the 0.5 target
    expect(low[1]?.status).toBe("red"); // 5 > 4.4
  });

  it("uses only the last GOAL_WINDOW non-remake games", () => {
    const games = makeSeries([
      ...Array.from({ length: 5 }, () => ({ deaths: 20 })),
      ...Array.from({ length: GOAL_WINDOW }, () => ({ deaths: 1 })),
    ]);
    expect(evaluateGoals("BRONZE", games)[1]?.value).toBe(1);
  });
});
