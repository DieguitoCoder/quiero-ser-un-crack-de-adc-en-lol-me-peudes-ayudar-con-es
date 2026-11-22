/**
 * Application use cases. Owner: cobalt.
 * Consumed by BOTH app/api/** route handlers and Server Components (nova) — pages must not fetch their own API.
 * Each function returns the exact HTTP response DTO from lib/types.ts wrapped in ServiceResult.
 */
import "server-only";
import path from "node:path";
import { buildTrend, aggregate, currentStreak, deriveMetrics, statsByChampion, statsByOpponent } from "@/lib/coach/metrics";
import { GOAL_WINDOW, MIN_GOAL_SAMPLE, evaluateGoals } from "@/lib/coach/goals";
import { SUMMARY_WINDOW, summarizeRecent, tipsForMatch } from "@/lib/coach/coach";
import { phaseForTier } from "@/lib/coach/ranks";
import { getDb, type Db } from "@/lib/db/connection";
import {
  countMatches,
  getMatchRecord,
  listAllPlayedRecords,
  listChampions,
  listMatchRecords,
} from "@/lib/db/repositories/matches";
import { getJournalEntry, journalMatchIds, listJournalEntries, upsertJournalEntry } from "@/lib/db/repositories/journal";
import { latestSnapshot, listSnapshots } from "@/lib/db/repositories/rank-snapshots";
import { getSetting, setSetting } from "@/lib/db/repositories/settings";
import { getSummonerByPuuid } from "@/lib/db/repositories/summoner";
import { getConfig } from "@/lib/env";
import { apiError } from "@/lib/errors";
import { createHttpRiotClient, type RiotClient } from "@/lib/riot/client";
import { createFixtureRiotClient } from "@/lib/riot/mock";
import { RateLimiter } from "@/lib/riot/rate-limiter";
import { syncPlayer } from "@/lib/sync/sync";
import type {
  ApiErrorCode,
  GoalsResponse,
  JournalInput,
  JournalResponse,
  LadderPoint,
  MatchDetailResponse,
  MatchListQuery,
  MatchListResponse,
  MatchSummary,
  ServiceResult,
  StatsResponse,
  StatusResponse,
  SyncResponse,
} from "@/lib/types";

const API_ERROR_CODES: readonly ApiErrorCode[] = [
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "MATCH_NOT_FOUND",
  "SUMMONER_NOT_FOUND",
  "SYNC_IN_PROGRESS",
  "RIOT_KEY_MISSING",
  "RIOT_KEY_INVALID",
  "RIOT_RATE_LIMITED",
  "RIOT_UNAVAILABLE",
  "INTERNAL_ERROR",
];

/** One limiter per process, shared by both hosts (ARCHITECTURE §7). */
const globalForRiot = globalThis as unknown as { __climbRiotLimiter?: RateLimiter };
function sharedLimiter(): RateLimiter {
  globalForRiot.__climbRiotLimiter ??= new RateLimiter();
  return globalForRiot.__climbRiotLimiter;
}

export const MOCK_FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "riot");

