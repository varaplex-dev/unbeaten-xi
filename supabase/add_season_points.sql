-- 14-0 — points-based leaderboards.
--
-- Run this in the Supabase SQL Editor. Safe to run repeatedly. Requires the
-- `competition` column (run add_competition_column.sql first if you haven't).
--
-- Ranks each board by a single Season Points score instead of a raw
-- wins/losses sort. The formula mirrors seasonPoints() in
-- src/lib/engine/seasonPoints.ts EXACTLY — if you change one, change both:
--
--   points = wins * 100
--          + (undefeated ? 250 : 0)          -- perfect-season premium
--          + clamp(round(net_run_rate * 15), -45, 45)   -- dominance, capped
--          , floored at 0
--
-- The +/-45 dominance cap sits below the 100 for a win, so however dominant a
-- season is it can never outrank a better record — record first, perfection
-- premium, dominance only as a within-record tiebreaker.
--
-- Views can't gain a column via create-or-replace, so they're dropped and
-- recreated. Dropping a view destroys no data — they're plain views over
-- season_results.

drop view if exists public.leaderboard;
create view public.leaderboard as
select distinct on (sr.user_id, sr.competition, sr.mode, sr.is_daily)
  sr.id, sr.user_id, p.username, sr.competition, sr.mode, sr.is_daily,
  sr.wins, sr.losses, sr.unbeaten, sr.team_rating_out_of_100, sr.net_run_rate,
  greatest(0,
    sr.wins * 100
    + case when sr.losses = 0 and sr.wins > 0 then 250 else 0 end
    + greatest(-45, least(45, round(sr.net_run_rate * 15)))
  )::int as points,
  sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
order by sr.user_id, sr.competition, sr.mode, sr.is_daily, points desc, sr.created_at asc;

drop view if exists public.weekly_leaderboard;
create view public.weekly_leaderboard as
select distinct on (sr.user_id, sr.competition, sr.mode, sr.is_daily)
  sr.id, sr.user_id, p.username, sr.competition, sr.mode, sr.is_daily,
  sr.wins, sr.losses, sr.unbeaten, sr.team_rating_out_of_100, sr.net_run_rate,
  greatest(0,
    sr.wins * 100
    + case when sr.losses = 0 and sr.wins > 0 then 250 else 0 end
    + greatest(-45, least(45, round(sr.net_run_rate * 15)))
  )::int as points,
  sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
where sr.created_at >= date_trunc('week', now())
  and sr.mode = 'all-time-real' and sr.is_daily = false
order by sr.user_id, sr.competition, sr.mode, sr.is_daily, points desc, sr.created_at asc;

drop view if exists public.monthly_leaderboard;
create view public.monthly_leaderboard as
select distinct on (sr.user_id, sr.competition, sr.mode, sr.is_daily)
  sr.id, sr.user_id, p.username, sr.competition, sr.mode, sr.is_daily,
  sr.wins, sr.losses, sr.unbeaten, sr.team_rating_out_of_100, sr.net_run_rate,
  greatest(0,
    sr.wins * 100
    + case when sr.losses = 0 and sr.wins > 0 then 250 else 0 end
    + greatest(-45, least(45, round(sr.net_run_rate * 15)))
  )::int as points,
  sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
where sr.created_at >= date_trunc('month', now())
  and sr.mode = 'all-time-real' and sr.is_daily = false
order by sr.user_id, sr.competition, sr.mode, sr.is_daily, points desc, sr.created_at asc;

-- Sanity check — a perfect 14-0 with a +2.0 net run rate should score 1680.
select greatest(0, 14 * 100 + 250 + greatest(-45, least(45, round(2.0 * 15))))::int as example_14_0_points;
