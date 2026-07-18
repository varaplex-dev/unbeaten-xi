-- 14-0: Build the Unbeaten XI — accounts, history, leaderboards schema.
--
-- This app has no backend of its own; Supabase is used only for auth +
-- Postgres storage. Nothing here is applied automatically. To use it:
--   1. Create a project at supabase.com (free tier is enough to start).
--   2. Open the SQL Editor in that project and run this whole file once.
--   3. Copy the project URL and anon key into 14-0/.env.local as
--      NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
-- If those env vars are never set, the app continues to work exactly as
-- it does today (local-only, no accounts) — this schema is additive.

-- ─────────────────────────────────────────────────────────────────────────
-- profiles
--
-- One row per signed-in user, keyed to Supabase's built-in auth.users.
-- Holds the public display name shown on leaderboards, since we never want
-- to expose a user's email there.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row (with a throwaway-but-unique username derived
-- from the new user's id) the moment someone signs up, so every auth.users
-- row always has a matching profiles row. Users can rename it later from
-- account settings — this trigger only guarantees one exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'player_' || substr(new.id::text, 1, 8));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- season_results
--
-- One row per completed season (i.e. once simulateSeason() returns final
-- stats). Key sortable fields are flattened into real columns for cheap
-- leaderboard queries; the full match-by-match and draft detail is kept as
-- jsonb so the history/profile page can render a complete replay without a
-- second table. Rows are immutable once written — a season's record never
-- changes after the fact, so no update policy is defined.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.season_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('fictional', 'all-time-real')),
  is_daily boolean not null default false,
  seed text not null,
  wins int not null check (wins >= 0),
  losses int not null check (losses >= 0),
  team_rating_out_of_100 int not null,
  net_run_rate numeric not null,
  unbeaten boolean generated always as (losses = 0) stored,
  draft_picks jsonb not null,
  match_results jsonb not null,
  season_stats jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.season_results enable row level security;

create policy "season results are publicly readable"
  on public.season_results for select
  using (true);

create policy "users can insert their own season results"
  on public.season_results for insert
  with check (auth.uid() = user_id);

create policy "users can delete their own season results"
  on public.season_results for delete
  using (auth.uid() = user_id);

-- Daily Challenge has one canonical seed per day (see todaySeedString() in
-- src/lib/engine/rng.ts) — stop a user from submitting the same day's
-- challenge twice so the daily leaderboard can't be gamed by resubmitting.
create unique index if not exists season_results_one_daily_per_user
  on public.season_results (user_id, seed)
  where is_daily;

-- Leaderboard queries filter by mode and sort by record; this index makes
-- both the global and daily-mode leaderboard fast without a full scan.
create index if not exists season_results_leaderboard
  on public.season_results (mode, wins desc, losses asc, team_rating_out_of_100 desc);

create index if not exists season_results_user_history
  on public.season_results (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- leaderboard view
--
-- Each user's single best season per (mode, is_daily) combination — kept
-- separate because the Daily Challenge uses one fixed seed shared by every
-- player that day (a fair head-to-head comparison), while a free draft in
-- the same mode lets each player pick their own dream team (a much easier
-- road to 14-0). Mixing the two into one ranking would let free-draft runs
-- crowd out genuinely hard-earned Daily Challenge results. Best is defined
-- as wins desc, then fewest losses, then highest team rating as a
-- tiebreaker. The app queries this view directly rather than reimplementing
-- "best result per user" in application code.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.leaderboard as
select distinct on (sr.user_id, sr.mode, sr.is_daily)
  sr.id,
  sr.user_id,
  p.username,
  sr.mode,
  sr.is_daily,
  sr.wins,
  sr.losses,
  sr.unbeaten,
  sr.team_rating_out_of_100,
  sr.net_run_rate,
  sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
order by sr.user_id, sr.mode, sr.is_daily, sr.wins desc, sr.losses asc, sr.team_rating_out_of_100 desc, sr.created_at asc;

-- ─────────────────────────────────────────────────────────────────────────
-- weekly_leaderboard view
--
-- Same "best season per user" shape as the leaderboard view above, but
-- scoped to results from the current calendar week (Monday-Sunday, per
-- Postgres's date_trunc('week', ...)) and to the free-draft All-Time XI
-- mode only — the mode people actually replay often enough for a
-- resetting weekly board to be meaningful. Being a plain view (not
-- materialized), "this week" is evaluated fresh on every query, so it
-- rolls over automatically at the week boundary with no cron job needed.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.weekly_leaderboard as
select distinct on (sr.user_id, sr.mode, sr.is_daily)
  sr.id,
  sr.user_id,
  p.username,
  sr.mode,
  sr.is_daily,
  sr.wins,
  sr.losses,
  sr.unbeaten,
  sr.team_rating_out_of_100,
  sr.net_run_rate,
  sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
where sr.created_at >= date_trunc('week', now())
  and sr.mode = 'all-time-real'
  and sr.is_daily = false
order by sr.user_id, sr.mode, sr.is_daily, sr.wins desc, sr.losses asc, sr.team_rating_out_of_100 desc, sr.created_at asc;

-- ─────────────────────────────────────────────────────────────────────────
-- monthly_leaderboard view
--
-- Same shape and reasoning as weekly_leaderboard, scoped to the current
-- calendar month (date_trunc('month', now())) instead of the current week.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.monthly_leaderboard as
select distinct on (sr.user_id, sr.mode, sr.is_daily)
  sr.id,
  sr.user_id,
  p.username,
  sr.mode,
  sr.is_daily,
  sr.wins,
  sr.losses,
  sr.unbeaten,
  sr.team_rating_out_of_100,
  sr.net_run_rate,
  sr.created_at
from public.season_results sr
join public.profiles p on p.id = sr.user_id
where sr.created_at >= date_trunc('month', now())
  and sr.mode = 'all-time-real'
  and sr.is_daily = false
order by sr.user_id, sr.mode, sr.is_daily, sr.wins desc, sr.losses asc, sr.team_rating_out_of_100 desc, sr.created_at asc;
