import { isWicketkeeper, type Player } from "@/lib/types";
import { createRng } from "@/lib/engine/rng";
import { simulateSeason, type SeasonStats } from "@/lib/engine/simulate";
import type { FieldingAssignments } from "@/lib/engine/fielding";
import type { CompetitionId } from "@/lib/engine/competitions";
import {
  battingProfile,
  bowlingSuppression,
  expectedRunsFromBatting,
  teamEconomyRate,
  wicketThreat,
} from "@/lib/engine/statsSimulation";

// ---------------------------------------------------------------------------
// Head-to-Head engine — pure, deterministic logic shared by the (upcoming)
// online mode. Two real XIs are compared category-by-category and simulated
// against each other from their real career stats, and a match result is
// scored into league points. Everything here is seed-driven so both clients
// in an online match compute byte-identical outcomes from the same match id.
// ---------------------------------------------------------------------------

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface RosterMetric {
  key: string;
  label: string;
  a: number;
  b: number;
  /** True when a higher value is the stronger side (batting), false when a
   * lower value wins (economy, bowling average). */
  higherIsBetter: boolean;
  advantage: "a" | "b" | "even";
}

export interface RosterComparison {
  metrics: RosterMetric[];
  /** Category counts — how many of the compared metrics each side leads. */
  aCategories: number;
  bCategories: number;
}

const EVEN_EPSILON = 0.01;

