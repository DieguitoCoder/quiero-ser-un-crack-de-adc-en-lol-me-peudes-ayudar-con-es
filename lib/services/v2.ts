/**
 * v2 use cases (multi-user). Owner: cobalt. Routes/pages call these with a `Viewer` from lib/auth.
 * When v1 is retired, cobalt moves these into lib/services/index.ts KEEPING names and signatures.
 * Per-user functions return PROFILE_REQUIRED when `viewer.profile?.puuid` is null.
 * The Riot API key is read only here (via getServerEnv) and never placed in a response or log.
 */
import "server-only";
import { createHash } from "node:crypto";
import path from "node:path";
import { aggregate, buildTrend, currentStreak, deriveMetrics, statsByChampion, statsByOpponent } from "@/lib/coach/metrics";
import { GOAL_WINDOW, MIN_GOAL_SAMPLE, evaluateGoals } from "@/lib/coach/goals";
import { summarizeRecent, tipsForMatch } from "@/lib/coach/coach";
import { phaseForTier } from "@/lib/coach/ranks";
import { getAppDb } from "@/lib/db/client";
import {
  RiotIdTakenError,
  consumeRateLimit,
  findSummonerByRiotId,
  getJournalEntry,
  getMatchRecord,
  getSyncState,
  latestRankSnapshot,
  listJournalEntries,
  listMatchRecords,
  listMatchSummaries,
  listRankSnapshots,
  upsertJournalEntry,
  upsertProfile,
  upsertSummoner,
} from "@/lib/db/repos";
import type { Db } from "@/lib/db/types";
import { apiError } from "@/lib/errors";
import {
  type QueueFilter,
  type RankedQueueId,
  isCoachEligible,
  knownQueueIds,
  parseQueueFilter,
} from "@/lib/queues";
import { createHttpRiotClient, type RiotClient } from "@/lib/riot/client";
import { RiotApiError } from "@/lib/riot/errors";
import { createGlobalLimiter } from "@/lib/riot/global-limiter";
import { createFixtureRiotClient } from "@/lib/riot/mock";
import { DEV_KEY_LIMITS, RateLimiter } from "@/lib/riot/rate-limiter";
import { getServerEnv } from "@/lib/server-env";
import { riotErrorToApi, syncBatch } from "@/lib/sync/batch";
import { parseRiotIdInput } from "@/lib/validation";
import type {
  ApiError,
  GoalsResponseV2,
  JournalInput,
  JournalResponse,
  LadderPoint,
  LinkRiotIdResponse,
  MatchDetailResponse,
  MatchListQueryV2,
  MatchListResponseV2,
  PlayerRef,
  PublicPlayerResponse,
  RankSnapshot,
  ServiceResult,
  StatsResponseV2,
  SyncBatchInput,
  SyncBatchResponse,
  Viewer,
} from "@/lib/types";

export const MOCK_FIXTURES_DIR_V2 = path.join(process.cwd(), "lib", "riot", "fixtures");
export const SEARCH_LIMIT_PER_MIN = 10;
export const SEARCH_STALE_MS = 60 * 60_000;

const fail = (error: ApiError): { ok: false; error: ApiError } => ({ ok: false, error });

/* ---------------- infrastructure ---------------- */

/** match-v5/account-v1 regional routing for a platform. */
export function regionForPlatform(platform: string): string {
  const p = platform.toLowerCase();
  if (["na1", "br1", "la1", "la2"].includes(p)) return "americas";
  if (["euw1", "eun1", "tr1", "ru", "me1"].includes(p)) return "europe";
  if (["kr", "jp1"].includes(p)) return "asia";
  return "sea";
}

const globalForRiot = globalThis as unknown as { __climbRiotLimiterV2?: RateLimiter };

