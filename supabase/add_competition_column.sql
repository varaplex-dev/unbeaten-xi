-- 14-0 — separate leaderboards per competition.
--
-- Run this in the Supabase SQL Editor. Safe to run repeatedly.
--
-- Why: season_results had no idea WHICH competition a season was played as,
-- so a 9-match World Cup Run and a 14-match League Season shared one board
-- ranked by wins. A World Cup tops out at 9 wins, so a *perfect* World Cup
-- ranked below any 10-win league run — World Cup results were effectively
-- invisible. This adds the column and exposes it on the leaderboard views so
-- each competition gets its own board.
--
-- Existing rows: every season played before now was a league campaign (World
-- Cup Run only became playable with the competition system), so the default
-- backfills them correctly.

alter table public.season_results
  add column if not exists competition text not null default 'league-major';

-- Keep in sync with CompetitionId in src/lib/engine/competitions.ts.
alter table public.season_results
  drop constraint if exists season_results_competition_check;
alter table public.season_results
  add constraint season_results_competition_check
  check (competition in ('league-major', 'league-short', 'world-cup'));

-- Boards are filtered by competition, so index it alongside the existing
-- ranking columns.
drop index if exists season_results_leaderboard;
create index if not exists season_results_leaderboard
  on public.season_results (competition, mode, wins desc, losses asc, team_rating_out_of_100 desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Views must expose `competition` so the app can filter per board.
-- `create or replace view` cannot add a column to an existing view, so these
-- are dropped first. Dropping a view destroys no data — they are plain views
-- over season_results.
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.leaderboard;
create view public.leaderboard as
select distinct on (sr.user_id, sr.competition, sr.mode, sr.is_daily)
  sr.id, sr.user_id, p.username, sr.competition, sr.mode, sr.is_daily,
  sr.wins, sr.losses, sr.unbeaten, sr.team_rating_out_of_100,
  sr.net_run_rate, sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
order by sr.user_id, sr.competition, sr.mode, sr.is_daily,
         sr.wins desc, sr.losses asc, sr.team_rating_out_of_100 desc, sr.created_at asc;

drop view if exists public.weekly_leaderboard;
create view public.weekly_leaderboard as
select distinct on (sr.user_id, sr.competition, sr.mode, sr.is_daily)
  sr.id, sr.user_id, p.username, sr.competition, sr.mode, sr.is_daily,
  sr.wins, sr.losses, sr.unbeaten, sr.team_rating_out_of_100,
  sr.net_run_rate, sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
where sr.created_at >= date_trunc('week', now())
  and sr.mode = 'all-time-real' and sr.is_daily = false
order by sr.user_id, sr.competition, sr.mode, sr.is_daily,
         sr.wins desc, sr.losses asc, sr.team_rating_out_of_100 desc, sr.created_at asc;

drop view if exists public.monthly_leaderboard;
create view public.monthly_leaderboard as
select distinct on (sr.user_id, sr.competition, sr.mode, sr.is_daily)
  sr.id, sr.user_id, p.username, sr.competition, sr.mode, sr.is_daily,
  sr.wins, sr.losses, sr.unbeaten, sr.team_rating_out_of_100,
  sr.net_run_rate, sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
where sr.created_at >= date_trunc('month', now())
  and sr.mode = 'all-time-real' and sr.is_daily = false
order by sr.user_id, sr.competition, sr.mode, sr.is_daily,
         sr.wins desc, sr.losses asc, sr.team_rating_out_of_100 desc, sr.created_at asc;

-- Sanity check — expect one row: competition | text | 'league-major'::text
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'season_results'
  and column_name = 'competition';
