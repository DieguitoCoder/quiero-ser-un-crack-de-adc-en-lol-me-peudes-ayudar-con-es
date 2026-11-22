/**
 * v2 repositories (Postgres via `Db`). Owner: quartz.
 * Rules: every function takes `db: Db` first (or a tx), returns domain types (camelCase),
 * per-user functions take `userId` and MUST scope by it (RLS is deny-all; the server is the guard).
 * Parameterized SQL only. Signatures are a contract for cobalt/forge; change only via orion.
 */
import type {
  AggregateStats,
  ApiErrorCode,
  Division,
  JournalEntry,
  JournalEntryPgRow,
  JournalInput,
  MatchParticipantPgRow,
  MatchPgRow,
  MatchRecord,
  MatchSummaryV2,
  Profile,
  ProfilePgRow,
  RankSnapshot,
  RankSnapshotPgRow,
  SyncState,
  SyncStatePgRow,
  TeamId,
  TeamPosition,
  Tier,
  TiltLevel,
} from "@/lib/types";
import { RANKED_QUEUE_TYPE, knownQueueIds, queueInfo, type QueueFilter, type RankedQueueId } from "@/lib/queues";
import type { Db, SqlParam } from "@/lib/db/types";
import { aggregate } from "@/lib/coach/metrics";
import { ladderScore } from "@/lib/coach/ranks";

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION;
}

/** Appends a queue filter on `alias.queue_id`; pushes its param onto `params`. */
function queueClause(filter: QueueFilter | undefined, params: SqlParam[], alias = "mp"): string {
  if (!filter || filter.kind === "all") return "";
  if (filter.kind === "id") {
    params.push(filter.id);
    return ` and ${alias}.queue_id = $${params.length}`;
  }
  if (filter.category === "other") {
    params.push(knownQueueIds().filter((id) => queueInfo(id).category !== "other"));
    return ` and not (${alias}.queue_id = any($${params.length}::int[]))`;
  }
  params.push(knownQueueIds(filter.category));
  return ` and ${alias}.queue_id = any($${params.length}::int[])`;
}

/* ---------------- profiles ---------------- */

