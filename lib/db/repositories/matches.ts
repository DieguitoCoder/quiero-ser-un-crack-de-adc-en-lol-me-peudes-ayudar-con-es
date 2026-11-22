/** Owner: cobalt. Reads return MatchRecord (matches JOIN match_participant). */
import type { Db } from "@/lib/db/connection";
import type { MatchParticipantRow, MatchRecord, MatchRow, TeamId, TeamPosition } from "@/lib/types";

const MAX_LIMIT = 100;
const TEAM_POSITIONS: readonly string[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", ""];

type JoinedRow = MatchRow & MatchParticipantRow;

const SELECT_JOINED = `
  SELECT m.match_id, m.game_creation, m.game_duration_s, m.queue_id, m.patch, m.is_remake, m.inserted_at,
         NULL AS raw_json, p.*
    FROM matches m
    JOIN match_participant p ON p.match_id = m.match_id`;

function toRecord(row: JoinedRow): MatchRecord {
  return {
    matchId: row.match_id,
    gameCreation: row.game_creation,
    gameDurationS: row.game_duration_s,
    queueId: row.queue_id,
    patch: row.patch,
    isRemake: row.is_remake === 1,
    puuid: row.puuid,
    championId: row.champion_id,
    championName: row.champion_name,
    teamId: (row.team_id === 200 ? 200 : 100) satisfies TeamId,
    teamPosition: (TEAM_POSITIONS.includes(row.team_position) ? row.team_position : "") as TeamPosition,
    win: row.win === 1,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    csTotal: row.cs_total,
    goldEarned: row.gold_earned,
    damageToChampions: row.damage_to_champions,
    visionScore: row.vision_score,
    controlWardsBought: row.control_wards_bought,
    teamKills: row.team_kills,
    opponentChampionId: row.opponent_champion_id,
    opponentChampionName: row.opponent_champion_name,
    opponentCsTotal: row.opponent_cs_total,
    csDiff10: row.cs_diff_10,
    maxCsAdvantage: row.max_cs_advantage,
  };
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return MAX_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

/** Inserts match + participant in ONE transaction. INSERT OR IGNORE → idempotent. Returns true if inserted. */
export function insertMatch(db: Db, record: MatchRecord, rawJson: string | null): boolean {
  return db.transaction(() => {
    const res = db
      .prepare(
        `INSERT OR IGNORE INTO matches (match_id, game_creation, game_duration_s, queue_id, patch, is_remake, raw_json, inserted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.matchId,
        record.gameCreation,
        record.gameDurationS,
        record.queueId,
        record.patch,
        record.isRemake ? 1 : 0,
        rawJson,
        Date.now(),
      );
    db.prepare(
      `INSERT OR IGNORE INTO match_participant (
         match_id, puuid, champion_id, champion_name, team_id, team_position, win, kills, deaths, assists,
         cs_total, gold_earned, damage_to_champions, vision_score, control_wards_bought, team_kills,
         opponent_champion_id, opponent_champion_name, opponent_cs_total, cs_diff_10, max_cs_advantage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      record.matchId,
      record.puuid,
      record.championId,
      record.championName,
      record.teamId,
      record.teamPosition,
      record.win ? 1 : 0,
      record.kills,
      record.deaths,
      record.assists,
      record.csTotal,
      record.goldEarned,
      record.damageToChampions,
      record.visionScore,
      record.controlWardsBought,
      record.teamKills,
      record.opponentChampionId,
      record.opponentChampionName,
      record.opponentCsTotal,
      record.csDiff10,
      record.maxCsAdvantage,
    );
    return res.changes > 0;
  })();
}

export function existingMatchIds(db: Db, ids: readonly string[]): Set<string> {
  const found = new Set<string>();
  const CHUNK = 500; // stay well below SQLITE_MAX_VARIABLE_NUMBER
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db.prepare(`SELECT match_id FROM matches WHERE match_id IN (${placeholders})`).all(...chunk) as {
      match_id: string;
    }[];
    for (const r of rows) found.add(r.match_id);
  }
  return found;
}

/** Newest first. */
export function listMatchRecords(
  db: Db,
  puuid: string,
  opts: { champion?: string; limit?: number; offset?: number },
): MatchRecord[] {
  const limit = clampLimit(opts.limit);
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
  const where = opts.champion ? "WHERE p.puuid = ? AND p.champion_name = ?" : "WHERE p.puuid = ?";
  const params: (string | number)[] = opts.champion ? [puuid, opts.champion] : [puuid];
  const rows = db
    .prepare(`${SELECT_JOINED} ${where} ORDER BY m.game_creation DESC, m.match_id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as JoinedRow[];
  return rows.map(toRecord);
}

/**
 * All non-remake records for aggregation (stats/goals/coach), newest first.
 * Unbounded by design (ARCHITECTURE §4: hundreds of rows for a single player).
 */
export function listAllPlayedRecords(db: Db, puuid: string): MatchRecord[] {
  const rows = db
    .prepare(`${SELECT_JOINED} WHERE p.puuid = ? AND m.is_remake = 0 ORDER BY m.game_creation DESC, m.match_id DESC`)
    .all(puuid) as JoinedRow[];
  return rows.map(toRecord);
}

export function countMatches(db: Db, puuid: string, champion?: string): number {
  const row = champion
    ? db.prepare("SELECT COUNT(*) AS n FROM match_participant WHERE puuid = ? AND champion_name = ?").get(puuid, champion)
    : db.prepare("SELECT COUNT(*) AS n FROM match_participant WHERE puuid = ?").get(puuid);
  return (row as { n: number } | undefined)?.n ?? 0;
}

export function getMatchRecord(db: Db, puuid: string, matchId: string): MatchRecord | null {
  const row = db.prepare(`${SELECT_JOINED} WHERE p.puuid = ? AND m.match_id = ?`).get(puuid, matchId) as
    | JoinedRow
    | undefined;
  return row ? toRecord(row) : null;
}

/** Distinct champions, ordered by games desc. */
export function listChampions(db: Db, puuid: string): string[] {
  const rows = db
    .prepare(
      `SELECT champion_name, COUNT(*) AS n FROM match_participant WHERE puuid = ?
        GROUP BY champion_name ORDER BY n DESC, champion_name ASC`,
    )
    .all(puuid) as { champion_name: string }[];
  return rows.map((r) => r.champion_name);
}
