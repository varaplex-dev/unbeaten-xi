-- 14-0 — COMPLETE backend setup, in one idempotent file.
--
-- Run this once in the Supabase SQL Editor. It is safe to run repeatedly and
-- safe whether or not you have run any earlier schema file: every table uses
-- `create table if not exists`, every policy is dropped before it is created,
-- and functions/views use `create or replace`. It supersedes schema.sql +
-- h2h_schema.sql + h2h_schema_migrate.sql for a first-time setup — it builds
-- the accounts/leaderboard tables AND the Head-to-Head tables, with the
-- ladder-forgery security fix already applied.
--
-- After it runs, scroll to the bottom result grid: it lists the four newest
-- h2h_matches columns as a sanity check.

-- ═════════════════════════════════════════════════════════════════════════
-- profiles — one row per signed-in user (public display name for boards).
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile the moment someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'player_' || substr(new.id::text, 1, 8))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill a profile for any user who signed up before this trigger existed,
-- so the ladder's inner join to profiles never drops an existing player.
insert into public.profiles (id, username)
select u.id, 'player_' || substr(u.id::text, 1, 8)
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ═════════════════════════════════════════════════════════════════════════
-- season_results — one row per completed single-player season.
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.season_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('fictional', 'all-time-real')),
  -- Which real competition this season was played as — each gets its own
  -- leaderboard, since a 9-match World Cup and a 14-match league can't be
  -- ranked against each other by raw wins. Mirrors CompetitionId in
  -- src/lib/engine/competitions.ts.
  competition text not null default 'league-major'
    check (competition in ('league-major', 'league-short', 'world-cup')),
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

drop policy if exists "season results are publicly readable" on public.season_results;
create policy "season results are publicly readable"
  on public.season_results for select using (true);

drop policy if exists "users can insert their own season results" on public.season_results;
create policy "users can insert their own season results"
  on public.season_results for insert with check (auth.uid() = user_id);

drop policy if exists "users can delete their own season results" on public.season_results;
create policy "users can delete their own season results"
  on public.season_results for delete using (auth.uid() = user_id);

create unique index if not exists season_results_one_daily_per_user
  on public.season_results (user_id, seed) where is_daily;
create index if not exists season_results_leaderboard
  on public.season_results (competition, mode, wins desc, losses asc, team_rating_out_of_100 desc);
create index if not exists season_results_user_history
  on public.season_results (user_id, created_at desc);

-- Best season per user, split by competition + mode + daily/free, ranked by
-- Season Points. Each competition is its own board (a 9-match World Cup and a
-- 14-match league can't be compared by raw wins). The points expression
-- mirrors seasonPoints() in src/lib/engine/seasonPoints.ts EXACTLY — keep them
-- identical: wins*100 + (undefeated ? 250 : 0) + clamp(round(nrr*15), -45, 45),
-- floored at 0. The cap sits below one win, so record always outranks
-- dominance.
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

-- ═════════════════════════════════════════════════════════════════════════
-- h2h_matches — one row per online Head-to-Head room.
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.h2h_matches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting'
    check (status in ('waiting', 'drafting', 'trading', 'completed', 'abandoned')),
  host_id uuid not null references auth.users (id) on delete cascade,
  guest_id uuid references auth.users (id) on delete set null,
  seed text not null,
  host_rating int not null default 0,
  turn text not null default 'host' check (turn in ('host', 'guest')),
  host_picks jsonb not null default '[]',
  guest_picks jsonb not null default '[]',
  used_team_eras jsonb not null default '[]',
  trade_offer jsonb,
  host_ready boolean not null default false,
  guest_ready boolean not null default false,
  winner_id uuid references auth.users (id) on delete set null,
  result jsonb,
  -- Each player's independently-computed result; the match finalizes only
  -- when the two agree (see h2h_submit_result below), else `disputed`.
  host_report jsonb,
  guest_report jsonb,
  disputed boolean not null default false,
  -- How each player arranged their XI on the team-setup step (batting order,
  -- captain, keeper, fielding). Feeds the season sim; null → a default lineup.
  host_lineup jsonb,
  guest_lineup jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table pre-existed, add the finalization + lineup columns.
alter table public.h2h_matches add column if not exists host_report jsonb;
alter table public.h2h_matches add column if not exists guest_report jsonb;
alter table public.h2h_matches add column if not exists disputed boolean not null default false;
alter table public.h2h_matches add column if not exists host_lineup jsonb;
alter table public.h2h_matches add column if not exists guest_lineup jsonb;

alter table public.h2h_matches enable row level security;

drop policy if exists "waiting or own matches are readable" on public.h2h_matches;
create policy "waiting or own matches are readable"
  on public.h2h_matches for select
  using (status = 'waiting' or auth.uid() = host_id or auth.uid() = guest_id);

drop policy if exists "users can create their own match" on public.h2h_matches;
create policy "users can create their own match"
  on public.h2h_matches for insert with check (auth.uid() = host_id);

-- The `status = 'waiting' and guest_id is null` arm lets a second player CLAIM
-- an open room (set themselves as guest) — without it, RLS denies the join
-- because at claim time the joiner is neither host nor the (still null) guest,
-- so no one could ever connect. WITH CHECK keeps them honest: after the update
-- they must be a participant, so you can only claim a room by putting yourself
-- in it, never on another player's behalf, and never hijack a started match.
drop policy if exists "participants can update their match" on public.h2h_matches;
create policy "participants can update their match"
  on public.h2h_matches for update
  using (
    auth.uid() = host_id
    or auth.uid() = guest_id
    or (status = 'waiting' and guest_id is null)
  )
  with check (auth.uid() = host_id or auth.uid() = guest_id);

create index if not exists h2h_matches_open
  on public.h2h_matches (status, created_at desc);

-- Live sync: the client subscribes to postgres_changes on h2h_matches so both
-- players see each turn advance in real time. New tables aren't in the
-- realtime publication by default, so add it (idempotently). Realtime still
-- respects RLS — only the two participants receive a match's changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'h2h_matches'
  ) then
    alter publication supabase_realtime add table public.h2h_matches;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════
