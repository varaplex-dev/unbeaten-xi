-- 14-0: Head-to-Head — server-authoritative result finalization.
--
-- Run this AFTER h2h_schema.sql (and h2h_schema_migrate.sql if you used it).
-- It is idempotent and safe to re-run. Like the rest of this project's
-- Supabase usage, nothing here applies automatically — paste the whole file
-- into the SQL Editor once.
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS — closing the last H2H forgery hole
-- ─────────────────────────────────────────────────────────────────────────
-- The ladder is fed by public.h2h_results. Until now those rows were written
-- by the CLIENT: each browser simulated the match, wrote winner_id/result onto
-- the match row, and inserted its own results row. Row-level security cannot
-- restrict individual columns, so a participant could tamper the completion
-- write on a match they were really in and flip a loss into a win. Only the
-- two clients "agreeing" kept anyone honest, and nothing enforced it.
--
-- The result of a match is a DETERMINISTIC function of (match id, host_picks,
-- guest_picks) — all server-stored and written through the turn-guarded draft,
-- so the inputs are already trustworthy (see simulateH2HMatch in
-- src/lib/engine/headToHead.ts, seeded off the match id). What was missing was
-- a trustworthy WRITER. This adds one:
--
--   * Both clients run the real engine and submit their computed result via
--     h2h_submit_result(). The RPC finalizes and awards ladder points only
--     when BOTH submissions agree. A lone cheater's forged result cannot match
--     the honest opponent's, so it is rejected — the match is marked disputed
--     and no points are awarded. (Two colluding accounts can still agree a lie
--     among themselves, but that only inflates accounts the attacker already
--     controls; it cannot touch another player's standing.)
--   * winner_id / result / disputed / host_report / guest_report, and any
--     transition to status='completed', become writable ONLY through the RPC.
--     A BEFORE UPDATE trigger blocks every other path; direct inserts into
--     h2h_results are removed entirely.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- 1. New columns — the two players' independently-computed reports, and the
--    disputed flag set when they disagree.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.h2h_matches
  add column if not exists host_report jsonb;

alter table public.h2h_matches
  add column if not exists guest_report jsonb;

alter table public.h2h_matches
  add column if not exists disputed boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Lock down h2h_results — no client may insert. The RPC below is
--    SECURITY DEFINER and writes these rows as the table owner, bypassing
--    RLS, so removing every insert policy leaves exactly one legitimate path.
--
--    RLS stays enabled; with RLS on and no insert policy the default is deny,
--    so there is no window where these rows are more exposed than before.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.h2h_results enable row level security;

drop policy if exists "users can insert their own h2h result" on public.h2h_results;
drop policy if exists "participants can insert their own h2h result" on public.h2h_results;

-- (SELECT stays public so the ladder view can read it.)
drop policy if exists "h2h results are publicly readable" on public.h2h_results;
create policy "h2h results are publicly readable"
  on public.h2h_results for select
  using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Guard trigger — protected columns on h2h_matches are RPC-only.
--
-- The RPC sets a transaction-local flag (h2h.finalizing = 'on') before it
-- touches these columns. Any UPDATE that changes a protected column WITHOUT
-- that flag — i.e. every direct client write — is rejected. Ordinary draft
-- writes (picks, turn, trade_offer, ready flags, status → drafting/trading/
-- abandoned) never touch the protected set, so they pass untouched.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.h2h_matches_guard()
returns trigger
language plpgsql
as $$
begin
  -- The RPC's own writes are trusted.
  if coalesce(current_setting('h2h.finalizing', true), '') = 'on' then
    return new;
  end if;

  if new.winner_id  is distinct from old.winner_id
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

-- ─────────────────────────────────────────────────────────────────────────
-- 4. h2h_submit_result — the one legitimate finalization path.
--
-- Each participant calls this once, after both players are ready, with the
-- result their own client computed. Behaviour:
--   * stores the caller's report on their side (host_report / guest_report);
--   * once BOTH reports are present, compares them:
--       - agree    → status='completed', winner_id/result written, and BOTH
--                    h2h_results rows inserted with points derived here (never
--                    from the client);
--       - disagree → status='completed', disputed=true, no points, no rows.
-- Idempotent: a second call on an already-completed match just returns it.
-- Serialized per match via SELECT ... FOR UPDATE, so two simultaneous
-- submissions can never both "finalize".
--
-- Points mirror h2hPoints() in src/lib/engine/headToHead.ts exactly:
--   win 3, +1 if margin ≥ 30 (bonus win → 4), +1 for the loser if margin ≤ 10.
-- ─────────────────────────────────────────────────────────────────────────
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

  -- Lock the row so concurrent submissions serialize.
  select * into v_match from public.h2h_matches where id = p_match_id for update;
  if not found then
    raise exception 'h2h: match not found';
  end if;

  -- Already finalized (agreed or disputed) — nothing to do.
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
    'hostScore', p_host_score,
    'guestScore', p_guest_score,
    'winner', p_winner,
    'margin', p_margin
  );

  -- Everything below writes protected columns; open the gate for this txn.
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

  -- Opponent hasn't reported yet — wait for them.
  if v_other is null then
    select * into v_match from public.h2h_matches where id = p_match_id;
    return v_match;
  end if;

  -- Both reports in. Agreement requires an exact match (both clients run the
  -- same deterministic engine over the same server-stored rosters, so honest
  -- play always agrees; only tampering diverges).
  if v_report <> v_other then
    update public.h2h_matches
      set status = 'completed', disputed = true, result = null, winner_id = null,
          updated_at = now()
      where id = p_match_id
      returning * into v_match;
    return v_match;
  end if;

  -- Agreed. Derive the scoreline and points here — never from the client.
  v_winner      := v_report->>'winner';
  v_margin      := (v_report->>'margin')::int;
  v_host_score  := (v_report->>'hostScore')::int;
  v_guest_score := (v_report->>'guestScore')::int;
  v_host_won    := (v_winner = 'host');
  v_winner_pts  := 3 + case when v_margin >= 30 then 1 else 0 end;
  v_loser_pts   := case when v_margin <= 10 then 1 else 0 end;

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

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Verification — expect three rows (the new columns). If any is missing,
--    the migration did not apply; do not test H2H until all three are present.
-- ─────────────────────────────────────────────────────────────────────────
select c.column_name, c.data_type
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'h2h_matches'
  and c.column_name in ('host_report', 'guest_report', 'disputed')
order by c.column_name;
