/** Owner: cobalt. */
import type { Db } from "@/lib/db/connection";
import type { Summoner, SummonerRow } from "@/lib/types";

export function upsertSummoner(db: Db, summoner: Summoner): void {
  db.transaction(() => {
    // A Riot ID can move to another puuid (account transfer); free the unique (name, tag, platform) slot first.
    db.prepare(
      `DELETE FROM summoner
        WHERE lower(game_name) = lower(?) AND lower(tag_line) = lower(?) AND platform = ? AND puuid <> ?
          AND NOT EXISTS (SELECT 1 FROM match_participant mp WHERE mp.puuid = summoner.puuid)`,
    ).run(summoner.gameName, summoner.tagLine, summoner.platform, summoner.puuid);
    db.prepare(
      `INSERT INTO summoner (puuid, game_name, tag_line, platform, updated_at)
       VALUES (@puuid, @gameName, @tagLine, @platform, @updatedAt)
       ON CONFLICT(puuid) DO UPDATE SET
         game_name = excluded.game_name, tag_line = excluded.tag_line,
         platform = excluded.platform, updated_at = excluded.updated_at`,
    ).run(summoner);
  })();
}

export function getSummonerByPuuid(db: Db, puuid: string): Summoner | null {
  const row = db.prepare("SELECT * FROM summoner WHERE puuid = ?").get(puuid) as SummonerRow | undefined;
  if (!row) return null;
  return {
    puuid: row.puuid,
    gameName: row.game_name,
    tagLine: row.tag_line,
    platform: row.platform,
    updatedAt: row.updated_at,
  };
}
