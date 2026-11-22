/**
 * v2 resumable batched sync (Vercel-safe). Owner: cobalt. Replaces lib/sync/sync.ts (v1).
 *
 * One call = one batch:
 *   1. cooldown check (skip when `cursor` continues an unfinished chain) → SYNC_COOLDOWN + retryAfterS
 *   2. acquireSyncLease(puuid, now, SYNC_LEASE_MS) → null ⇒ SYNC_IN_PROGRESS
 *   3. if pending empty: discover ids (all queues, newest first) and/or advance backfill_start
 *   4. fetch + insertMatch ≤ SYNC_BATCH_SIZE pending ids within SYNC_TIME_BUDGET_MS
 *   5. on the last batch of a chain: league entries → rank snapshots 420/440, cooldownUntil = now + SYNC_COOLDOWN_MS
 *   6. releaseSyncLease with the new state (always, also on error with lastErrorCode)
 *
 * Shared match cache (ADR-012): ids already in `matches` (stored by any player) are never fetched again.
 */
import {
  acquireSyncLease,
  countMatches,
  existingMatchIds,
  getSyncState,
  insertMatch,
  insertRankSnapshotIfChanged,
  latestRankSnapshot,
  releaseSyncLease,
} from "@/lib/db/repos";
import type { Db } from "@/lib/db/types";
import { apiError } from "@/lib/errors";
import { RANKED_QUEUE_IDS, RANKED_QUEUE_TYPE } from "@/lib/queues";
import type { RiotClient } from "@/lib/riot/client";
import { RiotApiError } from "@/lib/riot/errors";
import { mapMatchWrite, rankedEntry } from "@/lib/riot/mappers";
import type { ApiError, PlayerRef, RankSnapshot, ServiceResult, SyncBatchResponse, SyncState } from "@/lib/types";

export const SYNC_BATCH_SIZE = 15;
export const SYNC_COOLDOWN_MS = 2 * 60_000;
/** Vercel Hobby default max duration is 10 s for older configs; set `maxDuration` on the route and stay under it. */
export const SYNC_TIME_BUDGET_MS = 8_000;
export const SYNC_LEASE_MS = 30_000;
/** Max history depth per puuid (match-v5 ids). */
export const SYNC_MAX_HISTORY = 300;
/** match-v5 ids page size (max 100). */
export const SYNC_IDS_PAGE = 100;

export interface SyncBatchDeps {
  db: Db;
  riot: RiotClient;
  player: PlayerRef;
  cursor: string | null;
  mock: boolean;
  now: () => number;
  /** test overrides */
  batchSize?: number;
  timeBudgetMs?: number;
}

/* ---------------- cursor (opaque, bound to the puuid) ---------------- */

export function encodeCursor(puuid: string, chainStartedAt: number): string {
  return Buffer.from(JSON.stringify({ p: puuid, c: chainStartedAt }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { puuid: string; chainStartedAt: number } | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof v !== "object" || v === null) return null;
    const { p, c } = v as Record<string, unknown>;
    return typeof p === "string" && typeof c === "number" && Number.isFinite(c) ? { puuid: p, chainStartedAt: c } : null;
  } catch {
    return null;
  }
}

function chainUnfinished(s: SyncState | null): boolean {
  return s !== null && (s.pendingMatchIds.length > 0 || s.backfillStart !== null);
}

export function riotErrorToApi(err: RiotApiError): ApiError {
  switch (err.kind) {
    case "unauthorized":
      return apiError("RIOT_KEY_INVALID");
    case "rate_limited":
      return apiError("RIOT_RATE_LIMITED", { retryAfterS: err.retryAfterS ?? 1 });
    case "not_found":
      return apiError("SUMMONER_NOT_FOUND");
    default:
      return apiError("RIOT_UNAVAILABLE");
  }
}

async function currentRanks(db: Db, puuid: string): Promise<SyncBatchResponse["rank"]> {
  const [solo, flex] = await Promise.all([latestRankSnapshot(db, puuid, 420), latestRankSnapshot(db, puuid, 440)]);
  return { solo, flex };
}

/** league-v4 → one snapshot per ranked queue (inserted only when changed). */
async function snapshotRanks(deps: SyncBatchDeps, takenAt: number): Promise<{ rank: SyncBatchResponse["rank"]; created: boolean }> {
  const entries = await deps.riot.getLeagueEntries(deps.player.puuid);
  const out: { solo: RankSnapshot | null; flex: RankSnapshot | null } = { solo: null, flex: null };
  let created = false;
  for (const queueId of RANKED_QUEUE_IDS) {
    const queueType = RANKED_QUEUE_TYPE[queueId];
    const e = rankedEntry(entries, queueType);
    const r = await insertRankSnapshotIfChanged(deps.db, {
      puuid: deps.player.puuid,
      queueId,
      queueType,
      takenAt,
      tier: e?.tier ?? null,
      division: e?.division ?? null,
      lp: e?.lp ?? 0,
      wins: e?.wins ?? 0,
      losses: e?.losses ?? 0,
    });
    created ||= r.created;
    if (queueId === 420) out.solo = r.snapshot;
    else out.flex = r.snapshot;
  }
  return { rank: out, created };
}

