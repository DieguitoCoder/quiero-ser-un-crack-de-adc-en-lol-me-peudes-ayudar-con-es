/**
 * One-off import of the v1 local SQLite (data/climb.db) into Postgres. Owner: quartz.
 * Usage: npx tsx scripts/import-sqlite.ts --user-id <supabase-user-uuid> [--sqlite data/climb.db]
 *        (DATABASE_URL in env -> Postgres, use the DIRECT :5432 url; unset -> PGlite at PGLITE_DIR)
 * Maps: summoner -> summoners + profiles(user, verified=false, only if the user has no profile);
 * matches/match_participant -> matches/match_participants (queue_id from v1 row, riot_id_* from summoner);
 * rank_snapshots -> queue 420/440 by queue_type; journal_entries -> (user_id, match_id).
 * Idempotent (on conflict do nothing / existence checks). Never prints secrets.
 * better-sqlite3 is a devDependency used ONLY here.
 */
import Database from "better-sqlite3";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPgliteDb, createPostgresDb } from "@/lib/db/drivers";
import { runMigrations } from "@/lib/db/migrate";
import type { Db } from "@/lib/db/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface V1Summoner { puuid: string; game_name: string; tag_line: string; platform: string; updated_at: number }
interface V1Match { match_id: string; game_creation: number; game_duration_s: number; queue_id: number; patch: string; is_remake: number; inserted_at: number }
interface V1Participant {
  match_id: string; puuid: string; champion_id: number; champion_name: string; team_id: number; team_position: string;
  win: number; kills: number; deaths: number; assists: number; cs_total: number; gold_earned: number;
  damage_to_champions: number; vision_score: number; control_wards_bought: number; team_kills: number;
  opponent_champion_id: number | null; opponent_champion_name: string | null; opponent_cs_total: number | null;
  cs_diff_10: number | null; max_cs_advantage: number | null;
}
interface V1Snapshot { puuid: string; taken_at: number; queue_type: string; tier: string | null; division: string | null; lp: number; wins: number; losses: number }
interface V1Journal { match_id: string; death_reasons: string; lesson: string; tilt: number | null; updated_at: number }

const QUEUE_BY_TYPE: Record<string, number> = { RANKED_SOLO_5x5: 420, RANKED_FLEX_SR: 440 };

export interface ImportResult { matches: number; journal: number; snapshots: number }

