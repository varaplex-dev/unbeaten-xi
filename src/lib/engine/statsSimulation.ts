// Real-stats-driven team strength for season simulation. Used whenever every
// player in the XI has careerStats (real/legend players) — see
// simulate.ts's hasCareerStats() branch. Fictional players (no careerStats)
// still run through the older 0-99 rating-based math in simulate.ts
// unchanged; this file has nothing to do with that path.
//
// The core idea: don't collapse a player down to one abstracted skill number
// before simulating — carry their real batting average / strike rate /
// bowling average / economy rate through into the formulas that decide each
// match's score.
//
// The one place this can't be perfectly literal: a legend's numbers come
// from Test/ODI cricket (see transform.ts's --legends mode, which prefers
// those formats over a late-career T20 cameo), where strike rates and
// economy rates run on a completely different scale than a modern T20
// league — Viv Richards' ODI strike rate of 90 was extraordinary for his
// era but isn't literally comparable to a modern IPL strike rate of 150.
// Comparing the raw numbers directly would make every legends team
// unrealistically toothless and every current team unbeatable. Instead,
// each player's numbers are read relative to a per-format reference point
// (i.e. "how much better than a solid player in THIS format" before being
// mapped onto a common T20-equivalent scale) — still driven entirely by
// their real career numbers, just made comparable across eras first.
import type { CareerStats, Player } from "@/lib/types";

/** Roughly what a genuinely good, established player's strike rate and
 * batting average look like in each format — not a "top of the world"
 * outlier, just a solid regular. Used purely as a conversion anchor, not a
 * threshold. */
const FORMAT_REFERENCE_STRIKE_RATE: Record<string, number> = {
  IPL: 135,
  T20I: 130,
  T20: 130,
  ODI: 85,
  Test: 55,
};
const FORMAT_REFERENCE_AVERAGE: Record<string, number> = {
  IPL: 30,
  T20I: 28,
  T20: 28,
  ODI: 38,
  Test: 40,
};
const FORMAT_REFERENCE_ECONOMY: Record<string, number> = {
  IPL: 8.2,
  T20I: 8.0,
  T20: 8.0,
  ODI: 5.0,
  Test: 3.0,
};
const FORMAT_REFERENCE_BOWLING_AVERAGE: Record<string, number> = {
  IPL: 26,
  T20I: 25,
  T20: 25,
  ODI: 30,
  Test: 32,
};

/** The T20-equivalent scale everything gets mapped onto, regardless of
 * which format a player's real numbers came from. */
const TARGET_T20_STRIKE_RATE = 135;
const TARGET_T20_ECONOMY = 8.2;

const FALLBACK_STRIKE_RATE = 70;

export function hasCareerStats(players: Player[]): boolean {
  return players.length > 0 && players.every((p) => p.careerStats !== null);
}

function referenceFor(table: Record<string, number>, format: string | undefined, fallback: number): number {
  if (!format) return fallback;
  return table[format] ?? fallback;
}

/** This player's strike rate re-expressed on the common T20-equivalent
 * scale, and a reliability multiplier from how their average compares to a
 * solid player's average in their own format (a blazing strike rate backed
 * by a rock-bottom average is boom-or-bust, not reliable scoring — that's
 * weighted down, not up). Both comparisons happen within the player's own
 * format first, so a legend's ODI-era numbers and a current star's IPL
 * numbers land on genuinely comparable ground. */
export function battingProfile(player: Player): { strikeRate: number; reliability: number } {
  const stats = player.careerStats;
  if (!stats || stats.strikeRate === null || stats.battingAverage === null) {
    return { strikeRate: FALLBACK_STRIKE_RATE, reliability: 0.6 };
  }
  const srReference = referenceFor(FORMAT_REFERENCE_STRIKE_RATE, stats.format, TARGET_T20_STRIKE_RATE);
  const avgReference = referenceFor(FORMAT_REFERENCE_AVERAGE, stats.format, 30);
  const relativeSr = stats.strikeRate / srReference;
  const relativeAvg = stats.battingAverage / avgReference;
  return {
    strikeRate: relativeSr * TARGET_T20_STRIKE_RATE,
    reliability: Math.max(0.4, Math.min(1.6, relativeAvg)),
  };
}

/**
 * Expected T20-equivalent innings total from the batting order's real
 * strike rates (each already converted onto the common scale above),
 * weighted toward the top of the order and scaled by each batter's
 * reliability. 120 balls in an innings, so runs = teamStrikeRate * 1.2.
 */