function toProfile(r: ProfilePgRow): Profile {
  return {
    userId: r.user_id,
    puuid: r.puuid,
    gameName: r.game_name,
    tagLine: r.tag_line,
    platform: r.platform,
    verified: r.verified,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const r = await db.query<ProfilePgRow>("select * from profiles where user_id = $1", [userId]);
  return r.rows[0] ? toProfile(r.rows[0]) : null;
}

/** Upsert the linked Riot account. Throws `RiotIdTakenError` when verified=true conflicts with another user. */
export async function upsertProfile(
  db: Db,
  input: { userId: string; puuid: string; gameName: string; tagLine: string; platform: string; verified: boolean; now: number },
): Promise<Profile> {
  if (input.verified) {
    const owner = await findUserIdByVerifiedPuuid(db, input.puuid);
    if (owner && owner !== input.userId) throw new RiotIdTakenError("Riot account already verified by another user");
  }
  try {
    const r = await db.query<ProfilePgRow>(
      `insert into profiles (user_id, puuid, game_name, tag_line, platform, verified, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       on conflict (user_id) do update set puuid = excluded.puuid, game_name = excluded.game_name,
         tag_line = excluded.tag_line, platform = excluded.platform, verified = excluded.verified,
         updated_at = excluded.updated_at
       returning *`,
      [input.userId, input.puuid, input.gameName, input.tagLine, input.platform, input.verified, input.now],
    );
    const row = r.rows[0];
    if (!row) throw new Error("upsertProfile returned no row");
    return toProfile(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new RiotIdTakenError("Riot account already verified by another user");
    throw err;
  }
}

/** RSO login: the user that owns a VERIFIED puuid, if any. */
export async function findUserIdByVerifiedPuuid(db: Db, puuid: string): Promise<string | null> {
  const r = await db.query<{ user_id: string }>("select user_id from profiles where puuid = $1 and verified", [puuid]);
  return r.rows[0]?.user_id ?? null;
}

export class RiotIdTakenError extends Error {
  override name = "RiotIdTakenError";
}

/* ---------------- summoners (cache) ---------------- */

export async function upsertSummoner(
  db: Db,
  s: { puuid: string; gameName: string; tagLine: string; platform: string; now: number },
): Promise<void> {
  await db.query(
    `insert into summoners (puuid, game_name, tag_line, platform, updated_at) values ($1, $2, $3, $4, $5)
     on conflict (puuid) do update set game_name = excluded.game_name, tag_line = excluded.tag_line,
       platform = excluded.platform, updated_at = excluded.updated_at`,
    [s.puuid, s.gameName, s.tagLine, s.platform, s.now],
  );
}

export async function findSummonerByRiotId(
  db: Db,
  gameName: string,
  tagLine: string,
): Promise<{ puuid: string; gameName: string; tagLine: string; platform: string; updatedAt: number } | null> {
  const r = await db.query<{ puuid: string; game_name: string; tag_line: string; platform: string; updated_at: number }>(
    `select puuid, game_name, tag_line, platform, updated_at from summoners
     where lower(game_name) = lower($1) and lower(tag_line) = lower($2)
     order by updated_at desc limit 1`,
    [gameName, tagLine],
  );
  const s = r.rows[0];
  return s ? { puuid: s.puuid, gameName: s.game_name, tagLine: s.tag_line, platform: s.platform, updatedAt: s.updated_at } : null;
}

/* ---------------- matches ---------------- */

/** A fully mapped match ready to store (all participants). Produced by cobalt's lib/riot mappers. */
export interface MatchWrite {
  matchId: string;
  platform: string;
  gameCreation: number;
  gameDurationS: number;
  queueId: number;
  patch: string;
  isRemake: boolean;
  participants: Array<
    Omit<MatchRecord, "matchId" | "gameCreation" | "gameDurationS" | "queueId" | "patch" | "isRemake"> & {
      riotIdGameName: string | null;
      riotIdTagLine: string | null;
      placement: number | null;
    }
  >;
}

const PARTICIPANT_COLS = [
  "match_id", "puuid", "game_creation", "queue_id", "riot_id_game_name", "riot_id_tag_line",
  "champion_id", "champion_name", "team_id", "team_position", "win", "kills", "deaths", "assists",
  "cs_total", "gold_earned", "damage_to_champions", "vision_score", "control_wards_bought", "team_kills",
  "opponent_champion_id", "opponent_champion_name", "opponent_cs_total", "cs_diff_10", "max_cs_advantage",
  "placement",
] as const;

/** Idempotent (on conflict do nothing). Returns true when the match row was newly inserted. */
export async function insertMatch(db: Db, m: MatchWrite, now: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const ins = await tx.query(
      `insert into matches (match_id, platform, game_creation, game_duration_s, queue_id, patch, is_remake, inserted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (match_id) do nothing returning match_id`,
      [m.matchId, m.platform, m.gameCreation, m.gameDurationS, m.queueId, m.patch, m.isRemake, now],
    );
    if (m.participants.length > 0) {
      const params: SqlParam[] = [];
      const tuples = m.participants.map((p) => {
        const values: SqlParam[] = [
          m.matchId, p.puuid, m.gameCreation, m.queueId, p.riotIdGameName, p.riotIdTagLine,
          p.championId, p.championName, p.teamId, p.teamPosition, p.win, p.kills, p.deaths, p.assists,
          p.csTotal, p.goldEarned, p.damageToChampions, p.visionScore, p.controlWardsBought, p.teamKills,
          p.opponentChampionId, p.opponentChampionName, p.opponentCsTotal, p.csDiff10, p.maxCsAdvantage,
          p.placement,
        ];
        const start = params.length;
        params.push(...values);
        return `(${values.map((_, i) => `$${start + i + 1}`).join(", ")})`;
      });
      await tx.query(
        `insert into match_participants (${PARTICIPANT_COLS.join(", ")}) values ${tuples.join(", ")}
         on conflict (match_id, puuid) do nothing`,
        params,
      );
    }
    return ins.rows.length > 0;
  });
}

