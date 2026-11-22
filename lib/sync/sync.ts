/**
 * Incremental sync use case. Owner: cobalt. See docs/ARCHITECTURE.md §6.
 */
import type { Db } from "@/lib/db/connection";
import { countMatches, existingMatchIds, insertMatch } from "@/lib/db/repositories/matches";
import { insertSnapshotIfChanged } from "@/lib/db/repositories/rank-snapshots";
import { deleteSetting, setSetting } from "@/lib/db/repositories/settings";
import { upsertSummoner } from "@/lib/db/repositories/summoner";
import { apiError } from "@/lib/errors";
import type { RiotClient } from "@/lib/riot/client";
import { RiotApiError } from "@/lib/riot/errors";
import { mapMatch, soloQueueEntry } from "@/lib/riot/mappers";
import { SOLO_QUEUE_ID, type ApiError, type ServiceResult, type SyncResponse } from "@/lib/types";

export const SYNC_LOOKBACK_IDS = 200;
export const SYNC_MAX_NEW_MATCHES = 40;
export const SYNC_PAGE_SIZE = 100;
export const SYNC_TIME_BUDGET_MS = 90_000;

export interface SyncDeps {
  db: Db;
  riot: RiotClient;
  gameName: string;
  tagLine: string;
  platform: string;
  mock: boolean;
  now: () => number;
}

/** Module-level single-flight lock. */
let inFlight: Promise<ServiceResult<SyncResponse>> | null = null;

export async function syncPlayer(deps: SyncDeps): Promise<ServiceResult<SyncResponse>> {
  if (inFlight) return { ok: false, error: apiError("SYNC_IN_PROGRESS") };
  const run = doSync(deps);
  inFlight = run;
  try {
    return await run;
  } finally {
    inFlight = null;
  }
}

/** Maps a Riot client failure to the public error contract (ARCHITECTURE §6). Never includes the key. */
export function riotErrorToApiError(err: unknown, stage: "account" | "other"): ApiError {
  if (!(err instanceof RiotApiError)) return apiError("INTERNAL_ERROR");
  switch (err.kind) {
    case "unauthorized":
      return apiError("RIOT_KEY_INVALID");
    case "not_found":
      return stage === "account" ? apiError("SUMMONER_NOT_FOUND") : apiError("RIOT_UNAVAILABLE");
    case "rate_limited":
      return apiError("RIOT_RATE_LIMITED", err.retryAfterS !== undefined ? { retryAfterS: err.retryAfterS } : undefined);
    case "unavailable":
    case "bad_response":
      return apiError("RIOT_UNAVAILABLE");
  }
}

async function doSync(deps: SyncDeps): Promise<ServiceResult<SyncResponse>> {
  const { db, riot, now } = deps;
  const startedAt = now();
  let stage: "account" | "other" = "account";

  try {
    // 3. Resolve account.
    const account = await riot.getAccountByRiotId(deps.gameName, deps.tagLine);
    stage = "other";
    const puuid = account.puuid;
    upsertSummoner(db, {
      puuid,
      gameName: account.gameName ?? deps.gameName,
      tagLine: account.tagLine ?? deps.tagLine,
      platform: deps.platform,
      updatedAt: startedAt,
    });
    setSetting(db, "tracked_puuid", puuid, startedAt);

    // 4. Candidate ids (newest first), stop early once a whole page is already stored.
    const candidates: string[] = [];
    for (let start = 0; start < SYNC_LOOKBACK_IDS; start += SYNC_PAGE_SIZE) {
      const count = Math.min(SYNC_PAGE_SIZE, SYNC_LOOKBACK_IDS - start);
      const page = await riot.getMatchIds(puuid, { queue: SOLO_QUEUE_ID, start, count });
      candidates.push(...page);
      if (page.length < count) break;
      if (existingMatchIds(db, page).size === page.length) break;
    }

    // 5. Missing ids, capped per run.
    const unique = [...new Set(candidates)];
    const stored = existingMatchIds(db, unique);
    const missing = unique.filter((id) => !stored.has(id));

    let processed = 0;
    let newMatches = 0;
    let timeBudgetHit = false;
    for (const matchId of missing.slice(0, SYNC_MAX_NEW_MATCHES)) {
      if (now() - startedAt > SYNC_TIME_BUDGET_MS) {
        timeBudgetHit = true;
        break;
      }
      processed++;
      let dto;
      try {
        dto = await riot.getMatch(matchId);
      } catch (err) {
        if (err instanceof RiotApiError && err.kind === "not_found") continue; // skip vanished match
        throw err;
      }
      const record = mapMatch(dto, puuid);
      if (!record || record.queueId !== SOLO_QUEUE_ID) continue;
      if (insertMatch(db, record, JSON.stringify(dto))) newMatches++;
    }

    // 7. Rank snapshot.
    const entries = await riot.getLeagueEntries(puuid);
    const solo = soloQueueEntry(entries);
    const { snapshot, created } = insertSnapshotIfChanged(db, {
      puuid,
      takenAt: now(),
      tier: solo?.tier ?? null,
      division: solo?.division ?? null,
      lp: solo?.lp ?? 0,
      wins: solo?.wins ?? 0,
      losses: solo?.losses ?? 0,
    });

    // 8. Success bookkeeping.
    const syncedAt = now();
    setSetting(db, "last_sync_at", String(syncedAt), syncedAt);
    deleteSetting(db, "last_sync_error_code");

    return {
      ok: true,
      data: {
        newMatches,
        totalMatches: countMatches(db, puuid),
        hasMore: timeBudgetHit || missing.length > processed,
        rank: snapshot,
        snapshotCreated: created,
        syncedAt,
        durationMs: syncedAt - startedAt,
        mock: deps.mock,
      },
    };
  } catch (err) {
    const error = riotErrorToApiError(err, stage);
    if (!(err instanceof RiotApiError)) {
      console.error("[sync] unexpected error:", err instanceof Error ? err.message : "unknown");
    }
    try {
      setSetting(db, "last_sync_error_code", error.code, now());
    } catch {
      // DB unavailable: nothing else to record.
    }
    return { ok: false, error };
  }
}
