import type { CareerStats, PhaseStat, Player } from "@/lib/types";
import { canBowl } from "@/lib/types";
import type { RandomFn } from "@/lib/engine/rng";
import { battingProfile, bowlingAverageOnT20Scale, economyOnT20Scale } from "@/lib/engine/statsSimulation";

// ---------------------------------------------------------------------------
// Match engine — a phase-aware contest between two real XIs.
//
// An innings is modelled in the three phases a T20 actually splits into, and
// each phase is a genuine contest: what this batting group scores in that
// phase, weighed against what that bowling attack concedes in it. Nothing here
// invents a number — every input is a real career stat, preferring Cricsheet's
// ball-by-ball phase splits (see scripts/cricsheet/) and falling back to the
// player's overall rate scaled by how scoring actually shifts across a T20
// innings when a player isn't covered.
//
// Variance is seeded and *bounded*: the same two teams produce the same result
// for a given match id, and the stronger side wins the large majority of the
// time — upsets happen at a believable rate rather than a coin-flip one.
// ---------------------------------------------------------------------------

export interface PhaseDef {
  key: "powerplay" | "middle" | "death";
  overs: number;
}

export const PHASES: PhaseDef[] = [
  { key: "powerplay", overs: 6 },
  { key: "middle", overs: 9 },
  { key: "death", overs: 5 },
];

/** Batting-order positions (0-indexed) that actually face most of a phase. */
const PHASE_BATTERS: Record<PhaseDef["key"], number[]> = {
  powerplay: [0, 1, 2],
  middle: [2, 3, 4, 5, 6],
  death: [4, 5, 6, 7, 8],
};

// How T20 scoring shifts by phase, used only to spread a player's overall rate
// when we have no real phase split for them. Death overs go at a markedly
// higher rate than the middle; the powerplay sits near a player's average.
const BAT_PHASE_FALLBACK: Record<PhaseDef["key"], number> = {
  powerplay: 1.0,
  middle: 0.92,
  death: 1.28,
};
const BOWL_PHASE_FALLBACK: Record<PhaseDef["key"], number> = {
  powerplay: 1.02,
  middle: 0.94,
  death: 1.22,
};

// A phase split needs a real sample before we trust it over the overall rate.
const MIN_PHASE_BALLS = 30;

// The contest blend: in T20 the batting side's scoring ability drives the
// total a little more than the attack's suppression does, but both matter.
const BATTING_WEIGHT = 0.55;
const BOWLING_WEIGHT = 0.45;

// League-average anchors, used to keep fallbacks and wicket rates sane.
const LEAGUE_RUN_RATE = 8.2; // runs per over
const LEAGUE_BALLS_PER_WICKET = 18;

function phaseStat(splits: CareerStats["battingPhases"], key: PhaseDef["key"]): PhaseStat | null {
  const s = splits?.[key];
  if (!s || s.balls < MIN_PHASE_BALLS) return null;
  return s;
}

/** Runs per over this batter scores in a phase. */
export function batterPhaseRate(player: Player, key: PhaseDef["key"]): number {
  const cs = player.careerStats;
  const split = phaseStat(cs?.battingPhases, key);
  if (split?.strikeRate != null) return (split.strikeRate / 100) * 6;
  // Fall back to the player's overall (format-normalized) strike rate.
  const overall = battingProfile(player).strikeRate;
  return (overall / 100) * 6 * BAT_PHASE_FALLBACK[key];
}

/** Runs per over this bowler concedes in a phase. */
export function bowlerPhaseEconomy(player: Player, key: PhaseDef["key"]): number {
  const cs = player.careerStats;
  const split = phaseStat(cs?.bowlingPhases, key);
  if (split?.economy != null) return split.economy;
  const overall = cs ? economyOnT20Scale(cs) : null;
  return (overall ?? LEAGUE_RUN_RATE) * BOWL_PHASE_FALLBACK[key];
}

/** The batting group's scoring rate for a phase — the players who actually
 * face it, weighted so the earlier (more prominent) ones count for more. */
