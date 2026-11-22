-- Extra indexes. Owner: quartz. Portable (Supabase + PGlite), idempotent.
-- (puuid, game_creation desc) lives in 0001 (mp_puuid_creation_idx). Journal by user is served by
-- its PK (user_id, match_id); the FK on match_id needs its own index for cascades.
create index if not exists matches_queue_idx on matches (queue_id);
create index if not exists journal_entries_match_idx on journal_entries (match_id);
create index if not exists journal_entries_user_updated_idx on journal_entries (user_id, updated_at desc);