function decideAdvantage(a: number, b: number, higherIsBetter: boolean): "a" | "b" | "even" {
  if (Math.abs(a - b) < EVEN_EPSILON) return "even";
  const aBetter = higherIsBetter ? a > b : a < b;
  return aBetter ? "a" : "b";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Compares two rosters across the four batting/bowling axes the sim reads,
 * returning per-metric deltas and which side leads each. Used to render the
 * plus/minus breakdown between the two drafted XIs. */
export function compareRosters(a: Player[], b: Player[]): RosterComparison {
  const teamBattingAvg = (xi: Player[]) => average(xi.map((p) => battingProfile(p).strikeRate));
  const teamReliability = (xi: Player[]) => average(xi.map((p) => battingProfile(p).reliability)) * 100;

  const raw: Array<Omit<RosterMetric, "advantage">> = [
    {
      key: "expectedRuns",
      label: "Expected Runs",
      a: round2(expectedRunsFromBatting(a)),
      b: round2(expectedRunsFromBatting(b)),
      higherIsBetter: true,
    },
    {
      key: "strikeRate",
      label: "Avg Strike Rate",
      a: round2(teamBattingAvg(a)),
      b: round2(teamBattingAvg(b)),
      higherIsBetter: true,
    },
    {
      key: "reliability",
      label: "Batting Reliability",
      a: round2(teamReliability(a)),
      b: round2(teamReliability(b)),
      higherIsBetter: true,
    },
    {
      key: "wicketThreat",
      label: "Wicket Threat",
      a: round2(wicketThreat(a) * 100),
      b: round2(wicketThreat(b) * 100),
      higherIsBetter: true,
    },
    {
      key: "economy",
      label: "Economy Rate",
      a: round2(teamEconomyRate(a)),
      b: round2(teamEconomyRate(b)),
      higherIsBetter: false,
    },
  ];

  const metrics: RosterMetric[] = raw.map((m) => ({
    ...m,
    advantage: decideAdvantage(m.a, m.b, m.higherIsBetter),
  }));

  return {
    metrics,
    aCategories: metrics.filter((m) => m.advantage === "a").length,
    bCategories: metrics.filter((m) => m.advantage === "b").length,
  };
}

export interface H2HInnings {
  score: number;
  baseline: number;
}

export interface H2HMatchResult {
  a: H2HInnings;
  b: H2HInnings;
  winner: "a" | "b";
  /** Absolute run margin between the two innings. */
  margin: number;
}

/** One team's innings total: their real expected batting output, suppressed
 * by the opponent's real bowling economy and wicket-taking, plus seeded
 * variance. Mirrors the single-innings math the season sim uses, but here
 * both sides are real drafted XIs rather than a generic league opponent. */
function inningsScore(rng: () => number, batting: Player[], bowling: Player[]): H2HInnings {
  const expected = expectedRunsFromBatting(batting);
  const suppression = bowlingSuppression(bowling) + (wicketThreat(bowling) - 0.5) * 12;
  const baseline = expected - suppression;
  const variance = (rng() - 0.5) * 30;
  const score = Math.max(70, Math.round(baseline + variance));
  return { score, baseline: round2(baseline) };
}

/** Simulates a single head-to-head match between two real XIs. Deterministic
 * for a given matchId, so both online clients agree on the outcome. Ties are
 * broken toward the stronger underlying baseline (a super-over stand-in). */
export function simulateH2HMatch(matchId: string, a: Player[], b: Player[]): H2HMatchResult {
  const rng = createRng(`${matchId}::h2h`);
  const aInnings = inningsScore(rng, a, b);
  const bInnings = inningsScore(rng, b, a);

  let winner: "a" | "b";
  if (aInnings.score === bInnings.score) {
    winner = aInnings.baseline >= bInnings.baseline ? "a" : "b";
  } else {
    winner = aInnings.score > bInnings.score ? "a" : "b";
  }

  return {
    a: aInnings,
    b: bInnings,
    winner,
    margin: Math.abs(aInnings.score - bInnings.score),
  };
}

export interface H2HPoints {
  a: number;
  b: number;
}

// League points, chosen to reward decisive play while keeping close games
// competitive (a familiar bonus-point structure). Head-to-Head is decided by
// each XI's full SEASON (see simulateH2HSeason), so `margin` here is the gap in
// SEASON WINS between the two sides, not a single match's run margin:
//   Win .................................... 3
//   Bonus win (won by ≥ BONUS_MARGIN games) . +1  → 4
//   Narrow loss (within CLOSE_MARGIN game) .. +1  → 1
//   Loss ................................... 0
// These thresholds MUST match the ones in h2h_submit_result() (SQL).
export const H2H_WIN_POINTS = 3;
export const H2H_BONUS_WIN_POINTS = 1;
export const H2H_NARROW_LOSS_POINTS = 1;
export const BONUS_MARGIN = 5;
export const CLOSE_MARGIN = 1;

export function h2hPoints(result: H2HMatchResult): H2HPoints {
  const winnerPoints = H2H_WIN_POINTS + (result.margin >= BONUS_MARGIN ? H2H_BONUS_WIN_POINTS : 0);
  const loserPoints = result.margin <= CLOSE_MARGIN ? H2H_NARROW_LOSS_POINTS : 0;
  return result.winner === "a"
    ? { a: winnerPoints, b: loserPoints }
    : { a: loserPoints, b: winnerPoints };
}

export interface LadderRow {
  playerId: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  /** Cumulative run differential (for-against), the first tiebreaker. */
  runDiff: number;
}

/** Orders a ladder by points, then wins, then run differential — the ranking
 * the online leaderboard and playoff seeding read from. */
export function rankLadder(rows: LadderRow[]): LadderRow[] {
  return [...rows].sort(
    (x, y) => y.points - x.points || y.wins - x.wins || y.runDiff - x.runDiff
  );
}

export interface PlayoffSeed {
  seed: number;
  playerId: string;
}

export interface PlayoffPairing {
  round: number;
  high: PlayoffSeed;
  low: PlayoffSeed;
}

/** Seeds the top `size` (a power of two: 4 or 8) ladder finishers into a
 * standard single-elimination first round — 1 v N, 2 v N-1, and so on. */
export function seedPlayoffBracket(ladder: LadderRow[], size: 4 | 8): PlayoffPairing[] {
  const ranked = rankLadder(ladder).slice(0, size);
  const seeds: PlayoffSeed[] = ranked.map((row, i) => ({ seed: i + 1, playerId: row.playerId }));
  const pairings: PlayoffPairing[] = [];
  for (let i = 0; i < size / 2; i++) {
    pairings.push({ round: 1, high: seeds[i], low: seeds[size - 1 - i] });
  }
  return pairings;
}

// ---------------------------------------------------------------------------
// Season-vs-season Head-to-Head. Instead of a single match, each player's XI
// plays its own full season (the same engine the solo game uses), and the
// better record wins — more wins, then net run rate. Both sides face an
// IDENTICAL opponent slate (same base seed) so the comparison is purely a test
// of the two XIs, and the whole thing is deterministic from the match id so
// both online clients compute the same outcome for peer-agreement.
// ---------------------------------------------------------------------------

/** How each side arranged its XI on the team-setup step. All fields optional so
 * a match finalized before setup (or by an idle auto-pick) still simulates from
 * sensible defaults. */
export interface H2HLineup {
  battingOrder: string[];
  captainId: string | null;
  keeperId: string | null;
  fielding?: FieldingAssignments;
}

export interface H2HSeasonSide {
  wins: number;
  losses: number;
  netRunRate: number;
}

export interface H2HSeasonResult {
  host: H2HSeasonSide;
  guest: H2HSeasonSide;
  winner: "host" | "guest";
  /** Gap in season wins (0 when the tiebreak came down to net run rate). */
  marginWins: number;
}

// Head-to-Head seasons run the standard league length. Kept fixed (rather than
// a per-match choice) so every ladder result is comparable.
const H2H_SEASON_COMPETITION: CompetitionId = "league-major";
// A season has a fixed handful of in-match decisions; H2H has no interactive
// prompt, so we auto-resolve each with its first option until the season
// completes. This bound just guards the loop.
const H2H_MAX_DECISION_ROUNDS = 8;

/** A lineup from the raw drafted XI when the player hasn't set one: pick order
 * for batting, highest-rated as captain, first eligible keeper. */
function defaultLineup(xi: Player[]): H2HLineup {
  const byRating = [...xi].sort((a, b) => b.overallRating - a.overallRating);
  return {
    battingOrder: xi.map((p) => p.id),
    captainId: byRating[0]?.id ?? null,
    keeperId: xi.find(isWicketkeeper)?.id ?? null,
  };
}

/** Runs one XI's season to completion, auto-resolving any in-match decisions,
 * and returns its final stats (or null if the season couldn't complete). */
function runSeasonToCompletion(seed: string, xi: Player[], lineup: H2HLineup): SeasonStats | null {
  const battingOrder = lineup.battingOrder.length ? lineup.battingOrder : xi.map((p) => p.id);
  const captainId = lineup.captainId ?? xi[0]?.id ?? "";
  let decisions: Record<number, string> = {};
  for (let round = 0; round < H2H_MAX_DECISION_ROUNDS; round++) {
    const res = simulateSeason(seed, xi, battingOrder, captainId, null, decisions, {
      competition: H2H_SEASON_COMPETITION,
      fieldingAssignments: lineup.fielding,
    });
    if (res.stats) return res.stats;
    if (!res.pendingDecision) return null;
    decisions = { ...decisions, [res.pendingDecision.matchNumber]: res.pendingDecision.options[0].id };
  }
  return null;
}

function sideFrom(stats: SeasonStats | null): H2HSeasonSide {
  if (!stats) return { wins: 0, losses: 0, netRunRate: 0 };
  return { wins: stats.wins, losses: stats.losses, netRunRate: stats.netRunRate };
}

/** Simulates a full season for each XI and decides the Head-to-Head by record.
 * Deterministic for a given match id (both sides share the base seed, so they
 * face the same opponents), so both online clients agree on the outcome. */
export function simulateH2HSeason(
  matchId: string,
  hostXi: Player[],
  hostLineup: H2HLineup | null,
  guestXi: Player[],
  guestLineup: H2HLineup | null
): H2HSeasonResult {
  const host = sideFrom(runSeasonToCompletion(matchId, hostXi, hostLineup ?? defaultLineup(hostXi)));
  const guest = sideFrom(runSeasonToCompletion(matchId, guestXi, guestLineup ?? defaultLineup(guestXi)));

  const winner: "host" | "guest" =
    host.wins !== guest.wins
      ? host.wins > guest.wins
        ? "host"
        : "guest"
      : host.netRunRate >= guest.netRunRate
        ? "host"
        : "guest";

  return { host, guest, winner, marginWins: Math.abs(host.wins - guest.wins) };
}
