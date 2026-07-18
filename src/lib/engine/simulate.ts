import type { PitchType, Player } from "@/lib/types";
import { isPaceBowler, isSpinner } from "@/lib/types";
import { OPPONENT_FRANCHISES, VENUES } from "@/lib/data/franchises";
import { computeTeamRatings } from "@/lib/engine/teamRatings";
import { createRng, pickN, pickRandom, pickWeighted, type RandomFn } from "@/lib/engine/rng";

const SEASON_LENGTH = 14;
const DECISION_COUNT = 3;

interface PitchDef {
  type: PitchType;
  label: string;
  /** Shifts both teams' baseline run-scoring for this match. */
  runsAdjustment: number;
}

const PITCHES: PitchDef[] = [
  { type: "flat-batting", label: "Flat Batting Wicket", runsAdjustment: 14 },
  { type: "slow-turning", label: "Slow Turning Pitch", runsAdjustment: -8 },
  { type: "pace-and-bounce", label: "Pace and Bounce", runsAdjustment: -4 },
  { type: "swing-friendly", label: "Swing-Friendly Surface", runsAdjustment: -10 },
  { type: "dry-surface", label: "Dry Surface", runsAdjustment: -6 },
  { type: "high-scoring-small-ground", label: "High-Scoring Small Ground", runsAdjustment: 18 },
  { type: "large-boundaries", label: "Large Boundaries", runsAdjustment: -12 },
  { type: "heavy-dew-night", label: "Heavy-Dew Night Match", runsAdjustment: 8 },
];

const SUMMARY_TEMPLATES_WIN = [
  "{team} chased down {target} with overs to spare, powered by {star}.",
  "{team} posted {score} and never let {opponent} get close.",
  "{star} starred as {team} closed out a tight finish against {opponent}.",
  "A clinical performance saw {team} outplay {opponent} from ball one.",
  "{team} survived a late scare to beat {opponent} by {margin}.",
];

const SUMMARY_TEMPLATES_LOSS = [
  "{opponent} chased down {target} late, denying {team} at the death.",
  "{team} fell short of {target}, undone by a strong {opponent} bowling unit.",
  "A middle-overs collapse cost {team} against {opponent}.",
  "{opponent} posted {score} and {team} never recovered.",
  "{team} pushed {opponent} deep into the chase but came up short by {margin}.",
];

export type DecisionType = "pace-or-spin" | "defend-bowler" | "impact-player";

export interface DecisionOption {
  id: string;
  label: string;
}

export interface MatchDecision {
  matchNumber: number;
  type: DecisionType;
  prompt: string;
  context: string;
  options: DecisionOption[];
}

export interface MatchResult {
  matchNumber: number;
  opponent: string;
  venue: string;
  city: string;
  pitch: string;
  tossWonByUser: boolean;
  battingFirst: boolean;
  teamScore: number;
  opponentScore: number;
  result: "win" | "loss";
  margin: string;
  playerOfMatchId: string;
  summary: string;
  decision?: { type: DecisionType; choiceId: string; resultLabel: string };
}

export interface PlayerSeasonTotals {
  playerId: string;
  runs: number;
  wickets: number;
}

export interface SeasonStats {
  wins: number;
  losses: number;
  totalRunsFor: number;
  totalRunsAgainst: number;
  netRunRate: number;
  highestScore: number;
  lowestDefendedScore: number | null;
  bestChase: number | null;
  leadingRunScorer: PlayerSeasonTotals;
  leadingWicketTaker: PlayerSeasonTotals;
  mvpPlayerId: string;
  bestPickPlayerId: string;
  weakestPickPlayerId: string;
  teamRatingOutOf100: number;
  percentile: number;
}