-- h2h_results — two rows per completed match, the ladder source.
-- The insert policy is the SECURE version: a row is only accepted for a match
-- that is actually 'completed', that you played in, naming the real opponent.
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.h2h_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.h2h_matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  opponent_id uuid not null references auth.users (id) on delete cascade,
  won boolean not null,
  points int not null check (points between 0 and 4),
  runs_for int not null,
  runs_against int not null,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);

-- If the table pre-exists with the old `points >= 0` check, tighten it.
alter table public.h2h_results drop constraint if exists h2h_results_points_check;
alter table public.h2h_results
  add constraint h2h_results_points_check check (points between 0 and 4);

alter table public.h2h_results enable row level security;

drop policy if exists "h2h results are publicly readable" on public.h2h_results;
create policy "h2h results are publicly readable"
  on public.h2h_results for select using (true);

-- NO client insert policy. Results are written only by h2h_submit_result()
-- below (SECURITY DEFINER, so it writes as the table owner and bypasses RLS).
-- With RLS on and no insert policy the default is deny, which closes the
-- ladder-forgery hole entirely — a client can no longer POST its own row.
drop policy if exists "users can insert their own h2h result" on public.h2h_results;
drop policy if exists "participants can insert their own h2h result" on public.h2h_results;

create index if not exists h2h_results_user on public.h2h_results (user_id);

-- Live online ladder.
create or replace view public.h2h_ladder as
select
  r.user_id, p.username,
  count(*) as played,
  count(*) filter (where r.won) as wins,
  count(*) filter (where not r.won) as losses,
  sum(r.points) as points,
  sum(r.runs_for - r.runs_against) as run_diff
from public.h2h_results r
join public.profiles p on p.id = r.user_id
group by r.user_id, p.username
order by points desc, wins desc, run_diff desc;

-- ═════════════════════════════════════════════════════════════════════════
-- Server-authoritative finalization (peer-agreement).
--
-- winner_id / result / disputed / *_report and the transition to 'completed'
-- are writable ONLY through h2h_submit_result(). A guard trigger blocks every
-- direct client write to those columns; ordinary draft/trade/ready writes
-- never touch them and pass through. Both clients run the deterministic engine
-- and submit their result; the match finalizes (and awards points, derived
-- here — never trusted from the client) only when the two agree, else it is
-- marked `disputed` with no points. See supabase/h2h_finalize.sql for the full
-- rationale.
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.h2h_matches_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('h2h.finalizing', true), '') = 'on' then
    return new;
  end if;
  if new.winner_id is distinct from old.winner_id
     or new.result       is distinct from old.result
     or new.disputed     is distinct from old.disputed
     or new.host_report  is distinct from old.host_report
     or new.guest_report is distinct from old.guest_report
     or (new.status = 'completed' and old.status <> 'completed') then
    raise exception
      'h2h: winner/result/report fields are set only by h2h_submit_result()';
  end if;
  return new;
end;
$$;

drop trigger if exists h2h_matches_guard_trg on public.h2h_matches;
create trigger h2h_matches_guard_trg
  before update on public.h2h_matches
  for each row execute function public.h2h_matches_guard();

create or replace function public.h2h_submit_result(
  p_match_id   uuid,
  p_host_score int,
  p_guest_score int,
  p_winner     text,
  p_margin     int
)
returns public.h2h_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_match      public.h2h_matches;
  v_side       text;
  v_report     jsonb;
  v_other      jsonb;
  v_winner     text;
  v_margin     int;
  v_host_score int;
  v_guest_score int;
  v_host_won   boolean;
  v_winner_pts int;
  v_loser_pts  int;
