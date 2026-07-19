import type { Player } from "@/lib/types";
import { createRng } from "@/lib/engine/rng";
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
// competitive (a familiar bonus-point structure):
//   Win .................. 3
//   Bonus win (margin ≥ BONUS_MARGIN) ... +1  → 4
//   Narrow loss (margin ≤ CLOSE_MARGIN) . +1  → 1
//   Loss ................. 0
export const H2H_WIN_POINTS = 3;
export const H2H_BONUS_WIN_POINTS = 1;
export const H2H_NARROW_LOSS_POINTS = 1;
export const BONUS_MARGIN = 30;
export const CLOSE_MARGIN = 10;

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
