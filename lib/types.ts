/**
 * Climb Tracker — shared contract types.
 *
 * Owner: orion. This file is the single source of truth for:
 *   1. SQLite row shapes (`*Row`, snake_case, mirror docs/ARCHITECTURE.md §3 exactly)
 *   2. Domain types (camelCase) used by lib/db repositories, lib/coach and UI
 *   3. HTTP contracts for app/api/** (`*Response`, `*Input`, `ApiErrorBody`)
 *
 * Conventions:
 *   - All timestamps are epoch milliseconds (number), in DB and in JSON.
 *   - Ratios (winrate, killParticipation) are 0..1 floats; the UI formats them as %.
 *   - Champion names are Data Dragon ids as returned by match-v5 `championName` (e.g. "MissFortune").
 *   - This file must stay free of runtime imports so it is safe for client and server code.
 *
 * Change policy: additive changes only (new optional fields / new union members),
 * and they must be mirrored in docs/ARCHITECTURE.md (§11 Changelog).
 */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const SOLO_QUEUE_ID = 420 as const;
export const SOLO_QUEUE_TYPE = "RANKED_SOLO_5x5" as const;

export type Tier =
  | "IRON"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "EMERALD"
  | "DIAMOND"
  | "MASTER"
  | "GRANDMASTER"
  | "CHALLENGER";

/** Riot calls this field `rank` in league-v4. Master+ always report "I". */
export type Division = "I" | "II" | "III" | "IV";

/** match-v5 `teamPosition`; "" when Riot could not infer it (e.g. remakes). */
export type TeamPosition = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | "";

export type TeamId = 100 | 200;

export type RiotPlatform = "la1";
export type RiotRegion = "americas";

/** Goal phase, derived from the current tier (see lib/coach/ranks.ts `phaseForTier`). */
export type Phase = "BRONZE" | "SILVER" | "GOLD";

/** Predefined death-reason tags for the journal. Spanish labels live in the UI (DEATH_REASON_LABELS). */
export type DeathReason =
  | "out_of_position"
  | "no_vision"
  | "overextended"
  | "jungle_gank"
  | "bad_trade"
  | "teamfight"
  | "tower_dive"
  | "greed"
  | "other";

export const DEATH_REASONS = [
  "out_of_position",
  "no_vision",
  "overextended",
  "jungle_gank",
  "bad_trade",
  "teamfight",
  "tower_dive",
  "greed",
  "other",
] as const satisfies readonly DeathReason[];

export const DEATH_REASON_LABELS = {
  out_of_position: "Mal posicionado",
  no_vision: "Sin visión",
  overextended: "Sobreextendido",
  jungle_gank: "Gank del jungla",
  bad_trade: "Mal intercambio",
  teamfight: "Pelea de equipo",
  tower_dive: "Dive bajo torre",
  greed: "Codicia (farmeo/objetivo)",
  other: "Otro",
} as const satisfies Record<DeathReason, string>;

export type TiltLevel = 1 | 2 | 3 | 4 | 5;

/* ------------------------------------------------------------------ */
/* 1. SQLite rows (snake_case, 1:1 with columns). Booleans are 0|1.    */
/* ------------------------------------------------------------------ */

export interface SummonerRow {
  puuid: string;
  game_name: string;
  tag_line: string;
  platform: string;
  updated_at: number;
}

export interface MatchRow {
  match_id: string;
  game_creation: number;
  game_duration_s: number;
  queue_id: number;
  patch: string;
  is_remake: 0 | 1;
  raw_json: string | null;
  inserted_at: number;
}

export interface MatchParticipantRow {
  match_id: string;
  puuid: string;
  champion_id: number;
  champion_name: string;
  team_id: number;
  team_position: string;
  win: 0 | 1;
  kills: number;
  deaths: number;
  assists: number;
  cs_total: number;
  gold_earned: number;
  damage_to_champions: number;
  vision_score: number;
  control_wards_bought: number;
  team_kills: number;
  opponent_champion_id: number | null;
  opponent_champion_name: string | null;
  opponent_cs_total: number | null;
  cs_diff_10: number | null;
  max_cs_advantage: number | null;
}

