-- 14-0: Head-to-Head — UPGRADE an existing install to the current schema.
--
-- Run this if you already ran an earlier version of h2h_schema.sql. It is
-- safe to run repeatedly, and safe to run even if you are fully up to date.
--
-- Why this file exists
-- ───────────────────
-- h2h_schema.sql is written for a FRESH install and cannot upgrade one:
--
--   * `create table if not exists` does nothing when the table already
--     exists — it will NOT add columns that were introduced later. Re-running
--     it looks like it succeeded while host_rating / trade_offer / host_ready
--     / guest_ready are still missing.
--   * Postgres has no `create policy if not exists`, so re-running aborts
--     with "policy already exists" partway through, potentially leaving the
--     script half-applied.
--
-- Everything below is written to be idempotent instead.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Columns added after the first release of h2h_schema.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Denormalized host ladder rating, so the matchmaker can find the closest
-- rated open room without a join.
alter table public.h2h_matches
  add column if not exists host_rating int not null default 0;

-- Pending 1-for-1 offer during the 'trading' phase:
--   { by: 'host'|'guest', give: <playerId>, want: <playerId> }
alter table public.h2h_matches
  add column if not exists trade_offer jsonb;

-- Both players ready up before the match simulates.
alter table public.h2h_matches
  add column if not exists host_ready boolean not null default false;

alter table public.h2h_matches
  add column if not exists guest_ready boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Allow the 'trading' status
--
-- The original CHECK constraint predates the trading phase, so a match can
-- never enter it until the constraint is replaced. Dropping by the name
-- Postgres assigns automatically; `if exists` keeps this safe on a fresh DB
-- where the constraint may already be the current one.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.h2h_matches
  drop constraint if exists h2h_matches_status_check;

alter table public.h2h_matches
  add constraint h2h_matches_status_check
  check (status in ('waiting', 'drafting', 'trading', 'completed', 'abandoned'));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Policies — dropped and recreated so this file can be re-run
--
-- Row level security stays enabled throughout; dropping a policy does not
-- disable RLS, and with RLS on and no matching policy the default is deny.
-- So there is no window where these rows are more exposed than before.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.h2h_matches enable row level security;

drop policy if exists "waiting or own matches are readable" on public.h2h_matches;
create policy "waiting or own matches are readable"
  on public.h2h_matches for select
  using (status = 'waiting' or auth.uid() = host_id or auth.uid() = guest_id);

drop policy if exists "users can create their own match" on public.h2h_matches;
create policy "users can create their own match"
  on public.h2h_matches for insert
  with check (auth.uid() = host_id);

-- The `status = 'waiting' and guest_id is null` arm lets a second player CLAIM
-- an open room. Without it RLS denies the join (the joiner is neither host nor
-- the still-null guest), so no two players could ever connect. WITH CHECK
-- requires them to be a participant AFTER the update, so a room can only be
-- claimed by putting yourself in it.
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

-- ─────────────────────────────────────────────────────────────────────────
-- 4. SECURITY — close a ladder-forgery hole in h2h_results
--
-- The original insert policy was only:
--     with check (auth.uid() = user_id)
--
-- That is the sole guard on the competitive ladder, and it checks nothing
-- except that you are inserting a row about yourself. A signed-in user could
-- POST directly to /rest/v1/h2h_results with won = true and points = 999,
-- against a room they created themselves and never played. The ladder was
-- trivially forgeable by anyone who opened the network tab.
--
-- The legitimate client only ever writes a result AFTER the match reaches
-- status 'completed', with a real opponent (see recordMyResult in
-- src/lib/h2h/matchClient.ts), so requiring exactly that breaks nothing.
-- ─────────────────────────────────────────────────────────────────────────

-- Points come from pointsForRow() in src/lib/engine/headToHead.ts:
-- win 3 (+1 dominant = 4), narrow loss 1, loss 0. Nothing else is legal.
alter table public.h2h_results
  drop constraint if exists h2h_results_points_check;

alter table public.h2h_results
  add constraint h2h_results_points_check check (points between 0 and 4);

drop policy if exists "users can insert their own h2h result" on public.h2h_results;
drop policy if exists "participants can insert their own h2h result" on public.h2h_results;
create policy "participants can insert their own h2h result"
  on public.h2h_results for insert
  with check (
    auth.uid() = user_id
    and opponent_id <> user_id
    and exists (
      select 1
      from public.h2h_matches m
      where m.id = match_id
        -- the match must actually be finished ...
        and m.status = 'completed'
        -- ... you must have played in it ...
        and (m.host_id = auth.uid() or m.guest_id = auth.uid())
        -- ... and the opponent you name must be the other participant.
        and m.guest_id is not null
        and (m.host_id = opponent_id or m.guest_id = opponent_id)
    )
  );

-- NOTE — still open, needs a SECURITY DEFINER RPC (h2h_commit_pick /
-- h2h_finalize): the update policy on h2h_matches is row-level only, so a
-- participant can still write winner_id and result on their own match
-- directly. Two colluding accounts could therefore agree a fake scoreline.
-- Postgres RLS cannot restrict individual columns, so closing this properly
-- means routing every mutation through functions that derive the acting side
-- from auth.uid() server-side. The above closes the single-account case,
-- which is the one that matters for an open ladder.

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Verification — read this output before testing Head-to-Head.
--
-- Expect four rows, one per column, all present. If any row is missing, the
-- migration did not apply and Head-to-Head will misbehave rather than fail
-- loudly, so do not skip this.
-- ─────────────────────────────────────────────────────────────────────────
select
  c.column_name,
  c.data_type,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'h2h_matches'
  and c.column_name in ('host_rating', 'trade_offer', 'host_ready', 'guest_ready')
order by c.column_name;
