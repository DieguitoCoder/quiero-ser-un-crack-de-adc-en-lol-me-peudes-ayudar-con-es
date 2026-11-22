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
  | "INTERNAL_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  /** Spanish, user-facing, never contains secrets or stack traces */
  message: string;
  /** field path → Spanish message (VALIDATION_ERROR only) */
  fields?: Record<string, string>;
  /** RIOT_RATE_LIMITED only */
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
