-- 14-0: Head-to-Head — fix matchmaking (players never connect).
--
-- Run once in the Supabase SQL Editor. Idempotent; safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────
-- THE BUG
-- ─────────────────────────────────────────────────────────────────────────
-- The h2h_matches UPDATE policy was:
--     using (auth.uid() = host_id or auth.uid() = guest_id)
--
-- Joining a match means a SECOND player claims someone else's OPEN room by
-- setting themselves as guest_id. But at that moment the existing row has
-- host_id = the other player and guest_id = null — so the joiner is neither
-- host nor guest, and RLS DENIES the update. No one could ever join: every
-- search just created another waiting room that sat forever. (A live DB had
-- 15 stranded 'waiting' rooms, including two created one second apart by
-- different players that failed to pair.)
--
-- FIX: also allow updating a room that is still 'waiting' with no guest yet
-- (an open lobby anyone may claim), but keep a WITH CHECK so that after the
-- update the actor is a participant — you can only claim a room BY putting
-- yourself in it, never on someone else's behalf, and never hijack a match
-- that has already started.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "participants can update their match" on public.h2h_matches;
create policy "participants can update their match"
  on public.h2h_matches for update
  using (
    auth.uid() = host_id
    or auth.uid() = guest_id
    or (status = 'waiting' and guest_id is null)
  )
  with check (
    auth.uid() = host_id
    or auth.uid() = guest_id
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Clean up the rooms stranded by the old policy. Anything still 'waiting'
-- and untouched for over 2 minutes has no live client behind it (an active
-- client heartbeats its room every few seconds — see matchClient.ts), so
-- retire it rather than let a new joiner claim a dead room and hang.
-- ─────────────────────────────────────────────────────────────────────────
update public.h2h_matches
  set status = 'abandoned'
  where status = 'waiting'
    and updated_at < now() - interval '2 minutes';

-- ─────────────────────────────────────────────────────────────────────────
-- Verification — expect 0 rows (no stale open rooms left).
-- ─────────────────────────────────────────────────────────────────────────
select count(*) as stale_waiting_rooms
from public.h2h_matches
where status = 'waiting' and updated_at < now() - interval '2 minutes';
