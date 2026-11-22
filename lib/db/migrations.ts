/**
 * Ordered, append-only schema migrations. Owner: cobalt.
 * Applied inside one transaction per migration; version tracked with PRAGMA user_version.
 * NEVER edit a migration that has shipped — append a new one. Keep in sync with docs/ARCHITECTURE.md §3.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
CREATE TABLE summoner (
  puuid       TEXT PRIMARY KEY,
  game_name   TEXT NOT NULL,
  tag_line    TEXT NOT NULL,
  platform    TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_summoner_riot_id
  ON summoner (lower(game_name), lower(tag_line), platform);

CREATE TABLE matches (
  match_id         TEXT PRIMARY KEY,
  game_creation    INTEGER NOT NULL,
  game_duration_s  INTEGER NOT NULL CHECK (game_duration_s >= 0),
  queue_id         INTEGER NOT NULL,
  patch            TEXT NOT NULL,
  is_remake        INTEGER NOT NULL DEFAULT 0 CHECK (is_remake IN (0, 1)),
  raw_json         TEXT,
  inserted_at      INTEGER NOT NULL
);
CREATE INDEX ix_matches_queue_creation ON matches (queue_id, game_creation DESC);

CREATE TABLE match_participant (
  match_id                TEXT NOT NULL REFERENCES matches (match_id) ON DELETE CASCADE,
  puuid                   TEXT NOT NULL REFERENCES summoner (puuid) ON DELETE CASCADE,
  champion_id             INTEGER NOT NULL,
  champion_name           TEXT NOT NULL,
  team_id                 INTEGER NOT NULL CHECK (team_id IN (100, 200)),
  team_position           TEXT NOT NULL DEFAULT '',
  win                     INTEGER NOT NULL CHECK (win IN (0, 1)),
  kills                   INTEGER NOT NULL CHECK (kills >= 0),
  deaths                  INTEGER NOT NULL CHECK (deaths >= 0),
  assists                 INTEGER NOT NULL CHECK (assists >= 0),
  cs_total                INTEGER NOT NULL CHECK (cs_total >= 0),
  gold_earned             INTEGER NOT NULL,
  damage_to_champions     INTEGER NOT NULL,
  vision_score            INTEGER NOT NULL,
  control_wards_bought    INTEGER NOT NULL,
  team_kills              INTEGER NOT NULL,
  opponent_champion_id    INTEGER,
  opponent_champion_name  TEXT,
  opponent_cs_total       INTEGER,
  cs_diff_10              INTEGER,
  max_cs_advantage        INTEGER,
  PRIMARY KEY (match_id, puuid)
);
CREATE INDEX ix_mp_puuid_champion  ON match_participant (puuid, champion_name);
CREATE INDEX ix_mp_puuid_opponent  ON match_participant (puuid, opponent_champion_name);

CREATE TABLE rank_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  puuid       TEXT NOT NULL REFERENCES summoner (puuid) ON DELETE CASCADE,
  taken_at    INTEGER NOT NULL,
  queue_type  TEXT NOT NULL DEFAULT 'RANKED_SOLO_5x5',
  tier        TEXT,
  division    TEXT,
  lp          INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_rank_snapshots_puuid_taken ON rank_snapshots (puuid, queue_type, taken_at);

CREATE TABLE journal_entries (
  match_id       TEXT PRIMARY KEY REFERENCES matches (match_id) ON DELETE CASCADE,
  death_reasons  TEXT NOT NULL DEFAULT '[]',
  lesson         TEXT NOT NULL DEFAULT '',
  tilt           INTEGER CHECK (tilt IS NULL OR tilt BETWEEN 1 AND 5),
  updated_at     INTEGER NOT NULL
);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
`,
  },
];
