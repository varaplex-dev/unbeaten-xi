import type { Player } from "@/lib/types";
import { canBowl, isPaceBowler, isSpinner, isWicketkeeper } from "@/lib/types";
import { checkComposition } from "@/lib/engine/draft";

export interface TeamRatings {
  battingStrength: number;
  bowlingStrength: number;
  fieldingStrength: number;
  powerplayStrength: number;
  deathStrength: number;
  captaincyBonus: number;
  balanceBonus: number;
  overallRating: number;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Batting strength weights the top of the order more heavily — a deep but
 * top-light lineup shouldn't rate as highly as a genuinely strong top six.
 */
function battingStrength(battingOrder: Player[]): number {
  const weights = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.6, 0.4, 0.3, 0.2];
  let weightedSum = 0;
  let weightTotal = 0;
  battingOrder.forEach((player, i) => {
    const w = weights[i] ?? 0.2;
    weightedSum += player.t20BattingRating * w;
    weightTotal += w;
  });
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

function bowlingStrength(xi: Player[]): number {
  const bowlers = xi.filter(canBowl);
  if (bowlers.length === 0) return 0;
  const sorted = [...bowlers].sort((a, b) => b.t20BowlingRating - a.t20BowlingRating);
  // The best 5 bowling options carry a T20 attack; extras add only a little.
  const core = sorted.slice(0, 5);
  const extra = sorted.slice(5);
  const coreAvg = average(core.map((p) => p.t20BowlingRating));
  const extraAvg = average(extra.map((p) => p.t20BowlingRating));
  return extra.length > 0 ? coreAvg * 0.85 + extraAvg * 0.15 : coreAvg;
}

export function computeTeamRatings(xi: Player[], battingOrder: Player[], captain: Player | null): TeamRatings {
  const batting = battingStrength(battingOrder.length ? battingOrder : xi);
  const bowling = bowlingStrength(xi);
  const fielding = average(xi.map((p) => p.fieldingRating));
  const powerplay = average(xi.map((p) => Math.max(p.powerplayBatting, p.powerplayBowling)));
  const death = average(xi.map((p) => Math.max(p.deathOversBatting, p.deathOversBowling)));
  const captaincyBonus = captain ? (captain.captaincyRating - 50) * 0.06 : 0;

  const composition = checkComposition(xi);
  const keeperCount = xi.filter(isWicketkeeper).length;
  const paceCount = xi.filter(isPaceBowler).length;
  const spinCount = xi.filter(isSpinner).length;
  let balanceBonus = composition.legal ? 3 : -8;
  if (keeperCount === 0) balanceBonus -= 4;
  if (paceCount === 0) balanceBonus -= 3;
  if (spinCount === 0) balanceBonus -= 3;

  const overallRating = Math.max(
    1,
    Math.min(
      99,
      Math.round(
        batting * 0.38 +
          bowling * 0.32 +
          fielding * 0.1 +
          powerplay * 0.1 +
          death * 0.1 +
          captaincyBonus +
          balanceBonus
      )
    )
  );

  return {
    battingStrength: Math.round(batting),
    bowlingStrength: Math.round(bowling),
    fieldingStrength: Math.round(fielding),
    powerplayStrength: Math.round(powerplay),
    deathStrength: Math.round(death),
    captaincyBonus: Math.round(captaincyBonus * 10) / 10,
    balanceBonus,
    overallRating,
  };
}