export function battingRateForPhase(order: Player[], key: PhaseDef["key"]): number {
  const idxs = PHASE_BATTERS[key].filter((i) => i < order.length);
  if (idxs.length === 0) return LEAGUE_RUN_RATE;
  let weighted = 0;
  let weight = 0;
  idxs.forEach((idx, n) => {
    const w = 1 / (n + 1.5); // first-listed batter of the phase counts most
    weighted += batterPhaseRate(order[idx], key) * w;
    weight += w;
  });
  return weighted / weight;
}

/** The attack's economy for a phase — the five bowlers who'd actually bowl. */
export function bowlingEconomyForPhase(xi: Player[], key: PhaseDef["key"]): number {
  const bowlers = xi.filter(canBowl);
  if (bowlers.length === 0) return LEAGUE_RUN_RATE * 1.15; // no real attack
  const rated = bowlers
    .map((p) => ({ p, econ: bowlerPhaseEconomy(p, key) }))
    .sort((a, b) => a.econ - b.econ)
    .slice(0, 5);
  return rated.reduce((sum, r) => sum + r.econ, 0) / rated.length;
}

/** Balls per wicket this attack takes, from real bowling strike rates. */
function attackBallsPerWicket(xi: Player[]): number {
  const bowlers = xi.filter(canBowl);
  const rates: number[] = [];
  for (const p of bowlers) {
    const cs = p.careerStats;
    if (cs?.bowlingStrikeRate != null && cs.bowlingStrikeRate > 0) {
      rates.push(cs.bowlingStrikeRate);
      continue;
    }
    // Derive from the T20-scaled bowling average and economy when we only
    // have aggregates: balls/wicket = (runs/wicket) / (runs/ball).
    const avg = cs ? bowlingAverageOnT20Scale(cs) : null;
    const econ = cs ? economyOnT20Scale(cs) : null;
    if (avg != null && econ != null && econ > 0) rates.push(avg / (econ / 6));
  }
  if (rates.length === 0) return LEAGUE_BALLS_PER_WICKET;
  const best = rates.sort((a, b) => a - b).slice(0, 5);
  return best.reduce((s, r) => s + r, 0) / best.length;
}

/** How resistant this order is to losing wickets, relative to league norm.
 * POSITION-WEIGHTED: the top of the order shields the innings far more than the
 * lower middle, so a strong opener/№3 anchors it and a bunny promoted up top
 * drags it down — which is what makes WHERE you bat a player actually matter,
 * not just whether they're in the XI. */
function battingResilience(order: Player[]): number {
  const top = order.slice(0, 7);
  let weighted = 0;
  let weight = 0;
  top.forEach((p, i) => {
    const avg = p.careerStats?.battingAverage;
    if (avg == null || avg <= 0) return;
    const w = 1 / (i + 1); // №1 counts most, tapering down the order
    weighted += avg * w;
    weight += w;
  });
  if (weight === 0) return 1;
  const mean = weighted / weight;
  // A top order averaging ~28 is league-typical; ~40 up top survives markedly
  // longer, a tail promoted to the top collapses. Range widened from the old
  // ±0.3 so ordering has real bite.
  return Math.max(0.55, Math.min(1.5, mean / 28));
}

export interface InningsResult {
  runs: number;
  wickets: number;
  /** The pre-variance expectation, used to break ties on merit. */
  baseline: number;
}

export interface InningsOptions {
  /** Runs-per-over adjustment for the surface (+ favours batting). */
  pitchAdjustment?: number;
  /** Scales league scoring toward the squad's era (see simulate.ts). */
  eraScale?: number;
  /** Extra wicket-taking from Hardcore fielding placement. */
  fieldingBonus?: number;
  /** Bounded swing, as a fraction (0.08 = ±8% at one SD). */
  variance?: number;
}

/**
 * Projects one innings: 20 overs, phase by phase, as a contest between the
 * batting order and the opposing attack. Wickets accumulate from the attack's
 * real strike rate against the order's resilience; once ten fall the innings
 * ends early and the remaining overs go unscored.
 */