/** RIOT_MOCK → fixtures; otherwise HTTP client with the Postgres-backed global limiter. */
function riotFor(db: Db, platform: string): ServiceResult<{ riot: RiotClient; mock: boolean }> {
  const env = getServerEnv();
  if (env.riotMock) return { ok: true, data: { riot: createFixtureRiotClient(MOCK_FIXTURES_DIR_V2), mock: true } };
  if (!env.riotApiKey) return fail(apiError("RIOT_KEY_MISSING", { message: "El servicio de Riot no está configurado." }));
  globalForRiot.__climbRiotLimiterV2 ??= new RateLimiter();
  const riot = createHttpRiotClient({
    apiKey: env.riotApiKey,
    platform,
    region: regionForPlatform(platform),
    limiter: globalForRiot.__climbRiotLimiterV2,
    globalLimiter: createGlobalLimiter(db, DEV_KEY_LIMITS, Date.now),
    retryOn429: false,
  });
  return { ok: true, data: { riot, mock: false } };
}

function playerOf(viewer: Viewer): PlayerRef | null {
  const p = viewer.profile;
  if (!p?.puuid) return null;
  return { puuid: p.puuid, gameName: p.gameName ?? "", tagLine: p.tagLine ?? "", platform: p.platform };
}

const profileRequired = () => fail(apiError("PROFILE_REQUIRED"));

function invalidQueue(): { ok: false; error: ApiError } {
  return fail(apiError("VALIDATION_ERROR", { fields: { queue: "Cola inválida" } }));
}

/** Coach applies only when every queue in the filter is Summoner's Rift (coachEligible). */
export function filterCoachEligible(f: QueueFilter): boolean {
  if (f.kind === "id") return isCoachEligible(f.id);
  if (f.kind === "category") return f.category !== "other" && knownQueueIds(f.category).every(isCoachEligible);
  return false;
}

function ladderQueue(f: QueueFilter): RankedQueueId {
  return f.kind === "id" && f.id === 440 ? 440 : 420;
}

async function ranksOf(db: Db, puuid: string): Promise<{ solo: RankSnapshot | null; flex: RankSnapshot | null }> {
  const [solo, flex] = await Promise.all([latestRankSnapshot(db, puuid, 420), latestRankSnapshot(db, puuid, 440)]);
  return { solo, flex };
}

/* ---------------- sync ---------------- */

export async function runSyncBatch(viewer: Viewer, input: SyncBatchInput): Promise<ServiceResult<SyncBatchResponse>> {
  const player = playerOf(viewer);
  if (!player) return profileRequired();
  const db = await getAppDb();
  const r = riotFor(db, player.platform);
  if (!r.ok) return r;
  return syncBatch({ db, riot: r.data.riot, player, cursor: input.cursor ?? null, mock: r.data.mock, now: Date.now });
}

/* ---------------- matches ---------------- */

export async function listMatchesV2(viewer: Viewer, query: MatchListQueryV2): Promise<ServiceResult<MatchListResponseV2>> {
  const player = playerOf(viewer);
  if (!player) return profileRequired();
  const filter = parseQueueFilter(query.queue);
  if (!filter) return invalidQueue();
  const limit = Math.min(100, Math.max(1, Math.trunc(query.limit)));
  const offset = Math.max(0, Math.trunc(query.offset));
  const db = await getAppDb();
  const page = await listMatchSummaries(db, {
    puuid: player.puuid,
    filter,
    champion: query.champion,
    limit,
    offset,
    userId: viewer.user.id,
  });
  return { ok: true, data: { items: page.items, total: page.total, limit, offset, champions: page.champions } };
}

export async function getMatchDetailV2(viewer: Viewer, matchId: string): Promise<ServiceResult<MatchDetailResponse>> {
  const player = playerOf(viewer);
  if (!player) return profileRequired();
  const db = await getAppDb();
  const record = await getMatchRecord(db, matchId, player.puuid);
  if (!record) return fail(apiError("MATCH_NOT_FOUND"));
  let tips: MatchDetailResponse["tips"] = [];
  if (!record.isRemake && isCoachEligible(record.queueId)) {
    const rank = await latestRankSnapshot(db, player.puuid, record.queueId === 440 ? 440 : 420);
    tips = tipsForMatch(record, phaseForTier(rank?.tier ?? null));
  }
  return {
    ok: true,
    data: {
      match: { ...record, ...deriveMetrics(record) },
      tips,
      journal: await getJournalEntry(db, viewer.user.id, matchId),
    },
  };
}

