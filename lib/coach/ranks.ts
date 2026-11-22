/**
 * Tier order, ladder score and phase mapping. Pure. Owner: forge (formula fixed by docs/ARCHITECTURE.md §8).
 */
import type { Division, Phase, Tier } from "@/lib/types";

export const TIER_ORDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
] as const satisfies readonly Tier[];

/** Lowest to highest inside a tier. */
export const DIVISION_ORDER = ["IV", "III", "II", "I"] as const satisfies readonly Division[];

export const TIER_LABELS_ES = {
  IRON: "Hierro",
  BRONZE: "Bronce",
  SILVER: "Plata",
  GOLD: "Oro",
  PLATINUM: "Platino",
  EMERALD: "Esmeralda",
  DIAMOND: "Diamante",
  MASTER: "Maestro",
  GRANDMASTER: "Gran Maestro",
  CHALLENGER: "Retador",
} as const satisfies Record<Tier, string>;

/** Master and above have no divisions; they share one base and LP is unbounded. */
export const APEX_BASE = 2800;

/** Ladder score of the climb goal (Platinum IV 0 LP). */
export const GOAL_LADDER_SCORE = 1600;

export function isTier(value: string): value is Tier {
  return (TIER_ORDER as readonly string[]).includes(value);
}

export function isDivision(value: string): value is Division {
  return (DIVISION_ORDER as readonly string[]).includes(value);
}

/**
 * IRON..DIAMOND: tierIndex*400 + divisionIndex*100 + clamp(lp, 0, 100)
 * MASTER+:       2800 + max(lp, 0)
 * Bronze III 0 LP = 500, Platinum IV 0 LP = 1600.
 */
export function ladderScore(tier: Tier, division: Division, lp: number): number {
  const tierIndex = TIER_ORDER.indexOf(tier);
  if (tierIndex >= TIER_ORDER.indexOf("MASTER")) return APEX_BASE + Math.max(0, lp);
  const divisionIndex = DIVISION_ORDER.indexOf(division);
  return tierIndex * 400 + divisionIndex * 100 + Math.min(100, Math.max(0, lp));
}

/** Inverse of ladderScore for chart axis labels. Apex scores map to MASTER. */
export function rankFromLadderScore(score: number): { tier: Tier; division: Division; lp: number } {
  if (score >= APEX_BASE) return { tier: "MASTER", division: "I", lp: score - APEX_BASE };
  const s = Math.max(0, score);
  const tier = TIER_ORDER[Math.floor(s / 400)] ?? "IRON";
  const division = DIVISION_ORDER[Math.floor((s % 400) / 100)] ?? "IV";
  return { tier, division, lp: s % 100 };
}

/** "Bronce III · 45 LP"; apex: "Maestro · 120 LP"; unranked: "Sin clasificar" */
export function formatRank(tier: Tier | null, division: Division | null, lp: number): string {
  if (!tier) return "Sin clasificar";
  const label = TIER_LABELS_ES[tier];
  const apex = TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf("MASTER");
  return apex || !division ? `${label} · ${lp} LP` : `${label} ${division} · ${lp} LP`;
}

/** Unranked/IRON/BRONZE -> BRONZE, SILVER -> SILVER, GOLD and above -> GOLD. */
export function phaseForTier(tier: Tier | null): Phase {
  if (tier === null || tier === "IRON" || tier === "BRONZE") return "BRONZE";
  if (tier === "SILVER") return "SILVER";
  return "GOLD";
}
