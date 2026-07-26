import { supabase } from "@/lib/supabase/client";
import { randomSeedString } from "@/lib/engine/rng";
import { getRealPoolPlayerById } from "@/lib/data/gameData";
import { SQUAD_SIZE, type Player } from "@/lib/types";
import { compareRosters, simulateH2HSeason, type H2HLineup } from "@/lib/engine/headToHead";

export const H2H_ROSTER_SIZE = SQUAD_SIZE;

// A waiting room is only joinable while a live client is behind it. Each
// searching client heartbeats its own room every poll tick (~3s), so a room
// untouched for longer than this has no one waiting in it (browser closed,
// tab killed) and matchmaking skips it — otherwise a new player would claim a
// dead room and wait forever for a host who will never draft.
const ROOM_FRESH_MS = 12_000;
function freshRoomCutoff(): string {
  return new Date(Date.now() - ROOM_FRESH_MS).toISOString();
}

/** Keeps this player's own waiting room "alive" in the queue. Called on each
 * poll tick while searching; a room that stops heartbeating ages out of every
 * matchmaking query (see freshRoomCutoff). */
export async function heartbeatRoom(matchId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("h2h_matches")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", matchId)
    .eq("status", "waiting");
}

export type MatchStatus = "waiting" | "drafting" | "trading" | "completed" | "abandoned";
export type Side = "host" | "guest";

export interface TradeOffer {
  by: Side;
  /** A player the proposer gives up (from their own roster). */
  give: string;
  /** A player the proposer wants (from the opponent's roster). */
  want: string;
}

export interface H2HMatchRow {
  id: string;
  status: MatchStatus;
  host_id: string;
  guest_id: string | null;
  seed: string;
  host_rating: number;
  turn: Side;
  host_picks: string[];
  guest_picks: string[];
  used_team_eras: string[];
  trade_offer: TradeOffer | null;
  host_ready: boolean;
  guest_ready: boolean;
  winner_id: string | null;
  result: H2HStoredResult | null;
  // How each player arranged their XI on the team-setup step (batting order,
  // captain, keeper, fielding). Feeds the season sim; null until set, in which
  // case a sensible default lineup is used.
  host_lineup: H2HLineup | null;
  guest_lineup: H2HLineup | null;
  // Each player's independently-computed result, submitted to
  // h2h_submit_result(). The server finalizes only when both agree; if they
  // disagree the match is marked `disputed` and no ladder points are awarded.
  host_report: H2HStoredResult | null;
  guest_report: H2HStoredResult | null;
  disputed: boolean;
  created_at: string;
  updated_at: string;
}

export interface H2HStoredResult {
  // Season wins for each side — Head-to-Head is decided by a full season per
  // XI (see simulateH2HSeason), not a single match.
  hostScore: number;
  guestScore: number;
  winner: Side;
  // Gap in season wins (0 when the tiebreak was net run rate).
  margin: number;
}

export function resolvePlayer(id: string): Player | null {
  return getRealPoolPlayerById(id) ?? null;
}

export function sideForUser(match: H2HMatchRow, userId: string): Side | null {
  if (match.host_id === userId) return "host";
  if (match.guest_id === userId) return "guest";
  return null;
}

export function picksFor(match: H2HMatchRow, side: Side): string[] {
  return side === "host" ? match.host_picks : match.guest_picks;
}

/** The set of player ids already taken by either side — the duplicate-
 * prevention list. A team/era can be landed on by both players, but a
 * specific player, once drafted, can't be picked again. */
export function takenPlayerIds(match: H2HMatchRow): Set<string> {
  return new Set([...match.host_picks, ...match.guest_picks]);
}

export function totalPicks(match: H2HMatchRow): number {
  return match.host_picks.length + match.guest_picks.length;
}

export function isDraftComplete(match: H2HMatchRow): boolean {
  return match.host_picks.length >= H2H_ROSTER_SIZE && match.guest_picks.length >= H2H_ROSTER_SIZE;
}

