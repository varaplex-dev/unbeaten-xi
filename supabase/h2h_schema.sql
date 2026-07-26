-- 14-0: Head-to-Head online mode — match rooms, results ladder, tournaments.
--
-- Additive to schema.sql (run that first). Like the rest of this project's
-- Supabase usage, nothing here is applied automatically — run this whole
-- file once in the SQL Editor of your project. If Supabase is unconfigured
-- the app degrades gracefully and Head-to-Head simply isn't offered.
--
-- ⚠ THIS FILE IS FOR A FRESH INSTALL ONLY. It cannot upgrade an existing one:
-- `create table if not exists` will not add columns to a table that already
-- exists, and Postgres has no `create policy if not exists`, so re-running
-- this against an older install adds nothing and then aborts on the first
-- policy. If you have already run any version of this file, run
-- `h2h_schema_migrate.sql` instead — it is idempotent and verifies itself.
--
-- Turn authority note: the per-turn draft writes below are guarded by RLS to
-- the two participants, but strict "only the player whose turn it is may
-- commit a pick" enforcement is intended to move into a SECURITY DEFINER RPC
-- (h2h_commit_pick) once the realtime client is built, so a turn can be
-- validated + advanced atomically. The table shape here already supports it.

-- ─────────────────────────────────────────────────────────────────────────
-- h2h_matches
--
-- One row per online match room. Two players alternate spinning onto a real
-- team/era and drafting one player each turn; `used_team_eras` is the shared
-- exclusion list that enforces "no duplicate player, and a team/era already
-- drafted from can't hand the same player to the opponent". The match seed
-- makes every spin and the final simulation deterministic, so both clients
-- agree without a server round-trip per action.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.h2h_matches (
  id uuid primary key default gen_random_uuid(),
  -- 'waiting'  → open room in the queue
  -- 'drafting' → both joined, alternating spin/pick
  -- 'trading'  → rosters drafted; optional 1-for-1 player trades, then both
  --              players ready up before the match is simulated
  -- 'completed' / 'abandoned'
  status text not null default 'waiting'
    check (status in ('waiting', 'drafting', 'trading', 'completed', 'abandoned')),
  host_id uuid not null references auth.users (id) on delete cascade,
  guest_id uuid references auth.users (id) on delete set null,
  seed text not null,
  -- Denormalized host ladder rating (points) at room creation, so the
  -- matchmaker can pick the closest-rated open room without a join.
  host_rating int not null default 0,
  -- 'host' | 'guest' — whose turn it is to spin and pick.
  turn text not null default 'host' check (turn in ('host', 'guest')),
  host_picks jsonb not null default '[]',   -- player ids, in draft order
  guest_picks jsonb not null default '[]',
  used_team_eras jsonb not null default '[]', -- reserved (teams may repeat)
  -- Pending trade offer during the 'trading' phase:
  --   { by: 'host'|'guest', give: <playerId>, want: <playerId> }
  trade_offer jsonb,
  host_ready boolean not null default false,
  guest_ready boolean not null default false,
  winner_id uuid references auth.users (id) on delete set null,
  result jsonb,  -- H2HMatchResult + points, written on completion
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.h2h_matches enable row level security;

-- Open ("waiting") rooms are publicly listable for matchmaking; otherwise
-- only the two participants can read a match.
create policy "waiting or own matches are readable"
  on public.h2h_matches for select
  using (status = 'waiting' or auth.uid() = host_id or auth.uid() = guest_id);

create policy "users can create their own match"
  on public.h2h_matches for insert
  with check (auth.uid() = host_id);

create policy "participants can update their match"
  on public.h2h_matches for update
  using (auth.uid() = host_id or auth.uid() = guest_id);

create index if not exists h2h_matches_open on public.h2h_matches (status, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- h2h_results
--
-- Two rows per completed match (one per player), flattened for cheap ladder
-- aggregation. Immutable once written. `points` follows the scoring in
-- src/lib/engine/headToHead.ts (win 3, +1 dominant win, +1 narrow loss).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.h2h_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.h2h_matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  opponent_id uuid not null references auth.users (id) on delete cascade,
  won boolean not null,
  points int not null check (points >= 0),
  runs_for int not null,
  runs_against int not null,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);

alter table public.h2h_results enable row level security;

create policy "h2h results are publicly readable"
  on public.h2h_results for select
  using (true);

create policy "users can insert their own h2h result"
  on public.h2h_results for insert
  with check (auth.uid() = user_id);

create index if not exists h2h_results_user on public.h2h_results (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- h2h_ladder view
--
-- The online Head-to-Head leaderboard: total points, played, wins and run
-- differential per user, ranked points → wins → run differential (the same
-- ordering rankLadder() uses client-side, and the order the playoff bracket
-- is seeded from). A plain view, so it's always live.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.h2h_ladder as
select
  r.user_id,
  p.username,
  count(*) as played,
  count(*) filter (where r.won) as wins,
  count(*) filter (where not r.won) as losses,
  sum(r.points) as points,
  sum(r.runs_for - r.runs_against) as run_diff
from public.h2h_results r
join public.profiles p on p.id = r.user_id
group by r.user_id, p.username
order by points desc, wins desc, run_diff desc;

-- ─────────────────────────────────────────────────────────────────────────
-- tournaments / tournament_entrants / tournament_matches
--
-- Periodic playoffs: the top finishers on the ladder are seeded into a
-- single-elimination bracket (size 4 or 8). Each bracket match is played as
-- a normal h2h_match and its winner advances. Kept as plain tables an admin
-- (or a scheduled job) populates; the app reads them to render the bracket.
-- ─────────────────────────────────────────────────────────────────────────
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

create policy "tournaments are publicly readable"
  on public.tournaments for select using (true);
create policy "tournament entrants are publicly readable"
  on public.tournament_entrants for select using (true);
create policy "tournament matches are publicly readable"
  on public.tournament_matches for select using (true);