export function projectInnings(
  rng: RandomFn,
  battingOrder: Player[],
  bowlingXi: Player[],
  opts: InningsOptions = {}
): InningsResult {
  const pitch = opts.pitchAdjustment ?? 0;
  const eraScale = opts.eraScale ?? 1;
  const variance = opts.variance ?? 0.08;

  const ballsPerWicket = Math.max(
    8,
    attackBallsPerWicket(bowlingXi) * battingResilience(battingOrder) * (1 - (opts.fieldingBonus ?? 0))
  );

  let runs = 0;
  let wickets = 0;
  let baseline = 0;

  for (const phase of PHASES) {
    if (wickets >= 10) break;

    const batRate = battingRateForPhase(battingOrder, phase.key);
    const bowlEcon = bowlingEconomyForPhase(bowlingXi, phase.key);
    // The contest: somewhere between what this order scores and what this
    // attack concedes, nudged by the surface and the era being played in.
    const expectedRate = (batRate * BATTING_WEIGHT + bowlEcon * BOWLING_WEIGHT) * eraScale + pitch;

    // Wickets falling in this phase shorten it; a collapse costs real runs.
    const phaseBalls = phase.overs * 6;
    const expectedWickets = phaseBalls / ballsPerWicket;
    const wicketsHere = Math.min(10 - wickets, expectedWickets * (0.75 + rng() * 0.5));

    // Bounded, seeded swing — one draw per phase keeps totals believable.
    const swing = 1 + (rng() * 2 - 1) * variance;
    const phaseRuns = Math.max(0, phase.overs * expectedRate);

    baseline += phaseRuns;
    runs += phaseRuns * swing;
    wickets += wicketsHere;

    if (wickets >= 10) {
      // All out: the rest of the innings simply doesn't happen.
      break;
    }
  }

  return {
    runs: Math.max(40, Math.round(runs)),
    wickets: Math.min(10, Math.round(wickets)),
    baseline: Math.round(baseline * 10) / 10,
  };
}

export interface MatchProjection {
  teamRuns: number;
  teamWickets: number;
  opponentRuns: number;
  opponentWickets: number;
  teamBaseline: number;
  opponentBaseline: number;
  won: boolean;
  margin: number;
}

/**
 * A full match between two real XIs — each bats once against the other's
 * attack. Ties are settled on the pre-variance baseline (a super-over
 * stand-in), so merit decides rather than another coin flip.
 */
export function projectMatch(
  rng: RandomFn,
  teamOrder: Player[],
  teamXi: Player[],
  opponentXi: Player[],
  opts: InningsOptions = {}
): MatchProjection {
  const team = projectInnings(rng, teamOrder, opponentXi, opts);
  // The opponent bats in their own listed order, against this XI's attack.
  const opponent = projectInnings(rng, opponentXi, teamXi, {
    ...opts,
    // The user's fielding placement helps their own attack, not the opponent's.
    fieldingBonus: 0,
  });

  const won =
    team.runs === opponent.runs ? team.baseline >= opponent.baseline : team.runs > opponent.runs;

  return {
    teamRuns: team.runs,
    teamWickets: team.wickets,
    opponentRuns: opponent.runs,
    opponentWickets: opponent.wickets,
    teamBaseline: team.baseline,
    opponentBaseline: opponent.baseline,
    won,
    margin: Math.abs(team.runs - opponent.runs),
  };
}

/** A single number for ranking real teams by strength, used to build a
 * season schedule with a genuine spread of difficulty. */
export function teamStrength(xi: Player[]): number {
  const order = [...xi];
  let batting = 0;
  for (const phase of PHASES) {
    batting += battingRateForPhase(order, phase.key) * phase.overs;
  }
  let conceded = 0;
  for (const phase of PHASES) {
    conceded += bowlingEconomyForPhase(xi, phase.key) * phase.overs;
  }
  // Runs projected minus runs expected to concede — a net rating in runs.
  return Math.round((batting - conceded) * 10) / 10;
}