/** This user's current ladder rating (total points), or 0 if unranked. Used
 * to pair players of similar standing. */
export async function fetchMyRating(userId: string): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.from("h2h_ladder").select("points").eq("user_id", userId).maybeSingle();
  return (data?.points as number | undefined) ?? 0;
}

/** Skill-aware matchmaking: among the open rooms, claim the one whose host's
 * ladder rating is closest to this player's (ties broken by who's waited
 * longest), so games are competitive rather than purely first-come. It still
 * always matches if any room exists — closeness only orders the candidates,
 * it never blocks a pairing — and opens a new room only when the queue is
 * empty. The claim itself is an atomic conditional update, so if two players
 * grab the same room only one wins and the other falls through to the next
 * candidate or opens its own. */
export async function findOrCreateMatch(userId: string): Promise<H2HMatchRow> {
  if (!supabase) throw new Error("Supabase not configured");
  const myRating = await fetchMyRating(userId);

  const { data: openRooms } = await supabase
    .from("h2h_matches")
    .select("*")
    .eq("status", "waiting")
    .neq("host_id", userId)
    .is("guest_id", null)
    .gt("updated_at", freshRoomCutoff())
    .limit(20);

  const ranked = ((openRooms as H2HMatchRow[] | null) ?? []).sort((a, b) => {
    const da = Math.abs((a.host_rating ?? 0) - myRating);
    const db = Math.abs((b.host_rating ?? 0) - myRating);
    return da - db || a.created_at.localeCompare(b.created_at);
  });

  for (const room of ranked) {
    const { data: claimed } = await supabase
      .from("h2h_matches")
      .update({ guest_id: userId, status: "drafting", updated_at: new Date().toISOString() })
      .eq("id", room.id)
      .eq("status", "waiting")
      .is("guest_id", null)
      .select()
      .single();
    if (claimed) return claimed as H2HMatchRow;
  }

  const { data: created, error } = await supabase
    .from("h2h_matches")
    .insert({ host_id: userId, seed: randomSeedString(), status: "waiting", turn: "host", host_rating: myRating })
    .select()
    .single();
  if (error || !created) throw error ?? new Error("Could not create match");
  return created as H2HMatchRow;
}

export async function fetchMatch(matchId: string): Promise<H2HMatchRow | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("h2h_matches").select("*").eq("id", matchId).single();
  return (data as H2HMatchRow) ?? null;
}

/** Commits one draft pick and hands the turn to the opponent. Guarded by an
 * atomic `where turn = <side>` update so a client can't pick out of turn or
 * double-commit. When the pick completes both rosters, the match is scored
 * and closed in the same write. */
export async function commitPick(
  match: H2HMatchRow,
  side: Side,
  playerId: string
): Promise<H2HMatchRow | null> {
  if (!supabase) throw new Error("Supabase not configured");
  if (takenPlayerIds(match).has(playerId)) return null;

  const hostPicks = side === "host" ? [...match.host_picks, playerId] : match.host_picks;
  const guestPicks = side === "guest" ? [...match.guest_picks, playerId] : match.guest_picks;
  const complete = hostPicks.length >= H2H_ROSTER_SIZE && guestPicks.length >= H2H_ROSTER_SIZE;

  // When the last pick lands, move into the trading phase rather than
  // simulating straight away — players get to negotiate roster swaps and
  // ready up first (see proposeTrade / setReady).
  const update: Record<string, unknown> = {
    host_picks: hostPicks,
    guest_picks: guestPicks,
    turn: side === "host" ? "guest" : "host",
    updated_at: new Date().toISOString(),
    ...(complete ? { status: "trading", host_ready: false, guest_ready: false } : {}),
  };

  const { data } = await supabase
    .from("h2h_matches")
    .update(update)
    .eq("id", match.id)
    .eq("turn", side)
    .eq("status", "drafting")
    .select()
    .single();
  return (data as H2HMatchRow) ?? null;
}