/* ---------------- journal (scoped to the current user) ---------------- */

export async function getJournalV2(viewer: Viewer, matchId: string): Promise<ServiceResult<JournalResponse>> {
  const player = playerOf(viewer);
  if (!player) return profileRequired();
  const db = await getAppDb();
  if (!(await getMatchRecord(db, matchId, player.puuid))) return fail(apiError("MATCH_NOT_FOUND"));
  return { ok: true, data: { entry: await getJournalEntry(db, viewer.user.id, matchId) } };
}

export async function saveJournalV2(viewer: Viewer, matchId: string, input: JournalInput): Promise<ServiceResult<JournalResponse>> {
  const player = playerOf(viewer);
  if (!player) return profileRequired();
  const db = await getAppDb();
  // Only matches the viewer actually played can carry a journal entry.
  if (!(await getMatchRecord(db, matchId, player.puuid))) return fail(apiError("MATCH_NOT_FOUND"));
  return { ok: true, data: { entry: await upsertJournalEntry(db, viewer.user.id, matchId, input, Date.now()) } };
}

/* ---------------- stats & goals ---------------- */

/** `queue` raw query string (default "420"). */
export async function getStatsV2(viewer: Viewer, queue: string | null): Promise<ServiceResult<StatsResponseV2>> {
  const player = playerOf(viewer);
  if (!player) return profileRequired();
  const raw = queue == null || queue === "" ? "420" : queue;
  const filter = parseQueueFilter(raw);
  if (!filter) return invalidQueue();
  const db = await getAppDb();

  const rank = await ranksOf(db, player.puuid);
  const lq = ladderQueue(filter);
  const phase = phaseForTier((lq === 440 ? rank.flex : rank.solo)?.tier ?? null);
  const chronological = (await listMatchRecords(db, player.puuid, filter)).filter((r) => !r.isRemake);
  const played = [...chronological].reverse(); // newest first
  const recentGames = played.slice(0, 10);

  const ladder: LadderPoint[] = (await listRankSnapshots(db, player.puuid, lq)).flatMap((s) =>
    s.tier !== null && s.division !== null && s.ladderScore !== null
      ? [{ takenAt: s.takenAt, tier: s.tier, division: s.division, lp: s.lp, ladderScore: s.ladderScore }]
      : [],
  );

  let coach: StatsResponseV2["coach"] = null;
  if (filterCoachEligible(filter)) {
    const journal = await listJournalEntries(db, viewer.user.id, recentGames.map((g) => g.matchId));
    coach = summarizeRecent(played, journal, phase);
  }

  return {
    ok: true,
    data: {
      player,
      queue: raw,
      rank,
      ladder,
      totals: aggregate(played),
      recent: aggregate(recentGames),
      streak: currentStreak(played),
      trend: buildTrend(chronological),
      byChampion: statsByChampion(played),
      byOpponent: statsByOpponent(played),
      coach,
    },
  };
}

export async function getGoalsV2(viewer: Viewer, queue: string | null): Promise<ServiceResult<GoalsResponseV2>> {
  const player = playerOf(viewer);
  if (!player) return profileRequired();
  const raw = queue == null || queue === "" ? "420" : queue;
  const filter = parseQueueFilter(raw);
  if (!filter || filter.kind !== "id" || !isCoachEligible(filter.id)) {
    return fail(apiError("VALIDATION_ERROR", { fields: { queue: "Los objetivos solo están disponibles en la Grieta del Invocador." } }));
  }
  const db = await getAppDb();
  const rank = await latestRankSnapshot(db, player.puuid, filter.id === 440 ? 440 : 420);
  const phase = phaseForTier(rank?.tier ?? null);
  const played = (await listMatchRecords(db, player.puuid, filter)).filter((r) => !r.isRemake).reverse();
  return {
    ok: true,
    data: {
      queue: raw,
      phase,
      rank,
      sampleSize: Math.min(played.length, GOAL_WINDOW),
      windowSize: GOAL_WINDOW,
      minSample: MIN_GOAL_SAMPLE,
      goals: evaluateGoals(phase, played),
    },
  };
}

