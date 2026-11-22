-- RLS. Owner: quartz. Portable part: RLS ON everywhere with NO policies, so the PostgREST roles
-- (anon / authenticated via supabase-js) can read or write nothing. The only data path is the
-- server over DATABASE_URL (table owner → bypasses RLS); repositories scope every query by user_id/puuid.
alter table profiles enable row level security;
alter table summoners enable row level security;
alter table matches enable row level security;
alter table match_participants enable row level security;
alter table journal_entries enable row level security;
alter table rank_snapshots enable row level security;
alter table sync_state enable row level security;
alter table rate_limit_buckets enable row level security;
alter table schema_migrations enable row level security;

-- Supabase-only: profiles → auth.users (cascade on auth user deletion). No-op on PGlite.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users')
     and not exists (select 1 from pg_constraint where conname = 'profiles_user_fk') then
    execute 'alter table profiles add constraint profiles_user_fk foreign key (user_id) references auth.users (id) on delete cascade';
  end if;
end $$;