export async function importSqlite(opts: {
  sqlitePath: string;
  userId: string;
  db: Db;
  now?: number;
}): Promise<ImportResult> {
  if (!UUID_RE.test(opts.userId)) throw new Error("--user-id must be a UUID");
  const now = opts.now ?? Date.now();
  const lite = new Database(opts.sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const summoners = lite.prepare("select puuid, game_name, tag_line, platform, updated_at from summoner").all() as V1Summoner[];
    const byPuuid = new Map(summoners.map((s) => [s.puuid, s]));
    const matches = lite.prepare(
      "select match_id, game_creation, game_duration_s, queue_id, patch, is_remake, inserted_at from matches",
    ).all() as V1Match[];
    const parts = lite.prepare("select * from match_participant").all() as V1Participant[];
    const snaps = lite.prepare(
      "select puuid, taken_at, queue_type, tier, division, lp, wins, losses from rank_snapshots order by taken_at",
    ).all() as V1Snapshot[];
    const journal = lite.prepare("select match_id, death_reasons, lesson, tilt, updated_at from journal_entries").all() as V1Journal[];
    // The v1 owner is the summoner with the most participant rows.
    const counts = new Map<string, number>();
    for (const p of parts) counts.set(p.puuid, (counts.get(p.puuid) ?? 0) + 1);
    const owner = [...summoners].sort((a, b) => (counts.get(b.puuid) ?? 0) - (counts.get(a.puuid) ?? 0))[0];

    return await opts.db.transaction(async (tx) => {
      for (const s of summoners) {
        await tx.query(
          `insert into summoners (puuid, game_name, tag_line, platform, updated_at) values ($1, $2, $3, $4, $5)
           on conflict (puuid) do nothing`,
          [s.puuid, s.game_name, s.tag_line, s.platform, s.updated_at],
        );
      }
      await tx.query(
        `insert into profiles (user_id, puuid, game_name, tag_line, platform, verified, created_at, updated_at)
         values ($1, $2, $3, $4, $5, false, $6, $6) on conflict (user_id) do nothing`,
        [opts.userId, owner?.puuid ?? null, owner?.game_name ?? null, owner?.tag_line ?? null, owner?.platform ?? "la1", now],
      );

      const matchById = new Map(matches.map((m) => [m.match_id, m]));
      let insertedMatches = 0;
      for (const m of matches) {
        const r = await tx.query(
          `insert into matches (match_id, platform, game_creation, game_duration_s, queue_id, patch, is_remake, inserted_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (match_id) do nothing returning match_id`,
          [m.match_id, owner?.platform ?? "la1", m.game_creation, m.game_duration_s, m.queue_id, m.patch, m.is_remake === 1, m.inserted_at],
        );
        insertedMatches += r.rows.length;
      }
      for (const p of parts) {
        const m = matchById.get(p.match_id);
        if (!m) continue;
        const s = byPuuid.get(p.puuid);
        await tx.query(
          `insert into match_participants (match_id, puuid, game_creation, queue_id, riot_id_game_name, riot_id_tag_line,
             champion_id, champion_name, team_id, team_position, win, kills, deaths, assists, cs_total, gold_earned,
             damage_to_champions, vision_score, control_wards_bought, team_kills, opponent_champion_id,
             opponent_champion_name, opponent_cs_total, cs_diff_10, max_cs_advantage, placement)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,null)
           on conflict (match_id, puuid) do nothing`,
          [p.match_id, p.puuid, m.game_creation, m.queue_id, s?.game_name ?? null, s?.tag_line ?? null,
            p.champion_id, p.champion_name, p.team_id, p.team_position, p.win === 1, p.kills, p.deaths, p.assists,
            p.cs_total, p.gold_earned, p.damage_to_champions, p.vision_score, p.control_wards_bought, p.team_kills,
            p.opponent_champion_id, p.opponent_champion_name, p.opponent_cs_total, p.cs_diff_10, p.max_cs_advantage],
        );
      }

      let insertedSnaps = 0;
      for (const s of snaps) {
        const queueId = QUEUE_BY_TYPE[s.queue_type];
        if (queueId === undefined) continue;
        const r = await tx.query(
          `insert into rank_snapshots (puuid, queue_id, taken_at, tier, division, lp, wins, losses)
           select $1, $2, $3, $4, $5, $6, $7, $8
           where not exists (select 1 from rank_snapshots where puuid = $1 and queue_id = $2 and taken_at = $3)
           returning id`,
          [s.puuid, queueId, s.taken_at, s.tier, s.division, s.lp, s.wins, s.losses],
        );
        insertedSnaps += r.rows.length;
      }

      let insertedJournal = 0;
      for (const j of journal) {
        if (!matchById.has(j.match_id)) continue;
        const r = await tx.query(
          `insert into journal_entries (user_id, match_id, death_reasons, lesson, tilt, updated_at)
           values ($1, $2, $3::jsonb, $4, $5, $6) on conflict (user_id, match_id) do nothing returning match_id`,
          [opts.userId, j.match_id, j.death_reasons || "[]", j.lesson, j.tilt, j.updated_at],
        );
        insertedJournal += r.rows.length;
      }
      return { matches: insertedMatches, journal: insertedJournal, snapshots: insertedSnaps };
    });
  } finally {
    lite.close();
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const userId = arg("--user-id") ?? arg("--user");
  if (!userId) throw new Error("usage: tsx scripts/import-sqlite.ts --user-id <uuid> [--sqlite data/climb.db]");
  const sqlitePath = path.resolve(arg("--sqlite") ?? process.env.CLIMB_DB_PATH ?? "data/climb.db");
  const url = process.env.DATABASE_URL;
  const db = url ? createPostgresDb(url) : await createPgliteDb(process.env.PGLITE_DIR ?? "data/pglite");
  try {
    if (!url) await runMigrations(db);
    const res = await importSqlite({ sqlitePath, userId, db });
    console.log(`imported: ${res.matches} matches, ${res.journal} journal entries, ${res.snapshots} rank snapshots`);
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "import failed");
    process.exitCode = 1;
  });
}