begin
  if v_uid is null then
    raise exception 'h2h: authentication required';
  end if;
  if p_winner not in ('host', 'guest') then
    raise exception 'h2h: winner must be host or guest';
  end if;

  select * into v_match from public.h2h_matches where id = p_match_id for update;
  if not found then
    raise exception 'h2h: match not found';
  end if;
  if v_match.status = 'completed' then
    return v_match;
  end if;

  if v_match.host_id = v_uid then
    v_side := 'host';
  elsif v_match.guest_id = v_uid then
    v_side := 'guest';
  else
    raise exception 'h2h: not a participant in this match';
  end if;

  if v_match.status <> 'trading' or not (v_match.host_ready and v_match.guest_ready) then
    raise exception 'h2h: match is not ready to finalize';
  end if;

  v_report := jsonb_build_object(
    'hostScore', p_host_score, 'guestScore', p_guest_score,
    'winner', p_winner, 'margin', p_margin
  );

  perform set_config('h2h.finalizing', 'on', true);

  if v_side = 'host' then
    v_other := v_match.guest_report;
    update public.h2h_matches set host_report = v_report, updated_at = now()
      where id = p_match_id;
  else
    v_other := v_match.host_report;
    update public.h2h_matches set guest_report = v_report, updated_at = now()
      where id = p_match_id;
  end if;

  if v_other is null then
    select * into v_match from public.h2h_matches where id = p_match_id;
    return v_match;
  end if;

  if v_report <> v_other then
    update public.h2h_matches
      set status = 'completed', disputed = true, result = null, winner_id = null,
          updated_at = now()
      where id = p_match_id
      returning * into v_match;
    return v_match;
  end if;

  v_winner      := v_report->>'winner';
  v_margin      := (v_report->>'margin')::int;
  v_host_score  := (v_report->>'hostScore')::int;
  v_guest_score := (v_report->>'guestScore')::int;
  v_host_won    := (v_winner = 'host');
  -- Season-win margins: dominant win at ≥5, consolation point within 1.
  v_winner_pts  := 3 + case when v_margin >= 5 then 1 else 0 end;
  v_loser_pts   := case when v_margin <= 1 then 1 else 0 end;

  update public.h2h_matches
    set status = 'completed', disputed = false,
        winner_id = case when v_host_won then host_id else guest_id end,
        result = jsonb_build_object(
          'hostScore', v_host_score, 'guestScore', v_guest_score,
          'winner', v_winner, 'margin', v_margin
        ),
        updated_at = now()
    where id = p_match_id
    returning * into v_match;

  insert into public.h2h_results
    (match_id, user_id, opponent_id, won, points, runs_for, runs_against)
  values
    (p_match_id, v_match.host_id, v_match.guest_id, v_host_won,
      case when v_host_won then v_winner_pts else v_loser_pts end,
      v_host_score, v_guest_score),
    (p_match_id, v_match.guest_id, v_match.host_id, not v_host_won,
      case when v_host_won then v_loser_pts else v_winner_pts end,
      v_guest_score, v_host_score)
  on conflict (match_id, user_id) do nothing;

  return v_match;
end;
$$;

revoke all on function public.h2h_submit_result(uuid, int, int, text, int) from public;
grant execute on function public.h2h_submit_result(uuid, int, int, text, int) to authenticated, anon;

-- ═════════════════════════════════════════════════════════════════════════
-- tournaments / entrants / matches — playoff bracket (read-only to clients).
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'seeding'
    check (status in ('seeding', 'in_progress', 'completed')),
  size int not null check (size in (4, 8)),
  champion_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_entrants (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seed int not null check (seed >= 1),
  primary key (tournament_id, user_id)
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round int not null check (round >= 1),
  high_seed_user uuid references auth.users (id) on delete set null,
  low_seed_user uuid references auth.users (id) on delete set null,
  winner_id uuid references auth.users (id) on delete set null,
  h2h_match_id uuid references public.h2h_matches (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;
alter table public.tournament_entrants enable row level security;
alter table public.tournament_matches enable row level security;

drop policy if exists "tournaments are publicly readable" on public.tournaments;
create policy "tournaments are publicly readable"
  on public.tournaments for select using (true);
drop policy if exists "tournament entrants are publicly readable" on public.tournament_entrants;
create policy "tournament entrants are publicly readable"
  on public.tournament_entrants for select using (true);
drop policy if exists "tournament matches are publicly readable" on public.tournament_matches;
create policy "tournament matches are publicly readable"
  on public.tournament_matches for select using (true);

-- ═════════════════════════════════════════════════════════════════════════
-- Sanity check — expect four rows.
-- ═════════════════════════════════════════════════════════════════════════
select c.column_name, c.data_type, c.column_default
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'h2h_matches'
  and c.column_name in ('host_rating', 'trade_offer', 'host_ready', 'guest_ready')
order by c.column_name;
