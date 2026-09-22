-- The Unbeaten Game — self-serve account deletion.
--
-- Run this once in the Supabase SQL Editor. Safe to run repeatedly.
--
-- Google Play requires an in-app / on-web way for a user to delete their own
-- account and data (an email request is not accepted). The /delete-account page
-- calls this RPC (see authStore.deleteAccount -> supabase.rpc('delete_my_account')).
--
-- It deletes the caller's auth.users row. Every user-owned table references
-- auth.users with `on delete cascade` (profiles, season_results, h2h_results on
-- both user_id and opponent_id, h2h_matches.host_id), so that single delete
-- removes all of their personal data; columns that merely reference the user
-- (h2h_matches.guest_id / winner_id, tournaments.champion_id) are set null, so
-- an opponent's own match history is preserved without the deleted user's id.
--
-- SECURITY DEFINER so it runs with the owner's rights (the postgres role in the
-- SQL editor), which is what's allowed to delete from the auth schema. It only
-- ever deletes auth.uid() — the caller can only delete themselves.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only a signed-in caller may run it (anonymous/guest sessions count as
-- `authenticated` in Supabase, so guests can delete their guest account too).
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