function trackedPuuid(db: Db): string | null {
  return getSetting(db, "tracked_puuid");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */

export async function getStatus(): Promise<StatusResponse> {
  const cfg = getConfig();
  let lastSyncAt: number | null = null;
  let lastSyncErrorCode: ApiErrorCode | null = null;
  let matchCount = 0;
  let summonerResolved = false;
  try {
    const db = getDb();
    const puuid = trackedPuuid(db);
    const last = Number(getSetting(db, "last_sync_at"));
    lastSyncAt = Number.isFinite(last) && last > 0 ? last : null;
    const code = getSetting(db, "last_sync_error_code");
    lastSyncErrorCode = code && (API_ERROR_CODES as readonly string[]).includes(code) ? (code as ApiErrorCode) : null;
    if (puuid) {
      summonerResolved = getSummonerByPuuid(db, puuid) !== null;
      matchCount = countMatches(db, puuid);
    }
  } catch (err) {
    console.error("[status] db error:", err instanceof Error ? err.message : "unknown");
  }
  return {
    riotId: cfg.riotId,
    platform: cfg.platform,
    region: cfg.region,
    apiKeyConfigured: cfg.riotApiKey !== null,
    mockMode: cfg.mock,
    lastSyncAt,
    lastSyncErrorCode,
    matchCount,
    summonerResolved,
  };
}

export async function runSync(): Promise<ServiceResult<SyncResponse>> {
  const cfg = getConfig();
  if (!cfg.mock && !cfg.riotApiKey) {
    const error = apiError("RIOT_KEY_MISSING");
    try {
      setSetting(getDb(), "last_sync_error_code", error.code, Date.now());
    } catch {
      // ignore: status falls back to null
    }
    return { ok: false, error };
  }
  const riot: RiotClient = cfg.mock
    ? createFixtureRiotClient(MOCK_FIXTURES_DIR)
    : createHttpRiotClient({
        apiKey: cfg.riotApiKey ?? "",
        platform: cfg.platform,
        region: cfg.region,
        limiter: sharedLimiter(),
      });
  return syncPlayer({
    db: getDb(),
    riot,
    gameName: cfg.gameName,
    tagLine: cfg.tagLine,
    platform: cfg.platform,
    mock: cfg.mock,
    now: () => Date.now(),
  });
}

export async function listMatches(query: MatchListQuery): Promise<ServiceResult<MatchListResponse>> {
  const db = getDb();
  const puuid = trackedPuuid(db);
  const limit = Math.min(100, Math.max(1, Math.trunc(query.limit)));
  const offset = Math.max(0, Math.trunc(query.offset));
  if (!puuid) return { ok: true, data: { items: [], total: 0, limit, offset, champions: [] } };

  const records = listMatchRecords(db, puuid, { champion: query.champion, limit, offset });
  const withJournal = journalMatchIds(
    db,
    records.map((r) => r.matchId),
  );
  const items: MatchSummary[] = records.map((r) => {
    const minutes = r.gameDurationS / 60;
    return {
      matchId: r.matchId,
      gameCreation: r.gameCreation,
      gameDurationS: r.gameDurationS,
      patch: r.patch,
      isRemake: r.isRemake,
      championId: r.championId,
      championName: r.championName,
      win: r.win,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
      kda: round2((r.kills + r.assists) / Math.max(1, r.deaths)),
      csTotal: r.csTotal,
      csPerMin: minutes > 0 ? round2(r.csTotal / minutes) : 0,
      opponentChampionName: r.opponentChampionName,
      hasJournal: withJournal.has(r.matchId),
    };
  });
  return {
    ok: true,
    data: {
      items,
      total: countMatches(db, puuid, query.champion),
      limit,
      offset,
      champions: listChampions(db, puuid),
    },
  };
}

export async function getMatchDetail(matchId: string): Promise<ServiceResult<MatchDetailResponse>> {
  const db = getDb();
  const puuid = trackedPuuid(db);
  const record = puuid ? getMatchRecord(db, puuid, matchId) : null;
  if (!puuid || !record) return { ok: false, error: apiError("MATCH_NOT_FOUND") };
  const phase = phaseForTier(latestSnapshot(db, puuid)?.tier ?? null);
  return {
    ok: true,
    data: {
      match: { ...record, ...deriveMetrics(record) },
      tips: record.isRemake ? [] : tipsForMatch(record, phase),
      journal: getJournalEntry(db, matchId),
    },
  };
}

function matchExists(db: Db, matchId: string): boolean {
  return db.prepare("SELECT 1 FROM matches WHERE match_id = ?").get(matchId) !== undefined;
}

export async function getJournal(matchId: string): Promise<ServiceResult<JournalResponse>> {
  const db = getDb();
  if (!matchExists(db, matchId)) return { ok: false, error: apiError("MATCH_NOT_FOUND") };
  return { ok: true, data: { entry: getJournalEntry(db, matchId) } };
}

export async function saveJournal(matchId: string, input: JournalInput): Promise<ServiceResult<JournalResponse>> {
  const db = getDb();
  if (!matchExists(db, matchId)) return { ok: false, error: apiError("MATCH_NOT_FOUND") };
  return { ok: true, data: { entry: upsertJournalEntry(db, matchId, input, Date.now()) } };
}

export async function getStats(): Promise<ServiceResult<StatsResponse>> {
  const db = getDb();
  const puuid = trackedPuuid(db);
  const summoner = puuid ? getSummonerByPuuid(db, puuid) : null;
  const rank = puuid ? latestSnapshot(db, puuid) : null;
  const phase = phaseForTier(rank?.tier ?? null);
  const played = puuid ? listAllPlayedRecords(db, puuid) : []; // newest first, no remakes
  const chronological = [...played].reverse();
  const recentGames = played.slice(0, SUMMARY_WINDOW);
  const journal = listJournalEntries(
    db,
    recentGames.map((g) => g.matchId),
  );

  const ladder: LadderPoint[] = (puuid ? listSnapshots(db, puuid) : []).flatMap((s) =>
    s.tier !== null && s.division !== null && s.ladderScore !== null
      ? [{ takenAt: s.takenAt, tier: s.tier, division: s.division, lp: s.lp, ladderScore: s.ladderScore }]
      : [],
  );

  return {
    ok: true,
    data: {
      summoner,
      rank,
      ladder,
      totals: aggregate(played),
      recent: aggregate(recentGames),
      streak: currentStreak(played),
      trend: buildTrend(chronological),
      byChampion: statsByChampion(played),
      byOpponent: statsByOpponent(played),
      coach: summarizeRecent(played, journal, phase),
    },
  };
}

export async function getGoals(): Promise<ServiceResult<GoalsResponse>> {
  const db = getDb();
  const puuid = trackedPuuid(db);
  const rank = puuid ? latestSnapshot(db, puuid) : null;
  const phase = phaseForTier(rank?.tier ?? null);
  const played = puuid ? listAllPlayedRecords(db, puuid) : [];
  const window = played.slice(0, GOAL_WINDOW);
  return {
    ok: true,
    data: {
      phase,
      rank,
      sampleSize: window.length,
      windowSize: GOAL_WINDOW,
      minSample: MIN_GOAL_SAMPLE,
      goals: evaluateGoals(phase, played),
    },
  };
}