/** Subset of `matchIds` already stored (for computing the missing set). */
export async function existingMatchIds(db: Db, matchIds: readonly string[]): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  const r = await db.query<{ match_id: string }>("select match_id from matches where match_id = any($1::text[])", [matchIds]);
  return new Set(r.rows.map((x) => x.match_id));
}

export async function countMatches(db: Db, puuid: string, filter?: QueueFilter): Promise<number> {
  const params: SqlParam[] = [puuid];
  const where = queueClause(filter, params);
  const r = await db.query<{ n: number }>(`select count(*)::int as n from match_participants mp where mp.puuid = $1${where}`, params);
  return r.rows[0]?.n ?? 0;
}

type RecordRow = MatchParticipantPgRow & Pick<MatchPgRow, "game_duration_s" | "patch" | "is_remake">;

const RECORD_SELECT = `select mp.*, m.game_duration_s, m.patch, m.is_remake
  from match_participants mp join matches m on m.match_id = mp.match_id`;

function toRecord(r: RecordRow): MatchRecord {
  return {
    matchId: r.match_id,
    gameCreation: r.game_creation,
    gameDurationS: r.game_duration_s,
    queueId: r.queue_id,
    patch: r.patch,
    isRemake: r.is_remake,
    puuid: r.puuid,
    championId: r.champion_id,
    championName: r.champion_name,
    // Stored values originate from the typed MatchWrite mapper; DB columns are plain int/text.
    teamId: r.team_id as TeamId,
    teamPosition: r.team_position as TeamPosition,
    win: r.win,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    csTotal: r.cs_total,
    goldEarned: r.gold_earned,
    damageToChampions: r.damage_to_champions,
    visionScore: r.vision_score,
    controlWardsBought: r.control_wards_bought,
    teamKills: r.team_kills,
    opponentChampionId: r.opponent_champion_id,
    opponentChampionName: r.opponent_champion_name,
    opponentCsTotal: r.opponent_cs_total,
    csDiff10: r.cs_diff_10,
    maxCsAdvantage: r.max_cs_advantage,
  };
}

/** Newest first. `userId` (optional) only fills `hasJournal`. */
export async function listMatchSummaries(
  db: Db,
  q: { puuid: string; filter: QueueFilter; champion?: string; limit: number; offset: number; userId?: string },
): Promise<{ items: MatchSummaryV2[]; total: number; champions: string[] }> {
  const base: SqlParam[] = [q.puuid];
  const qWhere = queueClause(q.filter, base);

  const champs = await db.query<{ champion_name: string }>(
    `select distinct mp.champion_name from match_participants mp where mp.puuid = $1${qWhere} order by mp.champion_name`,
    base,
  );

  const params = [...base];
  let where = qWhere;
  if (q.champion) {
    params.push(q.champion);
    where += ` and mp.champion_name = $${params.length}`;
  }
  const total = await db.query<{ n: number }>(
    `select count(*)::int as n from match_participants mp where mp.puuid = $1${where}`,
    params,
  );

  params.push(q.userId ?? null);
  const userIdx = params.length;
  params.push(q.limit, q.offset);
  const rows = await db.query<RecordRow & { has_journal: boolean }>(
    `select mp.*, m.game_duration_s, m.patch, m.is_remake,
       exists (select 1 from journal_entries j where j.user_id = $${userIdx}::uuid and j.match_id = mp.match_id) as has_journal
     from match_participants mp join matches m on m.match_id = mp.match_id
     where mp.puuid = $1${where}
     order by mp.game_creation desc, mp.match_id desc
     limit $${userIdx + 1} offset $${userIdx + 2}`,
    params,
  );

  const items: MatchSummaryV2[] = rows.rows.map((r) => {
    const minutes = r.game_duration_s / 60;
    return {
      matchId: r.match_id,
      gameCreation: r.game_creation,
      gameDurationS: r.game_duration_s,
      patch: r.patch,
      isRemake: r.is_remake,
      championId: r.champion_id,
      championName: r.champion_name,
      win: r.win,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
      kda: (r.kills + r.assists) / Math.max(1, r.deaths),
      csTotal: r.cs_total,
      csPerMin: minutes > 0 ? r.cs_total / minutes : 0,
      opponentChampionName: r.opponent_champion_name,
      hasJournal: r.has_journal,
      queueId: r.queue_id,
      placement: r.placement,
    };
  });
  return { items, total: total.rows[0]?.n ?? 0, champions: champs.rows.map((c) => c.champion_name) };
}

