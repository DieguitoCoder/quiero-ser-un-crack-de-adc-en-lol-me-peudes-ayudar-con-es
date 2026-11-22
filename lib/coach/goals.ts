/**
 * Phase goals and traffic-light evaluation. Owner: forge. Values fixed by docs/ARCHITECTURE.md §9.
 */
import type { GoalDefinition, GoalId, GoalProgress, MatchRecord, Phase } from "@/lib/types";
import { aggregate, sortedPlayable } from "@/lib/coach/metrics";

export const GOAL_WINDOW = 20;
export const MIN_GOAL_SAMPLE = 5;
/** Yellow band: within 10% of the target. */
export const YELLOW_TOLERANCE = 0.1;

export const GOALS = {
  bronze_cs_per_min: {
    id: "bronze_cs_per_min",
    phase: "BRONZE",
    metric: "csPerMin",
    comparator: "gte",
    target: 6,
    label: "6+ CS por minuto",
  },
  bronze_deaths: {
    id: "bronze_deaths",
    phase: "BRONZE",
    metric: "avgDeaths",
    comparator: "lte",
    target: 5,
    label: "5 muertes o menos por partida",
  },
  silver_cs_per_min: {
    id: "silver_cs_per_min",
    phase: "SILVER",
    metric: "csPerMin",
    comparator: "gte",
    target: 7,
    label: "7+ CS por minuto",
  },
  silver_control_wards: {
    id: "silver_control_wards",
    phase: "SILVER",
    metric: "controlWardsPerGame",
    comparator: "gte",
    target: 1,
    label: "1+ control ward por partida",
  },
  gold_kill_participation: {
    id: "gold_kill_participation",
    phase: "GOLD",
    metric: "killParticipation",
    comparator: "gte",
    target: 0.5,
    label: "50%+ de participación en kills",
  },
  gold_deaths: {
    id: "gold_deaths",
    phase: "GOLD",
    metric: "avgDeaths",
    comparator: "lte",
    target: 4,
    label: "4 muertes o menos por partida",
  },
} as const satisfies Record<GoalId, GoalDefinition>;

/** Goals shown per phase, in display order. `carried` = belongs to an earlier phase. */
export const PHASE_GOALS = {
  BRONZE: [
    { id: "bronze_cs_per_min", carried: false },
    { id: "bronze_deaths", carried: false },
  ],
  SILVER: [
    { id: "silver_cs_per_min", carried: false },
    { id: "silver_control_wards", carried: false },
    { id: "bronze_deaths", carried: true },
  ],
  GOLD: [
    { id: "gold_kill_participation", carried: false },
    { id: "gold_deaths", carried: false },
    { id: "silver_cs_per_min", carried: true },
    { id: "silver_control_wards", carried: true },
  ],
} as const satisfies Record<Phase, readonly { id: GoalId; carried: boolean }[]>;

/** Traffic light for a value against a goal (architecture section 9). Unrounded comparison. */
export function evaluateValue(
  def: GoalDefinition,
  value: number,
): { status: "green" | "yellow" | "red"; progress: number } {
  const t = def.target;
  if (def.comparator === "gte") {
    const status = value >= t ? "green" : value >= t * (1 - YELLOW_TOLERANCE) ? "yellow" : "red";
    return { status, progress: Math.max(0, Math.min(1, value / t)) };
  }
  const status = value <= t ? "green" : value <= t * (1 + YELLOW_TOLERANCE) ? "yellow" : "red";
  return { status, progress: value <= t ? 1 : Math.max(0, 1 - (value - t) / t) };
}

/** Evaluates the phase goals over the most recent GOAL_WINDOW non-remake games. */
export function evaluateGoals(phase: Phase, games: readonly MatchRecord[]): GoalProgress[] {
  const window = sortedPlayable(games).slice(-GOAL_WINDOW);
  const stats = window.length >= MIN_GOAL_SAMPLE ? aggregate(window) : null;
  return PHASE_GOALS[phase].map(({ id, carried }): GoalProgress => {
    const def: GoalDefinition = GOALS[id];
    if (!stats) return { ...def, value: null, status: "insufficient", progress: 0, carried };
    const value = stats[def.metric];
    return { ...def, value, ...evaluateValue(def, value), carried };
  });
}
