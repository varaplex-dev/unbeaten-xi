-- 14-0 — enable live Head-to-Head sync.
--
-- Run this in the Supabase SQL Editor. Safe to run repeatedly.
--
-- The H2H client subscribes to postgres_changes (UPDATE) on h2h_matches so
-- both players see each spin, pick, trade and ready-up in real time (see
-- src/lib/h2h/useH2HMatch.ts). postgres_changes only fires for tables that
-- belong to the `supabase_realtime` publication, and new tables are NOT added
-- to it automatically — so without this, the turn simply never advances on the
-- other player's screen until they manually refresh.
--
-- Realtime still respects RLS: a client only receives row changes it could
-- SELECT, and the h2h_matches select policy limits that to the two
-- participants, so no one eavesdrops on someone else's match.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'h2h_matches'
  ) then
    alter publication supabase_realtime add table public.h2h_matches;
  end if;
end $$;

-- Verify — expect one row: supabase_realtime | public | h2h_matches
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'h2h_matches';