/** Chronological (oldest first) records for lib/coach. With `limit`: the newest `limit`, oldest first. */
export async function listMatchRecords(db: Db, puuid: string, filter: QueueFilter, limit?: number): Promise<MatchRecord[]> {
  const params: SqlParam[] = [puuid];
  const where = queueClause(filter, params);
  let limitSql = "";
  if (limit !== undefined) {
    params.push(limit);
    limitSql = ` limit $${params.length}`;
  }
  const r = await db.query<RecordRow>(
    `select * from (${RECORD_SELECT} where mp.puuid = $1${where}
       order by mp.game_creation desc, mp.match_id desc${limitSql}) t
     order by t.game_creation asc, t.match_id asc`,
    params,
  );
  return r.rows.map(toRecord);
}

export async function getMatchRecord(db: Db, matchId: string, puuid: string): Promise<MatchRecord | null> {
  const r = await db.query<RecordRow>(`${RECORD_SELECT} where mp.match_id = $1 and mp.puuid = $2`, [matchId, puuid]);
  return r.rows[0] ? toRecord(r.rows[0]) : null;
}

/** Aggregate via lib/coach `aggregate` over the stored records (same formulas everywhere). */
export async function aggregateStats(db: Db, puuid: string, filter: QueueFilter): Promise<AggregateStats | null> {
  return aggregate(await listMatchRecords(db, puuid, filter));
}

/* ---------------- journal (per user) ---------------- */

function toJournal(r: JournalEntryPgRow): JournalEntry {
  return {
    matchId: r.match_id,
    deathReasons: r.death_reasons,
    lesson: r.lesson,
    // tilt column has check (1..5).
    tilt: r.tilt as TiltLevel | null,
    updatedAt: r.updated_at,
  };
}

export async function getJournalEntry(db: Db, userId: string, matchId: string): Promise<JournalEntry | null> {
  const r = await db.query<JournalEntryPgRow>(
    "select * from journal_entries where user_id = $1 and match_id = $2",
    [userId, matchId],
  );
  return r.rows[0] ? toJournal(r.rows[0]) : null;
}

export async function upsertJournalEntry(
  db: Db,
  userId: string,
  matchId: string,
  input: JournalInput,
  now: number,
): Promise<JournalEntry> {
  const r = await db.query<JournalEntryPgRow>(
    `insert into journal_entries (user_id, match_id, death_reasons, lesson, tilt, updated_at)
     values ($1, $2, $3::jsonb, $4, $5, $6)
     on conflict (user_id, match_id) do update set death_reasons = excluded.death_reasons,
       lesson = excluded.lesson, tilt = excluded.tilt, updated_at = excluded.updated_at
     returning *`,
    [userId, matchId, JSON.stringify(input.deathReasons), input.lesson, input.tilt, now],
  );
  const row = r.rows[0];
  if (!row) throw new Error("upsertJournalEntry returned no row");
  return toJournal(row);
}

