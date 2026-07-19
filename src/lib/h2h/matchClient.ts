import { supabase } from "@/lib/supabase/client";
import { randomSeedString } from "@/lib/engine/rng";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { getLegendPlayerById } from "@/lib/data/legendPlayers";
import { SQUAD_SIZE, type Player } from "@/lib/types";
import { compareRosters, simulateH2HMatch, h2hPoints } from "@/lib/engine/headToHead";

export const H2H_ROSTER_SIZE = SQUAD_SIZE;

export type MatchStatus = "waiting" | "drafting" | "completed" | "abandoned";
export type Side = "host" | "guest";

export interface H2HMatchRow {
  id: string;
  status: MatchStatus;
  host_id: string;
  guest_id: string | null;
  seed: string;
  turn: Side;
  host_picks: string[];
  guest_picks: string[];
  used_team_eras: string[];
  winner_id: string | null;
  result: H2HStoredResult | null;
  created_at: string;
  updated_at: string;
}

export interface H2HStoredResult {
  hostScore: number;
  guestScore: number;
  winner: Side;
  margin: number;
}

export function resolvePlayer(id: string): Player | null {
  return getRealPlayerById(id) ?? getLegendPlayerById(id) ?? null;
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

/** Random matchmaking: claim the oldest open room hosted by someone else, or
 * open a new one and wait. The claim is an atomic conditional update, so if
 * two players grab the same room only one wins and the loser opens its own. */
export async function findOrCreateMatch(userId: string): Promise<H2HMatchRow> {
  if (!supabase) throw new Error("Supabase not configured");

  const { data: openRooms } = await supabase
    .from("h2h_matches")
    .select("*")
    .eq("status", "waiting")
    .neq("host_id", userId)
    .is("guest_id", null)
    .order("created_at", { ascending: true })
    .limit(3);

  for (const room of openRooms ?? []) {
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
    .insert({ host_id: userId, seed: randomSeedString(), status: "waiting", turn: "host" })
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

  const update: Record<string, unknown> = {
    host_picks: hostPicks,
    guest_picks: guestPicks,
    turn: side === "host" ? "guest" : "host",
    updated_at: new Date().toISOString(),
  };

  if (complete) {
    const hostXi = hostPicks.map(resolvePlayer).filter((p): p is Player => Boolean(p));
    const guestXi = guestPicks.map(resolvePlayer).filter((p): p is Player => Boolean(p));
    const sim = simulateH2HMatch(match.id, hostXi, guestXi);
    update.status = "completed";
    update.winner_id = sim.winner === "a" ? match.host_id : match.guest_id;
    update.result = {
      hostScore: sim.a.score,
      guestScore: sim.b.score,
      winner: sim.winner === "a" ? "host" : "guest",
      margin: sim.margin,
    } satisfies H2HStoredResult;
  }

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

/** Writes this user's own result row once the match is complete (each client
 * inserts only its own row; the unique(match_id,user_id) constraint makes it
 * idempotent, so a re-render or both clients trying is harmless). */
export async function recordMyResult(match: H2HMatchRow, userId: string): Promise<void> {
  if (!supabase || !match.result || !match.guest_id) return;
  const side = sideForUser(match, userId);
  if (!side) return;
  const myScore = side === "host" ? match.result.hostScore : match.result.guestScore;
  const oppScore = side === "host" ? match.result.guestScore : match.result.hostScore;
  const won = match.result.winner === side;
  const points = pointsForRow(won, match.result.margin);
  const opponentId = side === "host" ? match.guest_id : match.host_id;

  await supabase.from("h2h_results").upsert(
    {
      match_id: match.id,
      user_id: userId,
      opponent_id: opponentId,
      won,
      points,
      runs_for: myScore,
      runs_against: oppScore,
    },
    { onConflict: "match_id,user_id", ignoreDuplicates: true }
  );
}

// Mirrors h2hPoints() but from a single row's perspective (win/loss + margin).
function pointsForRow(won: boolean, margin: number): number {
  const fake = {
    a: { score: 0, baseline: 0 },
    b: { score: 0, baseline: 0 },
    winner: (won ? "a" : "b") as "a" | "b",
    margin,
  };
  const pts = h2hPoints(fake);
  return won ? pts.a : pts.b;
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