export interface SeasonSimulationResult {
  matches: MatchResult[];
  stats: SeasonStats | null;
  pendingDecision: MatchDecision | null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pitchSuitability(pitch: PitchDef, xi: Player[]): number {
  const paceCount = xi.filter(isPaceBowler).length;
  const spinCount = xi.filter(isSpinner).length;
  switch (pitch.type) {
    case "slow-turning":
    case "dry-surface":
      return (spinCount - paceCount) * 1.5;
    case "pace-and-bounce":
    case "swing-friendly":
      return (paceCount - spinCount) * 1.5;
    default:
      return 0;
  }
}

function simulateInningsScore(rng: RandomFn, strength: number, pitch: PitchDef, suitability: number): number {
  const base = 128 + (strength - 65) * 1.6 + pitch.runsAdjustment + suitability;
  const variance = (rng() - 0.5) * 34;
  return Math.max(85, Math.round(base + variance));
}

function formatMargin(result: "win" | "loss", battingFirst: boolean, teamScore: number, opponentScore: number): string {
  if (battingFirst) {
    const runs = Math.abs(teamScore - opponentScore);
    return `${runs} run${runs === 1 ? "" : "s"}`;
  }
  const wicketsInHand = Math.max(1, Math.min(9, Math.round((teamScore - opponentScore) / 12) + 3));
  return result === "win" ? `${wicketsInHand} wickets` : `${Math.abs(teamScore - opponentScore)} runs`;
}

function buildDecisionPrompt(
  type: DecisionType,
  matchNumber: number,
  bowlers: Player[],
  impactPlayer: Player | null
): MatchDecision {
  if (type === "defend-bowler") {
    const candidates = bowlers.slice(0, 3);
    return {
      matchNumber,
      type,
      prompt: "Defending a tight total in the final over. Who bowls it?",
      context: `Match ${matchNumber} is on a knife's edge.`,
      options: candidates.map((p) => ({ id: p.id, label: p.shortName })),
    };
  }
  if (type === "impact-player" && impactPlayer) {
    return {
      matchNumber,
      type,
      prompt: `Your Impact Player, ${impactPlayer.shortName}, is available. Bring them in?`,
      context: `Match ${matchNumber} is finely poised.`,
      options: [
        { id: "activate", label: `Activate ${impactPlayer.shortName}` },
        { id: "hold", label: "Hold them in reserve" },
      ],
    };
  }
  return {
    matchNumber,
    type: "pace-or-spin",
    prompt: "The opponent is settling in. How do you attack?",
    context: `Match ${matchNumber} — six overs gone, no wicket.`,
    options: [
      { id: "pace", label: "Attack with pace" },
      { id: "spin", label: "Turn to spin" },
    ],
  };
}

interface DecisionOutcome {
  teamBonus: number;
  opponentPenalty: number;
  resultLabel: string;
}

function resolveDecisionOutcome(
  decision: MatchDecision,
  choiceId: string,
  bowlers: Player[],
  impactPlayer: Player | null,
  xi: Player[]
): DecisionOutcome {
  if (decision.type === "pace-or-spin") {
    const paceAvg = average(bowlers.filter(isPaceBowler).map((p) => p.paceRating));
    const spinAvg = average(bowlers.filter(isSpinner).map((p) => p.spinRating));
    const chosenAvg = choiceId === "pace" ? paceAvg : spinAvg;
    const otherAvg = choiceId === "pace" ? spinAvg : paceAvg;
    const good = chosenAvg >= otherAvg;
    return {
      teamBonus: 0,
      opponentPenalty: good ? 6 : -3,
      resultLabel: good ? "The tactic paid off — the bowlers choked the scoring." : "The gamble didn't come off.",
    };
  }
  if (decision.type === "defend-bowler") {
    const bowler = bowlers.find((p) => p.id === choiceId);
    const avgDeath = average(bowlers.map((p) => p.deathOversBowling));
    const good = bowler ? bowler.deathOversBowling >= avgDeath : false;
    return {
      teamBonus: 0,
      opponentPenalty: good ? 7 : -4,
      resultLabel: good
        ? `${bowler?.shortName ?? "The bowler"} held their nerve at the death.`
        : `${bowler?.shortName ?? "The bowler"} was taken apart at the death.`,
    };
  }
  // impact-player
  if (choiceId === "activate" && impactPlayer) {
    const boost = (impactPlayer.deathOversBatting + impactPlayer.deathOversBowling) / 2;
    const xiAvg = average(xi.map((p) => p.overallRating));
    const good = boost > xiAvg;
    return {
      teamBonus: good ? 6 : 2,
      opponentPenalty: 0,
      resultLabel: good
        ? `${impactPlayer.shortName} made an instant impact.`
        : `${impactPlayer.shortName} got some overs in but didn't change the game.`,
    };
  }
  return { teamBonus: 0, opponentPenalty: 0, resultLabel: "Held the Impact Player in reserve." };
}

export function simulateSeason(
  seed: string,
  xi: Player[],
  battingOrderIds: string[],
  captainId: string,
  impactPlayer: Player | null,
  decisions: Record<number, string>
): SeasonSimulationResult {
  const rng = createRng(`${seed}::season`);
  const battingOrder = battingOrderIds
    .map((id) => xi.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const captain = xi.find((p) => p.id === captainId) ?? xi[0];
  const ratings = computeTeamRatings(xi, battingOrder.length ? battingOrder : xi, captain);

  const topBatters = (battingOrder.length ? battingOrder : xi).slice(0, 7);
  const battingWeights = [1.3, 1.2, 1.1, 1.0, 0.9, 0.7, 0.5];
  const bowlers = xi.filter((p) => p.t20BowlingRating > 0);

  // Decision matches and their types are fixed by the seed up front, so
  // replaying this function with a growing `decisions` map always produces
  // byte-identical results for already-resolved matches.
  const decisionMatchNumbers = pickN(
    rng,
    Array.from({ length: SEASON_LENGTH }, (_, i) => i + 1),
    DECISION_COUNT
  ).sort((a, b) => a - b);
  const decisionTypes: DecisionType[] = ["pace-or-spin", "defend-bowler", "impact-player"];
  const decisionMatchMap = new Map<number, DecisionType>();
  decisionMatchNumbers.forEach((matchNumber, i) => {
    let type = decisionTypes[i] ?? "pace-or-spin";
    if (type === "impact-player" && !impactPlayer) type = "pace-or-spin";
    if (type === "defend-bowler" && bowlers.length < 2) type = "pace-or-spin";
    decisionMatchMap.set(matchNumber, type);
  });

  const runTotals = new Map<string, number>();
  const wicketTotals = new Map<string, number>();
  xi.forEach((p) => {
    runTotals.set(p.id, 0);
    wicketTotals.set(p.id, 0);
  });

  const matches: MatchResult[] = [];
  let wins = 0;
  let totalRunsFor = 0;
  let totalRunsAgainst = 0;
  let highestScore = 0;
  let lowestDefendedScore: number | null = null;
  let bestChase: number | null = null;

  for (let matchNumber = 1; matchNumber <= SEASON_LENGTH; matchNumber++) {
    const decisionType = decisionMatchMap.get(matchNumber);
    let decisionOutcome: DecisionOutcome | null = null;
    let decisionRecord: MatchResult["decision"] | undefined;

    if (decisionType) {
      const choiceId = decisions[matchNumber];
      if (!choiceId) {
        const pendingDecision = buildDecisionPrompt(decisionType, matchNumber, bowlers, impactPlayer);
        return { matches, stats: null, pendingDecision };
      }
      const decision = buildDecisionPrompt(decisionType, matchNumber, bowlers, impactPlayer);
      decisionOutcome = resolveDecisionOutcome(decision, choiceId, bowlers, impactPlayer, xi);
      decisionRecord = { type: decisionType, choiceId, resultLabel: decisionOutcome.resultLabel };
    }

    const opponent = pickRandom(rng, OPPONENT_FRANCHISES);
    const venue = pickRandom(rng, VENUES);
    const pitch = pickRandom(rng, PITCHES);
    const suitability = pitchSuitability(pitch, xi);

    const opponentStrength = 48 + rng() * 42; // 48-90 range of league opposition
    const tossWonByUser = rng() < 0.5;
    const battingFirst = tossWonByUser ? rng() < 0.55 : rng() < 0.45;

    const teamBonus = decisionOutcome?.teamBonus ?? 0;
    const opponentPenalty = decisionOutcome?.opponentPenalty ?? 0;

    const teamScore = simulateInningsScore(rng, ratings.overallRating + teamBonus, pitch, suitability);
    const opponentScore = simulateInningsScore(
      rng,
      opponentStrength - opponentPenalty,
      pitch,
      -suitability * 0.5
    );

    let result: "win" | "loss";
    if (teamScore === opponentScore) {
      // Super-over stand-in: nudge toward the stronger side.
      result = ratings.overallRating + suitability + teamBonus >= opponentStrength - opponentPenalty ? "win" : "loss";
    } else {
      result = teamScore > opponentScore ? "win" : "loss";
    }
    if (result === "win") wins++;

    totalRunsFor += teamScore;
    totalRunsAgainst += opponentScore;
    highestScore = Math.max(highestScore, teamScore);
    if (battingFirst && result === "win") {
      lowestDefendedScore = lowestDefendedScore === null ? teamScore : Math.min(lowestDefendedScore, teamScore);
    }
    if (!battingFirst && result === "win") {
      bestChase = bestChase === null ? teamScore : Math.max(bestChase, teamScore);
    }

    // Distribute this match's runs/wickets across the XI for season totals.
    const battingWeightSum = topBatters.reduce(
      (sum, p, i) => sum + (battingWeights[i] ?? 0.3) * (p.t20BattingRating / 100),
      0
    );
    topBatters.forEach((p, i) => {
      const weight = (battingWeights[i] ?? 0.3) * (p.t20BattingRating / 100);
      const share = battingWeightSum > 0 ? weight / battingWeightSum : 1 / topBatters.length;
      const playerRuns = Math.round(teamScore * share * (0.85 + rng() * 0.3));
      runTotals.set(p.id, (runTotals.get(p.id) ?? 0) + Math.max(0, playerRuns));
    });

    const wicketsThisMatch = Math.min(10, Math.max(3, Math.round(4 + rng() * 6)));
    const bowlingWeightSum = bowlers.reduce((sum, p) => sum + p.t20BowlingRating, 0);
    let wicketsRemaining = wicketsThisMatch;
    bowlers.forEach((p, i) => {
      const share = bowlingWeightSum > 0 ? p.t20BowlingRating / bowlingWeightSum : 1 / bowlers.length;
      const playerWickets =
        i === bowlers.length - 1
          ? wicketsRemaining
          : Math.min(wicketsRemaining, Math.round(wicketsThisMatch * share * (0.7 + rng() * 0.6)));
      wicketsRemaining = Math.max(0, wicketsRemaining - playerWickets);
      wicketTotals.set(p.id, (wicketTotals.get(p.id) ?? 0) + Math.max(0, playerWickets));
    });

    const standoutPool = topBatters.length ? topBatters : xi;
    const playerOfMatch = pickWeighted(rng, standoutPool, (p) => p.t20BattingRating + p.clutchRating * 0.3);

    const target = opponentScore + 1;
    const margin = formatMargin(result, battingFirst, teamScore, opponentScore);
    const templates = result === "win" ? SUMMARY_TEMPLATES_WIN : SUMMARY_TEMPLATES_LOSS;
    const summary = pickRandom(rng, templates)
      .replace("{team}", "Your XI")
      .replace("{opponent}", opponent)
      .replace("{target}", String(target))
      .replace("{score}", String(battingFirst ? teamScore : opponentScore))
      .replace("{star}", playerOfMatch.shortName)
      .replace("{margin}", margin);

    matches.push({
      matchNumber,
      opponent,
      venue: venue.name,
      city: venue.city,
      pitch: pitch.label,
      tossWonByUser,
      battingFirst,
      teamScore,
      opponentScore,
      result,
      margin,
      playerOfMatchId: playerOfMatch.id,
      summary,
      decision: decisionRecord,
    });
  }

  const leadingRunScorer = [...runTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const leadingWicketTaker = [...wicketTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const maxRuns = leadingRunScorer?.[1] || 1;
  const maxWickets = leadingWicketTaker?.[1] || 1;

  let mvpPlayerId = xi[0].id;
  let mvpScore = -Infinity;
  xi.forEach((p) => {
    const runShare = (runTotals.get(p.id) ?? 0) / maxRuns;
    const wicketShare = (wicketTotals.get(p.id) ?? 0) / maxWickets;
    const score = runShare * 0.6 + wicketShare * 0.4;
    if (score > mvpScore) {
      mvpScore = score;
      mvpPlayerId = p.id;
    }
  });

  const byOverall = [...xi].sort((a, b) => b.overallRating - a.overallRating);
  const bestPickPlayerId = byOverall[0].id;
  const weakestPickPlayerId = byOverall[byOverall.length - 1].id;

  const netRunRate =
    Math.round(((totalRunsFor - totalRunsAgainst) / (SEASON_LENGTH * 20)) * 100) / 100;
  const percentile = Math.max(1, Math.min(99, Math.round((wins / SEASON_LENGTH) * 90) + 5));

  const stats: SeasonStats = {
    wins,
    losses: SEASON_LENGTH - wins,
    totalRunsFor,
    totalRunsAgainst,
    netRunRate,
    highestScore,
    lowestDefendedScore,
    bestChase,
    leadingRunScorer: { playerId: leadingRunScorer?.[0] ?? xi[0].id, runs: leadingRunScorer?.[1] ?? 0, wickets: 0 },
    leadingWicketTaker: {
      playerId: leadingWicketTaker?.[0] ?? xi[0].id,
      runs: 0,
      wickets: leadingWicketTaker?.[1] ?? 0,
    },
    mvpPlayerId,
    bestPickPlayerId,
    weakestPickPlayerId,
    teamRatingOutOf100: ratings.overallRating,
    percentile,
  };

  return { matches, stats, pendingDecision: null };
}