export async function listJournalEntries(db: Db, userId: string, matchIds?: readonly string[]): Promise<JournalEntry[]> {
  if (matchIds && matchIds.length === 0) return [];
  const r = matchIds
    ? await db.query<JournalEntryPgRow>(
        "select * from journal_entries where user_id = $1 and match_id = any($2::text[]) order by updated_at desc",
        [userId, matchIds],
      )
    : await db.query<JournalEntryPgRow>(
        "select * from journal_entries where user_id = $1 order by updated_at desc",
        [userId],
      );
  return r.rows.map(toJournal);
}

/* ---------------- rank snapshots ---------------- */

function toSnapshot(r: RankSnapshotPgRow): RankSnapshot {
  // tier/division are written only from validated league-v4 values.
  const tier = r.tier as Tier | null;
  const division = r.division as Division | null;
  return {
    id: r.id,
    puuid: r.puuid,
    takenAt: r.taken_at,
    queueType: RANKED_QUEUE_TYPE[r.queue_id],
    tier,
    division,
    lp: r.lp,
    wins: r.wins,
    losses: r.losses,
    ladderScore: tier ? ladderScore(tier, division ?? "I", r.lp) : null,
  };
}

export async function latestRankSnapshot(db: Db, puuid: string, queueId: RankedQueueId): Promise<RankSnapshot | null> {
  const r = await db.query<RankSnapshotPgRow>(
    "select * from rank_snapshots where puuid = $1 and queue_id = $2 order by taken_at desc, id desc limit 1",
    [puuid, queueId],
  );
  return r.rows[0] ? toSnapshot(r.rows[0]) : null;
}