export function expectedRunsFromBatting(battingOrder: Player[]): number {
  const weights = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8];
  const top7 = battingOrder.slice(0, 7);
  let weightedSum = 0;
  let weightTotal = 0;
  top7.forEach((player, i) => {
    const { strikeRate, reliability } = battingProfile(player);
    const w = (weights[i] ?? 0.5) * reliability;
    weightedSum += strikeRate * w;
    weightTotal += w;
  });
  const teamStrikeRate = weightTotal > 0 ? weightedSum / weightTotal : FALLBACK_STRIKE_RATE;
  return teamStrikeRate * 1.2;
}

/** This player's economy rate re-expressed on the common T20-equivalent
 * scale — same cross-format conversion as battingProfile()'s strike rate,
 * for the same reason (a Test-era 3.0 economy and a modern IPL 8.0 economy
 * aren't literally comparable numbers). Exported for decision-resolution
 * comparisons in simulate.ts, not just the team-strength math below. */
export function economyOnT20Scale(stats: CareerStats): number | null {
  if (stats.economyRate === null) return null;
  const reference = referenceFor(FORMAT_REFERENCE_ECONOMY, stats.format, TARGET_T20_ECONOMY);
  const relativeEconomy = stats.economyRate / reference;
  return relativeEconomy * TARGET_T20_ECONOMY;
}

/** Team economy rate (already converted onto the T20-equivalent scale) from
 * the bowling attack's real economy rates — the best 5 options carry a T20
 * attack, same "core vs extra" split used for fictional bowling strength. */
export function teamEconomyRate(xi: Player[]): number {
  const converted = xi
    .map((p) => (p.careerStats ? economyOnT20Scale(p.careerStats) : null))
    .filter((v): v is number => v !== null);
  // No real bowling record anywhere in the XI shouldn't default to a
  // *neutral* economy — a lineup of specialist batters forced to bowl part
  // time genuinely leaks runs, not "exactly league average".
  if (converted.length === 0) return TARGET_T20_ECONOMY * 1.3;
  const sorted = [...converted].sort((a, b) => a - b);
  const core = sorted.slice(0, 5);
  const extra = sorted.slice(5);
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : TARGET_T20_ECONOMY);
  const coreEconomy = avg(core);
  const extraEconomy = avg(extra);
  return extra.length > 0 ? coreEconomy * 0.85 + extraEconomy * 0.15 : coreEconomy;
}

/** Positive = a bowling attack that suppresses the opponent's expected
 * score below league average; negative = a weak attack that concedes more. */
export function bowlingSuppression(xi: Player[]): number {
  const economy = teamEconomyRate(xi);
  // Each run/over below league average trims a few runs off the opponent's
  // expected 120-ball total (roughly 4 runs of suppression per 0.5 economy
  // saved, calibrated to keep swings realistic rather than match-deciding
  // on their own).
  return (TARGET_T20_ECONOMY - economy) * 8;
}

/** This player's bowling average re-expressed on the common T20-equivalent
 * scale — same cross-format conversion as the strike rate/economy ones
 * above. null if they have no meaningful bowling record. */
export function bowlingAverageOnT20Scale(stats: CareerStats): number | null {
  if (stats.bowlingAverage === null || stats.wickets === 0) return null;
  const reference = referenceFor(FORMAT_REFERENCE_BOWLING_AVERAGE, stats.format, 26);
  const relative = stats.bowlingAverage / reference;
  return relative * 26;
}

/** Real bowling-average-derived wicket-taking threat, 0-1 scale (already
 * converted onto the T20-equivalent scale, for the same cross-format
 * reason as everything else here), used to bias how many wickets a bowling
 * attack takes in a given match. `fieldingBonus` is Hardcore Mode's small,
 * optional nudge from fieldingWicketBonus() — 0 for a normal game. */
export function wicketThreat(xi: Player[], fieldingBonus = 0): number {
  const convertedAverages = xi
    .map((p) => (p.careerStats ? bowlingAverageOnT20Scale(p.careerStats) : null))
    .filter((v): v is number => v !== null);
  if (convertedAverages.length === 0) return Math.max(0.15, Math.min(0.9, 0.4 + fieldingBonus));
  const avgBowlingAverage = convertedAverages.reduce((a, b) => a + b, 0) / convertedAverages.length;
  // A (T20-equivalent) bowling average of ~20 is elite, ~35+ is weak; map
  // that range to 0-1.
  return Math.max(0.15, Math.min(0.9, 1 - (avgBowlingAverage - 18) / 30 + fieldingBonus));
}