/** Proposes a 1-for-1 swap during the trading phase: `give` (one of the
 * proposer's players) for `want` (one of the opponent's). Overwrites any
 * existing pending offer. */
export async function proposeTrade(
  match: H2HMatchRow,
  side: Side,
  give: string,
  want: string
): Promise<H2HMatchRow | null> {
  if (!supabase) return null;
  const mine = picksFor(match, side);
  const theirs = picksFor(match, side === "host" ? "guest" : "host");
  if (!mine.includes(give) || !theirs.includes(want)) return null;

  const { data } = await supabase
    .from("h2h_matches")
    .update({ trade_offer: { by: side, give, want }, updated_at: new Date().toISOString() })
    .eq("id", match.id)
    .eq("status", "trading")
    .select()
    .single();
  return (data as H2HMatchRow) ?? null;
}

/** Responds to the pending offer. Accepting swaps the two players between
 * rosters and clears both ready flags (the rosters changed, so each side
 * re-confirms); rejecting just clears the offer. Only the player who did NOT
 * make the offer may respond. */
export async function respondTrade(
  match: H2HMatchRow,
  side: Side,
  accept: boolean
): Promise<H2HMatchRow | null> {
  if (!supabase || !match.trade_offer || match.trade_offer.by === side) return null;

  if (!accept) {
    const { data } = await supabase
      .from("h2h_matches")
      .update({ trade_offer: null, updated_at: new Date().toISOString() })
      .eq("id", match.id)
      .eq("status", "trading")
      .select()
      .single();
    return (data as H2HMatchRow) ?? null;
  }

  const { give, want, by } = match.trade_offer;
  const swap = (picks: string[], out: string, inn: string) => picks.map((id) => (id === out ? inn : id));
  // Proposer loses `give`, gains `want`; responder loses `want`, gains `give`.
  const hostPicks =
    by === "host" ? swap(match.host_picks, give, want) : swap(match.host_picks, want, give);
  const guestPicks =
    by === "host" ? swap(match.guest_picks, want, give) : swap(match.guest_picks, give, want);

  const { data } = await supabase
    .from("h2h_matches")
    .update({
      host_picks: hostPicks,
      guest_picks: guestPicks,
      trade_offer: null,
      host_ready: false,
      guest_ready: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", match.id)
    .eq("status", "trading")
    .select()
    .single();
  return (data as H2HMatchRow) ?? null;
}

/** Marks this side ready, then attempts to finalize. Finalization is
 * server-authoritative (see submitResultIfReady) — this client only reports
 * the result its own engine computed; the server awards points. */
export async function setReady(match: H2HMatchRow, side: Side, userId: string): Promise<H2HMatchRow | null> {
  if (!supabase) return null;
  const field = side === "host" ? "host_ready" : "guest_ready";
  const { data } = await supabase
    .from("h2h_matches")
    .update({ [field]: true, updated_at: new Date().toISOString() })
    .eq("id", match.id)
    .eq("status", "trading")
    .select()
    .single();
  const updated = (data as H2HMatchRow) ?? null;
  return (await submitResultIfReady(updated ?? match, userId)) ?? updated;
}

/** Persists this player's XI arrangement (batting order, captain, keeper,
 * fielding) to their own side of the match. The season sim reads it at
 * finalize; null just falls back to a default lineup. */
export async function setLineup(
  match: H2HMatchRow,
  side: Side,
  lineup: H2HLineup
): Promise<H2HMatchRow | null> {
  if (!supabase) return null;
  const field = side === "host" ? "host_lineup" : "guest_lineup";
  const { data } = await supabase
    .from("h2h_matches")
    .update({ [field]: lineup, updated_at: new Date().toISOString() })
    .eq("id", match.id)
    .eq("status", "trading")
    .select()
    .single();
  return (data as H2HMatchRow) ?? null;
}

/** Reports this client's computed result to the server once both players are
 * ready. The heavy lifting is server-side: h2h_submit_result() stores each
 * side's report and finalizes the match only when the two agree, deriving
 * winner_id, the scoreline and both players' ladder points itself. A lone
 * cheater's forged report can't match the honest opponent's, so it's rejected
 * (the match is marked `disputed`, no points). Safe to call from both clients
 * and repeatedly — the RPC serializes on the row and is idempotent once the
 * match is completed. Returns the (possibly finalized) match row. */
export async function submitResultIfReady(
  snapshot: H2HMatchRow,
  userId: string
): Promise<H2HMatchRow | null> {
  if (!supabase) return null;
  if (snapshot.status !== "trading" || !(snapshot.host_ready && snapshot.guest_ready)) return null;
  if (!sideForUser(snapshot, userId)) return null;

  // The result is deterministic from the match id + the two server-stored
  // rosters and lineups, so an honest client always produces the same numbers
  // its opponent does. Each XI plays its own full season; the better record
  // (wins, then net run rate) wins the Head-to-Head.
  const hostXi = snapshot.host_picks.map(resolvePlayer).filter((p): p is Player => Boolean(p));
  const guestXi = snapshot.guest_picks.map(resolvePlayer).filter((p): p is Player => Boolean(p));
  const sim = simulateH2HSeason(
    snapshot.id,
    hostXi,
    snapshot.host_lineup,
    guestXi,
    snapshot.guest_lineup
  );

  const { data } = await supabase.rpc("h2h_submit_result", {
    p_match_id: snapshot.id,
    p_host_score: sim.host.wins,
    p_guest_score: sim.guest.wins,
    p_winner: sim.winner,
    p_margin: sim.marginWins,
  });
  return (data as H2HMatchRow) ?? null;
}

export interface LadderEntry {
  user_id: string;
  username: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  run_diff: number;
}

export async function fetchLadder(limit = 50): Promise<LadderEntry[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("h2h_ladder").select("*").limit(limit);
  return (data as LadderEntry[]) ?? [];
}

/** The plus/minus comparison between the two completed rosters, for the
 * result screen. Returns null until both rosters are full. */
export function rosterBreakdown(match: H2HMatchRow) {
  if (!isDraftComplete(match)) return null;
  const hostXi = match.host_picks.map(resolvePlayer).filter((p): p is Player => Boolean(p));
  const guestXi = match.guest_picks.map(resolvePlayer).filter((p): p is Player => Boolean(p));
  return compareRosters(hostXi, guestXi);
}

export async function abandonMatch(matchId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("h2h_matches").update({ status: "abandoned" }).eq("id", matchId);
}

/**
 * Resolves the case where two players both created their own waiting room at
 * the same moment (each scanned an empty queue before the other's room
 * existed) and would otherwise wait forever. While hosting `myRoom`, look for
 * another open waiting room and claim it, then abandon our own.
 *
 * Only the room with the LARGER id does the claiming (`id < myRoom.id`), so of
 * any two rooms exactly one side claims — they can never claim each other
 * simultaneously and end up double-matched. The claim itself is the same
 * atomic conditional update matchmaking uses, so a race still yields one
 * winner. Returns the joined room, or null if there was nothing to pair with.
 */
export async function tryPairWaitingRooms(
  myRoom: H2HMatchRow,
  userId: string
): Promise<H2HMatchRow | null> {
  if (!supabase) return null;
  const { data: others } = await supabase
    .from("h2h_matches")
    .select("*")
    .eq("status", "waiting")
    .is("guest_id", null)
    .neq("host_id", userId)
    .lt("id", myRoom.id)
    .gt("updated_at", freshRoomCutoff())
    .limit(5);

  for (const room of ((others as H2HMatchRow[] | null) ?? [])) {
    const { data: claimed } = await supabase
      .from("h2h_matches")
      .update({ guest_id: userId, status: "drafting", updated_at: new Date().toISOString() })
      .eq("id", room.id)
      .eq("status", "waiting")
      .is("guest_id", null)
      .select()
      .single();
    if (claimed) {
      await abandonMatch(myRoom.id);
      return claimed as H2HMatchRow;
    }
  }
  return null;
}