export interface RankSnapshotRow {
  id: number;
  puuid: string;
  taken_at: number;
  queue_type: string;
  tier: string | null;
  division: string | null;
  lp: number;
  wins: number;
  losses: number;
}

export interface JournalEntryRow {
  match_id: string;
  /** JSON-encoded DeathReason[] */
  death_reasons: string;
  lesson: string;
  tilt: number | null;
  updated_at: number;
}

export interface SettingRow {
  key: SettingKey;
  value: string;
  updated_at: number;
}

/** Known settings keys. The Riot API key is NEVER stored here (env only). */
export type SettingKey = "tracked_puuid" | "last_sync_at" | "last_sync_error_code";

/* ------------------------------------------------------------------ */
/* 2. Domain types (camelCase)                                         */
/* ------------------------------------------------------------------ */

export interface Summoner {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  updatedAt: number;
}

/** One SoloQ game of the tracked player: `matches` JOIN `match_participant`. Input of every lib/coach function. */
export interface MatchRecord {
  matchId: string;
  gameCreation: number;
  gameDurationS: number;
  queueId: number;
  patch: string;
  isRemake: boolean;
  puuid: string;
  championId: number;
  championName: string;
  teamId: TeamId;
  teamPosition: TeamPosition;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csTotal: number;
  goldEarned: number;
  damageToChampions: number;
  visionScore: number;
  controlWardsBought: number;
  teamKills: number;
  opponentChampionId: number | null;
  opponentChampionName: string | null;
  opponentCsTotal: number | null;
  csDiff10: number | null;
  maxCsAdvantage: number | null;
}

/** Per-game derived metrics (lib/coach/metrics.ts `deriveMetrics`). */
export interface DerivedMetrics {
  durationMin: number;
  csPerMin: number;
  /** (k + a) / max(1, d) */
  kda: number;
  /** (k + a) / teamKills; 0 when teamKills = 0 */
  killParticipation: number;
  goldPerMin: number;
  damagePerMin: number;
  visionPerMin: number;
  /** csTotal - opponentCsTotal; null when no lane opponent was found */
  csDiffVsOpponent: number | null;
}

export interface RankSnapshot {
  id: number;
  puuid: string;
  takenAt: number;
  queueType: string;
  /** null = unranked in SoloQ at snapshot time */
  tier: Tier | null;
  division: Division | null;
  lp: number;
  wins: number;
  losses: number;
  /** lib/coach/ranks.ts `ladderScore`; null when unranked */
  ladderScore: number | null;
}

export interface JournalEntry {
  matchId: string;
  deathReasons: DeathReason[];
  lesson: string;
  tilt: TiltLevel | null;
  updatedAt: number;
}

export interface Streak {
  kind: "win" | "loss";
  count: number;
}

export interface AggregateStats {
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  /** sum(k+a) / max(1, sum(d)) */
  kda: number;
  /** sum(cs) / sum(minutes) */
  csPerMin: number;
  killParticipation: number;
  visionPerMin: number;
  controlWardsPerGame: number;
  goldPerMin: number;
  damagePerMin: number;
}

export interface ChampionStats {
  championName: string;
  championId: number;
  games: number;
  wins: number;
  winrate: number;
  kda: number;
  csPerMin: number;
  avgDeaths: number;
}

export interface OpponentStats {
  opponentChampionName: string;
  games: number;
  wins: number;
  winrate: number;
  avgCsDiff: number | null;
}

/** One point per game, chronological (oldest first). MA fields are null until 5 games exist. */
export interface TrendPoint {
  matchId: string;
  gameCreation: number;
  championName: string;
  win: boolean;
  csPerMin: number;
  deaths: number;
  csPerMinMa5: number | null;
  deathsMa5: number | null;
}

export interface LadderPoint {
  takenAt: number;
  tier: Tier;
  division: Division;
  lp: number;
  ladderScore: number;
}

/* --- Goals --- */

export type GoalId =
  | "bronze_cs_per_min"
  | "bronze_deaths"
  | "silver_cs_per_min"
  | "silver_control_wards"
  | "gold_kill_participation"
  | "gold_deaths";

export type GoalMetric = "csPerMin" | "avgDeaths" | "controlWardsPerGame" | "killParticipation";

export type GoalStatus = "green" | "yellow" | "red" | "insufficient";