/* ---------------- Riot ID resolution ---------------- */

async function resolveRiotId(db: Db, riotId: string, platform: string): Promise<ServiceResult<PlayerRef>> {
  const parsed = parseRiotIdInput(riotId);
  if (!parsed) return fail(apiError("VALIDATION_ERROR", { fields: { riotId: "Usa el formato Nombre#TAG." } }));
  const cached = await findSummonerByRiotId(db, parsed.gameName, parsed.tagLine);
  if (cached) return { ok: true, data: { puuid: cached.puuid, gameName: cached.gameName, tagLine: cached.tagLine, platform: cached.platform } };
  const r = riotFor(db, platform);
  if (!r.ok) return r;
  try {
    const acc = await r.data.riot.getAccountByRiotId(parsed.gameName, parsed.tagLine);
    const player: PlayerRef = {
      puuid: acc.puuid,
      gameName: acc.gameName ?? parsed.gameName,
      tagLine: acc.tagLine ?? parsed.tagLine,
      platform,
    };
    await upsertSummoner(db, { ...player, now: Date.now() });
    return { ok: true, data: player };
  } catch (err) {
    if (err instanceof RiotApiError) return fail(riotErrorToApi(err));
    throw err;
  }
}

/** Resolves "Name#TAG" via account-v1 (cache: summoners) and links it verified=false. Used by forge's PUT /api/me/riot-id. */
export async function linkRiotId(viewer: Viewer, riotId: string): Promise<ServiceResult<LinkRiotIdResponse>> {
  const db = await getAppDb();
  const platform = viewer.profile?.platform ?? getServerEnv().riotPlatform;
  const resolved = await resolveRiotId(db, riotId, platform);
  if (!resolved.ok) return resolved;
  try {
    const profile = await upsertProfile(db, {
      userId: viewer.user.id,
      puuid: resolved.data.puuid,
      gameName: resolved.data.gameName,
      tagLine: resolved.data.tagLine,
      platform: resolved.data.platform,
      verified: false,
      now: Date.now(),
    });
    return { ok: true, data: { profile } };
  } catch (err) {
    if (err instanceof RiotIdTakenError) return fail(apiError("RIOT_ID_TAKEN"));
    throw err;
  }
}

/* ---------------- public search ---------------- */

export function hashIp(ip: string): string {
  return createHash("sha256").update(`climb-search:${ip}`).digest("hex");
}

/**
 * Public read-only lookup. `clientIp` is hashed (sha256) for the rate-limit key: 10 req/min/IP.
 * Triggers at most one sync batch when the puuid was never synced or lastSyncAt is older than 1 h.
 */
export async function searchPlayer(riotId: string, clientIp: string): Promise<ServiceResult<PublicPlayerResponse>> {
  const db = await getAppDb();
  const now = Date.now();
  const rl = await consumeRateLimit(db, `search:${hashIp(clientIp)}`, SEARCH_LIMIT_PER_MIN, 60_000, now);
  if (!rl.allowed) return fail(apiError("RATE_LIMITED", { retryAfterS: Math.max(1, Math.ceil((rl.resetAt - now) / 1000)) }));

  const resolved = await resolveRiotId(db, riotId, getServerEnv().riotPlatform);
  if (!resolved.ok) return resolved;
  const player = resolved.data;

  let state = await getSyncState(db, player.puuid);
  if (!state?.lastSyncAt || now - state.lastSyncAt > SEARCH_STALE_MS) {
    const r = riotFor(db, player.platform);
    if (r.ok) {
      // one batch only (never a full backfill); failures fall back to whatever is stored
      await syncBatch({ db, riot: r.data.riot, player, cursor: null, mock: r.data.mock, now: Date.now });
      state = await getSyncState(db, player.puuid);
    }
  }

  const all: QueueFilter = { kind: "all" };
  const page = await listMatchSummaries(db, { puuid: player.puuid, filter: all, limit: 20, offset: 0 });
  return {
    ok: true,
    data: { player, rank: await ranksOf(db, player.puuid), recent: page.items, lastSyncAt: state?.lastSyncAt ?? null },
  };
}