export async function syncBatch(deps: SyncBatchDeps): Promise<ServiceResult<SyncBatchResponse>> {
  const { db, riot, player, now } = deps;
  const startedAt = now();
  const batchSize = deps.batchSize ?? SYNC_BATCH_SIZE;
  const budgetMs = deps.timeBudgetMs ?? SYNC_TIME_BUDGET_MS;
  const puuid = player.puuid;

  // 1. cooldown (only applies once a chain has finished; a cursor for THIS puuid continues the chain)
  const before = await getSyncState(db, puuid);
  const decoded = deps.cursor ? decodeCursor(deps.cursor) : null;
  const continuing = decoded !== null && decoded.puuid === puuid && chainUnfinished(before);
  if (!chainUnfinished(before) && before && before.cooldownUntil > startedAt) {
    const retryAfterS = Math.max(1, Math.ceil((before.cooldownUntil - startedAt) / 1000));
    return { ok: false, error: apiError("SYNC_COOLDOWN", { retryAfterS }) };
  }

  // 2. lease
  const state = await acquireSyncLease(db, puuid, startedAt, SYNC_LEASE_MS);
  if (!state) return { ok: false, error: apiError("SYNC_IN_PROGRESS") };

  const chainStartedAt = continuing && decoded ? decoded.chainStartedAt : startedAt;
  let pending = [...state.pendingMatchIds];
  let backfillStart = state.backfillStart;
  let newMatches = 0;

  try {
    // 3. discovery: one ids page per batch (all queues, newest first)
    if (pending.length === 0) {
      const start = backfillStart ?? 0;
      const ids = await riot.getMatchIds(puuid, { start, count: SYNC_IDS_PAGE });
      const stored = await existingMatchIds(db, ids);
      pending = ids.filter((id) => !stored.has(id));
      if (backfillStart !== null) {
        const next = start + SYNC_IDS_PAGE;
        backfillStart = ids.length < SYNC_IDS_PAGE || next >= SYNC_MAX_HISTORY ? null : next;
      }
    }

    // 4. fetch missing matches (shared cache: skip ids stored meanwhile by another player)
    const stored = await existingMatchIds(db, pending.slice(0, batchSize));
    let processed = 0;
    let rateLimited: RiotApiError | null = null;
    while (pending.length > 0 && processed < batchSize && now() - startedAt < budgetMs) {
      const matchId = pending[0] as string;
      if (!stored.has(matchId)) {
        try {
          const dto = await riot.getMatch(matchId);
          if (await insertMatch(db, mapMatchWrite(dto, player.platform), now())) newMatches++;
        } catch (err) {
          if (err instanceof RiotApiError && err.kind === "rate_limited") {
            rateLimited = err;
            break;
          }
          // not_found: the match is gone on Riot's side, drop it; anything else aborts the batch
          if (!(err instanceof RiotApiError && err.kind === "not_found")) throw err;
        }
      }
      pending.shift();
      processed++;
    }

    if (rateLimited && processed === 0) {
      const error = riotErrorToApi(rateLimited);
      await releaseSyncLease(db, puuid, { pendingMatchIds: pending, backfillStart, lastErrorCode: error.code }, now());
      return { ok: false, error };
    }

    const hasMore = pending.length > 0 || backfillStart !== null;

    // 5. end of chain → ranks + cooldown
    let rank: SyncBatchResponse["rank"];
    let snapshotCreated = false;
    let cooldownUntil = state.cooldownUntil;
    let lastSyncAt = state.lastSyncAt;
    if (hasMore) {
      rank = await currentRanks(db, puuid);
    } else {
      const end = now();
      const snap = await snapshotRanks(deps, end);
      rank = snap.rank;
      snapshotCreated = snap.created;
      cooldownUntil = end + SYNC_COOLDOWN_MS;
      lastSyncAt = end;
    }

    // 6. persist + release
    await releaseSyncLease(db, puuid, { pendingMatchIds: pending, backfillStart, cooldownUntil, lastSyncAt, lastErrorCode: null }, now());

    const syncedAt = now();
    return {
      ok: true,
      data: {
        newMatches,
        remaining: pending.length,
        cursor: hasMore ? encodeCursor(puuid, chainStartedAt) : null,
        hasMore,
        cooldownUntil,
        totalMatches: await countMatches(db, puuid),
        rank,
        snapshotCreated,
        syncedAt,
        durationMs: syncedAt - startedAt,
        mock: deps.mock,
      },
    };
  } catch (err) {
    const error = err instanceof RiotApiError ? riotErrorToApi(err) : apiError("INTERNAL_ERROR");
    if (!(err instanceof RiotApiError)) console.error("[sync] batch failed:", err instanceof Error ? err.message : "unknown");
    try {
      await releaseSyncLease(db, puuid, { pendingMatchIds: pending, backfillStart, lastErrorCode: error.code }, now());
    } catch {
      // the lease expires on its own after SYNC_LEASE_MS
    }
    return { ok: false, error };
  }
}