export interface GoalDefinition {
  id: GoalId;
  phase: Phase;
  metric: GoalMetric;
  comparator: "gte" | "lte";
  target: number;
  /** Spanish, e.g. "6+ CS por minuto" */
  label: string;
}

export interface GoalProgress extends GoalDefinition {
  /** null when sample < MIN_GOAL_SAMPLE */
  value: number | null;
  status: GoalStatus;
  /** 0..1 */
  progress: number;
  /** true when the goal belongs to an earlier phase and is carried into the current one */
  carried: boolean;
}

/* --- Coach --- */

export type CoachRuleId =
  | "LOW_CS"
  | "HIGH_DEATHS"
  | "NO_CONTROL_WARD"
  | "LOW_KILL_PARTICIPATION"
  | "LOST_LANE_CS"
  | "LOW_VISION"
  | "GOOD_GAME"
  | "TILT_LOSS_STREAK"
  | "TILT_SELF_REPORTED"
  | "CS_TREND"
  | "DEATHS_TREND"
  | "BEST_CHAMPION"
  | "WORST_CHAMPION"
  | "TOP_DEATH_REASON";

export type TipSeverity = "high" | "medium" | "low" | "positive";

export interface CoachTip {
  ruleId: CoachRuleId;
  severity: TipSeverity;
  /** Spanish, final user-facing text */
  message: string;
}

export interface CoachSummary {
  /** number of non-remake games considered (≤ 10) */
  games: number;
  stats: AggregateStats | null;
  /** true when the 2 most recent games are losses → "descansa" */
  tilt: boolean;
  insights: CoachTip[];
}

/* ------------------------------------------------------------------ */
/* 3. HTTP contracts                                                   */
/* ------------------------------------------------------------------ */

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "MATCH_NOT_FOUND"
  | "SUMMONER_NOT_FOUND"
  | "SYNC_IN_PROGRESS"
  | "RIOT_KEY_MISSING"
  | "RIOT_KEY_INVALID"
  | "RIOT_RATE_LIMITED"
  | "RIOT_UNAVAILABLE"
  | "INTERNAL_ERROR"
  /* v2 */
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "PROFILE_REQUIRED"
  | "RIOT_ID_TAKEN"
  | "SYNC_COOLDOWN"
  | "RATE_LIMITED"
  | "RSO_DISABLED"
  | "RSO_FAILED";

export interface ApiError {
  code: ApiErrorCode;
  /** Spanish, user-facing, never contains secrets or stack traces */
  message: string;
  /** field path → Spanish message (VALIDATION_ERROR only) */
  fields?: Record<string, string>;
  /** RIOT_RATE_LIMITED, SYNC_COOLDOWN, RATE_LIMITED */
  retryAfterS?: number;
}

export interface ApiErrorBody {
  error: ApiError;
}

/** Return type of every lib/services function. Routes map `error.code` → HTTP status (lib/errors.ts). */
export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/* POST /api/sync */
export interface SyncResponse {
  /** matches inserted by this run */
  newMatches: number;
  /** total SoloQ matches stored after this run */
  totalMatches: number;
  /** true when more missing matches remain (per-run cap reached) → sync again */
  hasMore: boolean;
  rank: RankSnapshot | null;
  /** false when rank was identical to the previous snapshot (no row written) */
  snapshotCreated: boolean;
  syncedAt: number;
  durationMs: number;
  mock: boolean;
}

/* GET /api/matches */
export interface MatchListQuery {
  champion?: string;
  limit: number;
  offset: number;
}

export interface MatchSummary {
  matchId: string;
  gameCreation: number;
  gameDurationS: number;
  patch: string;
  isRemake: boolean;
  championId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  csTotal: number;
  csPerMin: number;
  opponentChampionName: string | null;
  hasJournal: boolean;
}

export interface MatchListResponse {
  items: MatchSummary[];
  total: number;
  limit: number;
  offset: number;
  /** distinct champions played (sorted by games desc) — options for the filter */
  champions: string[];
}

/* GET /api/matches/[id] */
export interface MatchDetail extends MatchRecord, DerivedMetrics {}

export interface MatchDetailResponse {
  match: MatchDetail;
  /** 1..3 tips; [] for remakes */
  tips: CoachTip[];
  journal: JournalEntry | null;
}

