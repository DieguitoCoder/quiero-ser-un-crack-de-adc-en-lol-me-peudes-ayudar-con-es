/**
 * Queue catalog (v2). Owner: orion. Pure, client-safe (no runtime imports).
 * Unknown queue ids resolve to "Modo especial" (category "other", not coach-eligible).
 */
export type QueueCategory = "ranked" | "normal" | "aram" | "arena" | "other";

export interface QueueInfo {
  id: number;
  /** Spanish UI label */
  label: string;
  category: QueueCategory;
  /** Summoner's Rift 5v5 → coach tips and phase goals apply */
  coachEligible: boolean;
}

export const QUEUES = {
  420: { id: 420, label: "Clasificatoria Solo/Dúo", category: "ranked", coachEligible: true },
  440: { id: 440, label: "Clasificatoria Flexible", category: "ranked", coachEligible: true },
  400: { id: 400, label: "Reclutamiento", category: "normal", coachEligible: true },
  430: { id: 430, label: "Normal a ciegas", category: "normal", coachEligible: true },
  490: { id: 490, label: "Partida rápida", category: "normal", coachEligible: true },
  450: { id: 450, label: "ARAM", category: "aram", coachEligible: false },
  1700: { id: 1700, label: "Arena", category: "arena", coachEligible: false },
  1710: { id: 1710, label: "Arena", category: "arena", coachEligible: false },
  900: { id: 900, label: "URF", category: "other", coachEligible: false },
  1900: { id: 1900, label: "URF", category: "other", coachEligible: false },
} as const satisfies Record<number, QueueInfo>;

export type KnownQueueId = keyof typeof QUEUES;

/** Ranked queues that have a league-v4 rank (one LP history each). */
export const RANKED_QUEUE_IDS = [420, 440] as const;
export type RankedQueueId = (typeof RANKED_QUEUE_IDS)[number];

export const RANKED_QUEUE_TYPE = {
  420: "RANKED_SOLO_5x5",
  440: "RANKED_FLEX_SR",
} as const satisfies Record<RankedQueueId, string>;

export const DEFAULT_QUEUE_ID: RankedQueueId = 420;

const SPECIAL = { label: "Modo especial", category: "other", coachEligible: false } as const;

export function queueInfo(id: number): QueueInfo {
  const known = (QUEUES as Record<number, QueueInfo | undefined>)[id];
  return known ?? { id, ...SPECIAL };
}

export function isCoachEligible(id: number): boolean {
  return queueInfo(id).coachEligible;
}

export function isRankedQueue(id: number): id is RankedQueueId {
  return id === 420 || id === 440;
}

/**
 * `?queue=` filter accepted by /api/matches and /api/stats:
 *   "all" | a category ("ranked" | "normal" | "aram" | "arena" | "other") | a numeric queue id.
 */
export type QueueFilter =
  | { kind: "all" }
  | { kind: "category"; category: QueueCategory }
  | { kind: "id"; id: number };

const CATEGORIES: readonly QueueCategory[] = ["ranked", "normal", "aram", "arena", "other"];

function isCategory(raw: string): raw is QueueCategory {
  return (CATEGORIES as readonly string[]).includes(raw);
}

/** Returns null for invalid input (route → VALIDATION_ERROR). Missing/empty → fallback. */
export function parseQueueFilter(
  raw: string | null | undefined,
  fallback: QueueFilter = { kind: "all" },
): QueueFilter | null {
  if (raw == null || raw === "") return fallback;
  if (raw === "all") return { kind: "all" };
  if (isCategory(raw)) return { kind: "category", category: raw };
  if (/^\d{1,5}$/.test(raw)) return { kind: "id", id: Number(raw) };
  return null;
}

export function matchesQueueFilter(queueId: number, f: QueueFilter): boolean {
  if (f.kind === "all") return true;
  if (f.kind === "id") return queueId === f.id;
  return queueInfo(queueId).category === f.category;
}

/**
 * Known queue ids (optionally of one category) for SQL `queue_id = any($n)`.
 * Category "other" also contains unknown ids → query it as `not (queue_id = any(<all non-other known>))`.
 */
export function knownQueueIds(category?: QueueCategory): number[] {
  return Object.values(QUEUES as Record<number, QueueInfo>)
    .filter((q) => category === undefined || q.category === category)
    .map((q) => q.id);
}
