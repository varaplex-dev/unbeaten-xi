-- 14-0: Head-to-Head — season-vs-season + team-setup support.
--
-- Run once in the Supabase SQL Editor. Idempotent; safe to re-run.
--
-- Two changes:
--   1. Head-to-Head is now decided by a full SEASON per XI (each side's XI
--      plays its own season; the better record wins — more wins, then net run
--      rate — see simulateH2HSeason in src/lib/engine/headToHead.ts). The
--      per-side reports the finalize RPC compares are now season WINS, so its
--      bonus/narrow point thresholds move from run margins to win margins:
--      bonus win at a ≥5-win gap, consolation point within a 1-win gap. The
--      RPC's shape and the peer-agreement lockdown are otherwise unchanged.
--   2. New host_lineup / guest_lineup columns store how each player arranged
--      their XI on the team-setup step (batting order, captain, keeper,
--      fielding). The season sim reads them; null falls back to a default.

-- 1. Lineup columns.
alter table public.h2h_matches add column if not exists host_lineup jsonb;
alter table public.h2h_matches add column if not exists guest_lineup jsonb;

-- 2. Re-create the finalize RPC with season-win point thresholds.
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

-- Verification — expect two rows (the new columns).
select c.column_name, c.data_type
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'h2h_matches'
  and c.column_name in ('host_lineup', 'guest_lineup')
order by c.column_name;