/** Inserts only when tier/division/lp/wins/losses differ from the latest. Returns the stored-or-latest snapshot. */
export async function insertRankSnapshotIfChanged(
  db: Db,
  s: Omit<RankSnapshot, "id" | "ladderScore"> & { queueId: RankedQueueId },
): Promise<{ snapshot: RankSnapshot; created: boolean }> {
  return db.transaction(async (tx) => {
    const latest = await latestRankSnapshot(tx, s.puuid, s.queueId);
    if (
      latest &&
      latest.tier === s.tier &&
      latest.division === s.division &&
      latest.lp === s.lp &&
      latest.wins === s.wins &&
      latest.losses === s.losses
    ) {
      return { snapshot: latest, created: false };
    }
    const r = await tx.query<RankSnapshotPgRow>(
      `insert into rank_snapshots (puuid, queue_id, taken_at, tier, division, lp, wins, losses)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [s.puuid, s.queueId, s.takenAt, s.tier, s.division, s.lp, s.wins, s.losses],
    );
    const row = r.rows[0];
    if (!row) throw new Error("insertRankSnapshotIfChanged returned no row");
    return { snapshot: toSnapshot(row), created: true };
  });
}

export async function listRankSnapshots(db: Db, puuid: string, queueId: RankedQueueId): Promise<RankSnapshot[]> {
  const r = await db.query<RankSnapshotPgRow>(
    "select * from rank_snapshots where puuid = $1 and queue_id = $2 order by taken_at asc, id asc",
    [puuid, queueId],
  );
  return r.rows.map(toSnapshot);
}

/* ---------------- sync state ---------------- */

function toSyncState(r: SyncStatePgRow): SyncState {
  return {
    puuid: r.puuid,
    pendingMatchIds: r.pending_match_ids,
    backfillStart: r.backfill_start,
    lastSyncAt: r.last_sync_at,
    cooldownUntil: r.cooldown_until,
    leaseUntil: r.lease_until,
    lastErrorCode: r.last_error_code,
    lastErrorAt: r.last_error_at,
  };
}

export async function getSyncState(db: Db, puuid: string): Promise<SyncState | null> {
  const r = await db.query<SyncStatePgRow>("select * from sync_state where puuid = $1", [puuid]);
  return r.rows[0] ? toSyncState(r.rows[0]) : null;
}

/**
 * Atomic lease: succeeds only if lease_until < now (creates the row if missing).
 * Returns the state after acquiring, or null when another batch holds the lease.
 */
export async function acquireSyncLease(db: Db, puuid: string, now: number, leaseMs: number): Promise<SyncState | null> {
  const r = await db.query<SyncStatePgRow>(
    `insert into sync_state (puuid, lease_until, updated_at) values ($1, $2, $3)
     on conflict (puuid) do update set lease_until = excluded.lease_until, updated_at = excluded.updated_at
     where sync_state.lease_until < $3
     returning *`,
    [puuid, now + leaseMs, now],
  );
  return r.rows[0] ? toSyncState(r.rows[0]) : null;
}

/** Writes the given fields and releases the lease (lease_until = 0). */
export async function releaseSyncLease(
  db: Db,
  puuid: string,
  patch: Partial<Pick<SyncState, "pendingMatchIds" | "backfillStart" | "lastSyncAt" | "cooldownUntil">> & {
    lastErrorCode?: ApiErrorCode | null;
  },
  now: number,
): Promise<SyncState> {
  const params: SqlParam[] = [puuid, now];
  const sets = ["lease_until = 0", "updated_at = $2"];
  const set = (col: string, value: SqlParam, cast = "") => {
    params.push(value);
    sets.push(`${col} = $${params.length}${cast}`);
  };
  if (patch.pendingMatchIds !== undefined) set("pending_match_ids", patch.pendingMatchIds, "::text[]");
  if (patch.backfillStart !== undefined) set("backfill_start", patch.backfillStart);
  if (patch.lastSyncAt !== undefined) set("last_sync_at", patch.lastSyncAt);
  if (patch.cooldownUntil !== undefined) set("cooldown_until", patch.cooldownUntil);
  if (patch.lastErrorCode !== undefined) {
    set("last_error_code", patch.lastErrorCode);
    set("last_error_at", patch.lastErrorCode === null ? null : now);
  }
  return db.transaction(async (tx) => {
    await tx.query(
      "insert into sync_state (puuid, updated_at) values ($1, $2) on conflict (puuid) do nothing",
      [puuid, now],
    );
    const r = await tx.query<SyncStatePgRow>(
      `update sync_state set ${sets.join(", ")} where puuid = $1 returning *`,
      params,
    );
    const row = r.rows[0];
    if (!row) throw new Error("releaseSyncLease returned no row");
    return toSyncState(row);
  });
}

/* ---------------- rate limiting (shared across lambdas) ---------------- */

/**
 * Fixed-window counter: one atomic `insert … on conflict do update … returning`.
 * allowed=false when the post-increment count exceeds `limit`. A caller with a stale clock
 * (older window) increments the current window instead of resetting it.
 */
export async function consumeRateLimit(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<{ allowed: boolean; count: number; resetAt: number }> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const r = await db.query<{ count: number; window_start: number }>(
    `insert into rate_limit_buckets (key, window_start, count) values ($1, $2, 1)
     on conflict (key) do update set
       count = case when rate_limit_buckets.window_start >= excluded.window_start
                    then rate_limit_buckets.count + 1 else 1 end,
       window_start = greatest(rate_limit_buckets.window_start, excluded.window_start)
     returning count, window_start`,
    [key, windowStart],
  );
  const row = r.rows[0];
  if (!row) throw new Error("consumeRateLimit returned no row");
  return { allowed: row.count <= limit, count: row.count, resetAt: row.window_start + windowMs };
}

/* ---------------- account deletion ---------------- */

/**
 * Deletes everything owned by the user (journal_entries, profile). Shared data (matches,
 * participants, rank_snapshots, sync_state, summoners) is public Riot data and is kept.
 * The Supabase auth user is deleted by forge (admin API) AFTER this succeeds.
 */
export async function deleteUserData(db: Db, userId: string): Promise<{ journalEntries: number; profile: boolean }> {
  return db.transaction(async (tx) => {
    const j = await tx.query("delete from journal_entries where user_id = $1", [userId]);
    const p = await tx.query("delete from profiles where user_id = $1", [userId]);
    return { journalEntries: j.rowCount, profile: p.rowCount > 0 };
  });
}