/* GET/PUT /api/journal/[matchId] */
export interface JournalInput {
  deathReasons: DeathReason[];
  /** ≤ 1000 chars, trimmed */
  lesson: string;
  tilt: TiltLevel | null;
}

export interface JournalResponse {
  entry: JournalEntry | null;
}

/* GET /api/stats */
export interface StatsResponse {
  summoner: Summoner | null;
  rank: RankSnapshot | null;
  ladder: LadderPoint[];
  totals: AggregateStats | null;
  recent: AggregateStats | null;
  streak: Streak | null;
  trend: TrendPoint[];
  byChampion: ChampionStats[];
  byOpponent: OpponentStats[];
  coach: CoachSummary;
}

/* GET /api/goals */
export interface GoalsResponse {
  phase: Phase;
  rank: RankSnapshot | null;
  /** games actually evaluated (≤ windowSize) */
  sampleSize: number;
  windowSize: number;
  minSample: number;
  goals: GoalProgress[];
}

/* GET /api/status */
export interface StatusResponse {
  riotId: string;
  platform: string;
  region: string;
  /** whether RIOT_API_KEY is non-empty. The key itself is never returned. */
  apiKeyConfigured: boolean;
  mockMode: boolean;
  lastSyncAt: number | null;
  lastSyncErrorCode: ApiErrorCode | null;
  matchCount: number;
  summonerResolved: boolean;
}

/* ================================================================== */
/* v2 (multi-user, Postgres, all queues). Owner: orion.                */
/* v1 *Row types above describe the SQLite file and are used only by   */
/* scripts/import-sqlite.ts after v2 lands. Postgres rows: *PgRow.     */
/* ================================================================== */

/** Epoch ms. */
export type EpochMs = number;

/* --- Postgres rows (snake_case; Db normalizes bigint→number, bool→boolean, jsonb→value) --- */

export interface ProfilePgRow {
  user_id: string;
  puuid: string | null;
  game_name: string | null;
  tag_line: string | null;
  platform: string;
  verified: boolean;
  created_at: number;
  updated_at: number;
}

export interface MatchPgRow {
  match_id: string;
  platform: string;
  game_creation: number;
  game_duration_s: number;
  queue_id: number;
  patch: string;
  is_remake: boolean;
  inserted_at: number;
}

export interface MatchParticipantPgRow {
  match_id: string;
  puuid: string;
  game_creation: number;
  queue_id: number;
  riot_id_game_name: string | null;
  riot_id_tag_line: string | null;
  champion_id: number;
  champion_name: string;
  team_id: number;
  team_position: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs_total: number;
  gold_earned: number;
  damage_to_champions: number;
  vision_score: number;
  control_wards_bought: number;
  team_kills: number;
  opponent_champion_id: number | null;
  opponent_champion_name: string | null;
  opponent_cs_total: number | null;
  cs_diff_10: number | null;
  max_cs_advantage: number | null;
  placement: number | null;
}

export interface JournalEntryPgRow {
  user_id: string;
  match_id: string;
  death_reasons: DeathReason[];
  lesson: string;
  tilt: number | null;
  updated_at: number;
}

export interface RankSnapshotPgRow {
  id: number;
  puuid: string;
  queue_id: 420 | 440;
  taken_at: number;
  tier: string | null;
  division: string | null;
  lp: number;
  wins: number;
  losses: number;
}

export interface SyncStatePgRow {
  puuid: string;
  pending_match_ids: string[];
  /** null = older-history backfill finished */
  backfill_start: number | null;
  last_sync_at: number | null;
  cooldown_until: number;
  lease_until: number;
  last_error_code: ApiErrorCode | null;
  last_error_at: number | null;
  updated_at: number;
}

/* --- Domain (v2) --- */

/** Authenticated app user (Supabase Auth, or AUTH_MOCK in dev/test). */
export interface AuthUser {
  id: string;
  email: string | null;
  /** how this session was established */
  provider: "magic_link" | "rso" | "mock";
}

