-- Climb Tracker v2 schema. Owner: quartz. PORTABLE: must run unchanged on Supabase Postgres AND PGlite.
-- Supabase-only statements (auth schema) live in 0002 inside guarded DO blocks.
-- Timestamps are epoch milliseconds (bigint) so lib/types domain shapes stay unchanged.

create table if not exists schema_migrations (
  name text primary key,
  applied_at bigint not null
);

-- One linked Riot account per app user. user_id = auth.users.id (FK added in 0002 on Supabase).
create table if not exists profiles (
  user_id uuid primary key,
  puuid text,
  game_name text,
  tag_line text,
  platform text not null default 'la1',
  verified boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists profiles_puuid_idx on profiles (puuid);
-- A PUUID can be claimed as verified (RSO) by at most one user.
create unique index if not exists profiles_verified_puuid_uq on profiles (puuid) where verified;

-- Shared cache of Riot accounts (tracked users, public search).
create table if not exists summoners (
  puuid text primary key,
  game_name text not null,
  tag_line text not null,
  platform text not null,
  updated_at bigint not null
);
create index if not exists summoners_riot_id_idx on summoners (lower(game_name), lower(tag_line));

-- Shared: one row per match, all queues. No raw_json in v2 (Supabase storage budget).
create table if not exists matches (
  match_id text primary key,
  platform text not null,
  game_creation bigint not null,
  game_duration_s integer not null,
  queue_id integer not null,
  patch text not null,
  is_remake boolean not null default false,
  inserted_at bigint not null
);

-- Shared: one row per (match, player). Sync stores ALL 10 participants (Arena: all 16).
-- game_creation / queue_id are denormalized for per-player list queries.
create table if not exists match_participants (
  match_id text not null references matches (match_id) on delete cascade,
  puuid text not null,
  game_creation bigint not null,
  queue_id integer not null,
  riot_id_game_name text,
  riot_id_tag_line text,
  champion_id integer not null,
  champion_name text not null,
  team_id integer not null,
  team_position text not null default '',
  win boolean not null,
  kills integer not null,
  deaths integer not null,
  assists integer not null,
  cs_total integer not null,
  gold_earned integer not null,
  damage_to_champions integer not null,
  vision_score integer not null,
  control_wards_bought integer not null,
  team_kills integer not null,
  opponent_champion_id integer,
  opponent_champion_name text,
  opponent_cs_total integer,
  cs_diff_10 double precision,
  max_cs_advantage double precision,
  placement integer, -- Arena only (1..8)
  primary key (match_id, puuid)
);
create index if not exists mp_puuid_creation_idx on match_participants (puuid, game_creation desc);
create index if not exists mp_puuid_queue_creation_idx on match_participants (puuid, queue_id, game_creation desc);

-- Private per user.
create table if not exists journal_entries (
  user_id uuid not null references profiles (user_id) on delete cascade,
  match_id text not null references matches (match_id) on delete cascade,
  death_reasons jsonb not null default '[]'::jsonb,
  lesson text not null default '',
  tilt smallint check (tilt between 1 and 5),
  updated_at bigint not null,
  primary key (user_id, match_id)
);

-- Shared per PUUID; one LP history per ranked queue; written only when rank changed.
create table if not exists rank_snapshots (
  id bigint generated always as identity primary key,
  puuid text not null,
  queue_id integer not null check (queue_id in (420, 440)),
  taken_at bigint not null,
  tier text,
  division text,
  lp integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0
);
create index if not exists rank_snapshots_puuid_queue_idx on rank_snapshots (puuid, queue_id, taken_at desc);

-- Shared per PUUID: resumable batched sync.
create table if not exists sync_state (
  puuid text primary key,
  pending_match_ids text[] not null default '{}', -- discovered, not yet fetched (newest first)
  backfill_start integer default 0,                -- match-v5 ids `start` for older history; null = done
  last_sync_at bigint,
  cooldown_until bigint not null default 0,        -- next allowed sync (2-min cooldown)
  lease_until bigint not null default 0,           -- cross-instance lock for a running batch
  last_error_code text,
  last_error_at bigint,
  updated_at bigint not null
);

-- Fixed-window counters shared by all serverless instances
-- (keys: 'riot:americas:1s', 'riot:la1:120s', 'ip:search:<sha256(ip)>', ...).
create table if not exists rate_limit_buckets (
  key text primary key,
  window_start bigint not null,
  count integer not null
);