export interface Profile {
  userId: string;
  puuid: string | null;
  gameName: string | null;
  tagLine: string | null;
  platform: string;
  /** true only when the PUUID came from RSO (accounts/me) */
  verified: boolean;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

/** Context every per-user service receives (built by lib/auth `requireViewer`). */
export interface Viewer {
  user: AuthUser;
  /** null until the user links a Riot ID */
  profile: Profile | null;
}

/** A player whose data is being read: the viewer's linked account or a public search target. */
export interface PlayerRef {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
}

export interface SyncState {
  puuid: string;
  pendingMatchIds: string[];
  backfillStart: number | null;
  lastSyncAt: EpochMs | null;
  cooldownUntil: EpochMs;
  leaseUntil: EpochMs;
  lastErrorCode: ApiErrorCode | null;
  lastErrorAt: EpochMs | null;
}

/* --- HTTP (v2) --- */

/** POST /api/sync — one resumable batch (≤ 15 matches). Client loops while hasMore, sending back `cursor`. */
export interface SyncBatchResponse {
  /** matches inserted by this batch */
  newMatches: number;
  /** matches still known-missing after this batch (pending + not yet discovered is unknown) */
  remaining: number;
  /** opaque; pass as body `{ cursor }` on the next call. null when hasMore=false */
  cursor: string | null;
  hasMore: boolean;
  /**
   * Epoch ms. The 2-min cooldown starts when a sync CHAIN finishes (hasMore=false);
   * continuation calls carrying a valid cursor are exempt.
   */
  cooldownUntil: EpochMs;
  /** total matches stored for this puuid (all queues) */
  totalMatches: number;
  rank: { solo: RankSnapshot | null; flex: RankSnapshot | null };
  snapshotCreated: boolean;
  syncedAt: EpochMs;
  durationMs: number;
  mock: boolean;
}

export interface SyncBatchInput {
  cursor?: string | null;
}

/** GET /api/matches?queue=&champion=&limit=&offset= ; `queue` raw string parsed by lib/queues parseQueueFilter */
export interface MatchListQueryV2 extends MatchListQuery {
  /** default "all" */
  queue: string;
}

export interface MatchSummaryV2 extends MatchSummary {
  queueId: number;
  /** Arena only */
  placement: number | null;
}

export interface MatchListResponseV2 extends Omit<MatchListResponse, "items"> {
  items: MatchSummaryV2[];
}

/** GET /api/stats?queue= (default "420"). `coach` is null when the filter is not coach-eligible. */
export interface StatsResponseV2 extends Omit<StatsResponse, "coach" | "rank" | "ladder" | "summoner"> {
  player: PlayerRef | null;
  /** echo of the parsed filter as sent (e.g. "420", "normal", "all") */
  queue: string;
  rank: { solo: RankSnapshot | null; flex: RankSnapshot | null };
  /** LP history of the ranked queue in the filter (420 when filter is not a single ranked queue) */
  ladder: LadderPoint[];
  coach: CoachSummary | null;
}

/** GET /api/goals?queue= (coach-eligible queue ids only; default 420) */
export interface GoalsResponseV2 extends GoalsResponse {
  queue: string;
}

/** GET /api/me */
export interface MeResponse {
  user: AuthUser;
  profile: Profile | null;
  rsoEnabled: boolean;
}

/** PUT /api/me/riot-id — link (or replace) the Riot ID; result is verified=false. */
export interface LinkRiotIdInput {
  /** "gameName#tagLine" */
  riotId: string;
}

export interface LinkRiotIdResponse {
  profile: Profile;
}

/** POST /api/auth/magic-link */
export interface MagicLinkInput {
  email: string;
  /** relative path to return to after login; must start with "/" and not "//" */
  next?: string;
}

export interface MagicLinkResponse {
  sent: true;
}

/** GET /api/search?riotId=Name%23TAG (public, IP rate-limited). Page: /jugador/[riotId] with "Name-TAG". */
export interface PublicPlayerResponse {
  player: PlayerRef;
  rank: { solo: RankSnapshot | null; flex: RankSnapshot | null };
  /** most recent first, ≤ 20, all queues */
  recent: MatchSummaryV2[];
  /** epoch ms of last sync for this puuid; public search triggers at most one batch if stale */
  lastSyncAt: EpochMs | null;
}

/** DELETE /api/me → 204. Deletes journal, profile and the Supabase auth user. Shared match data stays. */
export type DeleteAccountResponse = { deleted: true };
