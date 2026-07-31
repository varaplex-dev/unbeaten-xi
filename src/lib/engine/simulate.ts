import type { EraTeam, PitchType, Player } from "@/lib/types";
import { isPaceBowler, isSpinner } from "@/lib/types";
import { OPPONENT_FRANCHISES, VENUES } from "@/lib/data/franchises";
import { eraTeams } from "@/lib/data/gameData";
import { projectInnings, teamStrength } from "@/lib/engine/matchEngine";
import { computeTeamRatings } from "@/lib/engine/teamRatings";
import {
  battingProfile,
  bowlingAverageOnT20Scale,
  economyOnT20Scale,
  hasCareerStats,
} from "@/lib/engine/statsSimulation";
import { fieldingWicketBonus, type FieldingAssignments } from "@/lib/engine/fielding";
import { createRng, pickN, pickRandom, pickWeighted, type RandomFn } from "@/lib/engine/rng";
import { matchesFor, type CompetitionId } from "@/lib/engine/competitions";

// Season length is no longer a constant here — it comes from the competition
// being played (see competitions.ts). The old hardcoded 14 was an IPL league
// campaign all along; it is now labelled as one, and a World Cup run is 9.
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

// Fixed option kinds map to translated labels in the UI. `undefined` means the
// label is a proper noun (a bowler's name) and is shown verbatim.
export type DecisionOptionKind = "pace" | "spin" | "activate" | "hold";

// Semantic outcome of a resolved decision. The engine stays i18n-agnostic and
// emits one of these; the UI maps it to a translated result line.
export type DecisionOutcomeKind =
  | "pace-spin-good"
  | "pace-spin-bad"
  | "defend-good"
  | "defend-bad"
  | "impact-good"
  | "impact-bad"
  | "impact-hold";

export interface DecisionOption {
  id: string;
  label: string;
  kind?: DecisionOptionKind;
}

export interface MatchDecision {
  matchNumber: number;
  type: DecisionType;
  prompt: string;
  context: string;
  options: DecisionOption[];
  // The impact player's short name, for the impact-player prompt/options; the
  // UI fills it into the translated string.
  subjectName?: string;
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
  // Structured margin + pitch so the UI can render them translated instead of
  // the pre-rendered English `margin`/`pitch`. Optional: results saved before
  // this was added fall back to the English strings above.
  marginType?: "runs" | "wickets";
  marginValue?: number;
  pitchType?: PitchType;
  playerOfMatchId: string;
  summary: string;
  decision?: {
    type: DecisionType;
    choiceId: string;
    resultLabel: string;
    // Structured outcome so the UI renders the result line translated; older
    // saved results without it fall back to `resultLabel` (English).
    outcome?: DecisionOutcomeKind;
    subjectName?: string;
  };
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

/** The margin as structured data, so the UI can render "N runs"/"N wickets"
 * in any language. Batting first → won/lost by runs; chasing → won by wickets
 * in hand, lost by runs. */
function marginParts(
  result: "win" | "loss",
  battingFirst: boolean,
  teamScore: number,
  opponentScore: number
): { type: "runs" | "wickets"; value: number } {
  if (battingFirst || result === "loss") {
    return { type: "runs", value: Math.abs(teamScore - opponentScore) };
  }
  const wicketsInHand = Math.max(1, Math.min(9, Math.round((teamScore - opponentScore) / 12) + 3));
  return { type: "wickets", value: wicketsInHand };
}

function formatMargin(result: "win" | "loss", battingFirst: boolean, teamScore: number, opponentScore: number): string {
  const { type, value } = marginParts(result, battingFirst, teamScore, opponentScore);
  return `${value} ${type === "wickets" ? "wicket" : "run"}${value === 1 ? "" : "s"}`;
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
      subjectName: impactPlayer.shortName,
      options: [
        { id: "activate", label: `Activate ${impactPlayer.shortName}`, kind: "activate" },
        { id: "hold", label: "Hold them in reserve", kind: "hold" },
      ],
    };
  }
  return {
    matchNumber,
    type: "pace-or-spin",
    prompt: "The opponent is settling in. How do you attack?",
    context: `Match ${matchNumber} — six overs gone, no wicket.`,
    options: [
      { id: "pace", label: "Attack with pace", kind: "pace" },
      { id: "spin", label: "Turn to spin", kind: "spin" },
    ],
  };
}

interface DecisionOutcome {
  teamBonus: number;
  opponentPenalty: number;
  resultLabel: string;
  outcomeKind: DecisionOutcomeKind;
  subjectName?: string;
}

/** Lower economy = a better bet for both the pace-or-spin call and picking
 * who defends the final over — real economy rate (converted onto a common
 * T20-equivalent scale, see statsSimulation.ts) is a direct, intuitive
 * "how many runs does this bowler leak" signal, unlike the abstract
 * paceRating/spinRating/deathOversBowling fields it replaces here. */
function economyOf(p: Player): number {
  return (p.careerStats && economyOnT20Scale(p.careerStats)) ?? 9;
}

function strikeRateOf(p: Player): number {
  return battingProfile(p).strikeRate;
}

function resolveDecisionOutcome(
  decision: MatchDecision,
  choiceId: string,
  bowlers: Player[],
  impactPlayer: Player | null,
  xi: Player[]
): DecisionOutcome {
  const isStatsGame = hasCareerStats(xi);

  if (decision.type === "pace-or-spin") {
    const paceGroup = bowlers.filter(isPaceBowler);
    const spinGroup = bowlers.filter(isSpinner);
    let good: boolean;
    if (isStatsGame) {
      // Lower economy wins — pick whichever attack leaks fewer runs.
      const paceEcon = average(paceGroup.map(economyOf));
      const spinEcon = average(spinGroup.map(economyOf));
      const chosenEcon = choiceId === "pace" ? paceEcon : spinEcon;
      const otherEcon = choiceId === "pace" ? spinEcon : paceEcon;
      good = chosenEcon > 0 && (otherEcon === 0 || chosenEcon <= otherEcon);
    } else {
      const paceAvg = average(paceGroup.map((p) => p.paceRating));
      const spinAvg = average(spinGroup.map((p) => p.spinRating));
      const chosenAvg = choiceId === "pace" ? paceAvg : spinAvg;
      const otherAvg = choiceId === "pace" ? spinAvg : paceAvg;
      good = chosenAvg >= otherAvg;
    }
    return {
      teamBonus: 0,
      opponentPenalty: good ? 6 : -3,
      resultLabel: good ? "The tactic paid off — the bowlers choked the scoring." : "The gamble didn't come off.",
      outcomeKind: good ? "pace-spin-good" : "pace-spin-bad",
    };
  }
  if (decision.type === "defend-bowler") {
    const bowler = bowlers.find((p) => p.id === choiceId);
    let good: boolean;
    if (isStatsGame) {
      const avgEcon = average(bowlers.map(economyOf));
      good = bowler ? economyOf(bowler) <= avgEcon : false;
    } else {
      const avgDeath = average(bowlers.map((p) => p.deathOversBowling));
      good = bowler ? bowler.deathOversBowling >= avgDeath : false;
    }
    return {
      teamBonus: 0,
      opponentPenalty: good ? 7 : -4,
      resultLabel: good
        ? `${bowler?.shortName ?? "The bowler"} held their nerve at the death.`
        : `${bowler?.shortName ?? "The bowler"} was taken apart at the death.`,
      outcomeKind: good ? "defend-good" : "defend-bad",
      subjectName: bowler?.shortName,
    };
  }
  // impact-player
  if (choiceId === "activate" && impactPlayer) {
    let good: boolean;
    if (isStatsGame) {
      // A genuine death-overs weapon: a fast scorer, an economical bowler
      // (or both), measured against the XI's own average on each axis.
      const xiSrAvg = average(xi.map(strikeRateOf));
      const xiEconAvg = average(xi.filter((p) => p.careerStats?.economyRate !== null).map(economyOf));
      const battingEdge = strikeRateOf(impactPlayer) - xiSrAvg;
      const bowlingEdge = impactPlayer.careerStats?.economyRate !== null ? xiEconAvg - economyOf(impactPlayer) : 0;
      good = battingEdge > 5 || bowlingEdge > 0.3;
    } else {
      const boost = (impactPlayer.deathOversBatting + impactPlayer.deathOversBowling) / 2;
      const xiAvg = average(xi.map((p) => p.overallRating));
      good = boost > xiAvg;
    }
    return {
      teamBonus: good ? 6 : 2,
      opponentPenalty: 0,
      resultLabel: good
        ? `${impactPlayer.shortName} made an instant impact.`
        : `${impactPlayer.shortName} got some overs in but didn't change the game.`,
      outcomeKind: good ? "impact-good" : "impact-bad",
      subjectName: impactPlayer.shortName,
    };
  }
  return {
    teamBonus: 0,
    opponentPenalty: 0,
    resultLabel: "Held the Impact Player in reserve.",
    outcomeKind: "impact-hold",
  };
}

// League run-scoring is anchored to this "modern" year; a drafted XI whose
// average era predates it faces proportionally lower-scoring opposition, so
// a legends side isn't measured against present-day T20 run-rates (its own
// real stats already convert to lower T20-equivalent outputs). Capped so the
// adjustment stays a fairness nudge, not a free win.
const MODERN_ERA_YEAR = 2020;
const MAX_ERA_SCALE_DOWN = 0.15;

/** The strongest XI a real era team can field, used as a season opponent. */
function opponentXiFor(team: EraTeam): Player[] {
  return [...team.players].sort((a, b) => b.overallRating - a.overallRating).slice(0, 11);
}

/**
 * Builds the season's real opponents: rank every era team by net strength,
 * then walk that ranking in even steps so the schedule spans the full range
 * of difficulty. The seeded rng only picks the starting offset, so the spread
 * is guaranteed while the exact fixtures still vary by season.
 *
 * The step is derived from `seasonLength`, so a shorter competition still
 * meets the same span of weak-to-elite opposition rather than just truncating
 * the fixture list and facing only the weakest sides.
 */
function buildOpponentSchedule(rng: RandomFn, seasonLength: number): { name: string; xi: Player[] }[] {
  const ranked = eraTeams().filter((t) => t.players.length >= 11)
    .map((t) => ({ team: t, xi: opponentXiFor(t) }))
    .map((e) => ({ ...e, strength: teamStrength(e.xi) }))
    .sort((a, b) => a.strength - b.strength);
  if (ranked.length === 0) return [];

  const schedule: { name: string; xi: Player[] }[] = [];
  const step = ranked.length / seasonLength;
  const offset = rng() * step;
  for (let i = 0; i < seasonLength; i++) {
    const idx = Math.min(ranked.length - 1, Math.floor(offset + i * step));
    const entry = ranked[idx];
    schedule.push({ name: `${entry.team.name} (${entry.team.eraLabel})`, xi: entry.xi });
  }
  return schedule;
}

function eraOpponentScale(averageEra?: number): number {
  if (!averageEra) return 1;
  const yearsBack = Math.max(0, MODERN_ERA_YEAR - averageEra);
  return 1 - Math.min(MAX_ERA_SCALE_DOWN, yearsBack * 0.0035);
}

/** Trailing options for a season. Grouped rather than added as further
 * positional parameters — the list was already eight long, and a bare
 * `simulateSeason(…, undefined, 2019, "world-cup")` is far too easy to
 * misorder. */
export interface SeasonOptions {
  fieldingAssignments?: FieldingAssignments;
  averageEra?: number;
  /** Which real competition's length this season runs to. Defaults to the
   * IPL-style league campaign, i.e. the original 14 matches. */
  competition?: CompetitionId;
  /** Whether the interactive in-match decisions (pace-or-spin, defend-bowler,
   * impact-player) exist this season. They're a Hardcore-Mode mechanic, so
   * Classic passes false: no decision matches are created, which means no
   * decision bonuses and — the visible fix — no "the gamble didn't come off"
   * narratives for calls the player never made. Defaults to true. */
  decisionsEnabled?: boolean;
}

export function simulateSeason(
  seed: string,
  xi: Player[],
  battingOrderIds: string[],
  captainId: string,
  impactPlayer: Player | null,
  decisions: Record<number, string>,
  options: SeasonOptions = {}
): SeasonSimulationResult {
  const { fieldingAssignments, averageEra, competition, decisionsEnabled = true } = options;
  const seasonLength = matchesFor(competition);
  const rng = createRng(`${seed}::season`);
  const battingOrder = battingOrderIds
    .map((id) => xi.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const captain = xi.find((p) => p.id === captainId) ?? xi[0];
  const ratings = computeTeamRatings(xi, battingOrder.length ? battingOrder : xi, captain);

  // Real/legend players carry real career stats — when every player in the
  // XI has them, the match math below is driven by real batting/bowling
  // numbers instead of the abstracted 0-99 ratings. Fictional players have
  // no career stats, so that (now unreachable from the UI, but still
  // intact) mode keeps running on the rating-based math unchanged.
  const isStatsGame = hasCareerStats(xi);
  const orderedForBatting = battingOrder.length ? battingOrder : xi;
  // Hardcore Mode's real-fielding-position layer nudges wicket-taking
  // threat a little — 0 when fieldingAssignments is absent/empty, so a
  // normal game is completely unaffected.
  const fieldingBonus = fieldingAssignments ? fieldingWicketBonus(xi, fieldingAssignments) : 0;
  // Cross-era fairness: scales league opponents down toward the squad's era.
  const eraScale = eraOpponentScale(averageEra);

  const topBatters = orderedForBatting.slice(0, 7);
  const battingWeights = [1.3, 1.2, 1.1, 1.0, 0.9, 0.7, 0.5];
  const bowlers = xi.filter((p) => p.t20BowlingRating > 0);

  // Decision matches and their types are fixed by the seed up front, so
  // replaying this function with a growing `decisions` map always produces
  // byte-identical results for already-resolved matches.
  const decisionMatchNumbers = pickN(
    rng,
    Array.from({ length: seasonLength }, (_, i) => i + 1),
    DECISION_COUNT
  ).sort((a, b) => a - b);
  const decisionTypes: DecisionType[] = ["pace-or-spin", "defend-bowler", "impact-player"];
  const decisionMatchMap = new Map<number, DecisionType>();
  // pickN above always runs so the match RNG stream is identical whether or not
  // decisions exist — Classic just leaves the map empty, so its match results
  // are the same minus the (now absent) decision bonuses.
  if (decisionsEnabled) {
    decisionMatchNumbers.forEach((matchNumber, i) => {
      let type = decisionTypes[i] ?? "pace-or-spin";
      if (type === "impact-player" && !impactPlayer) type = "pace-or-spin";
      if (type === "defend-bowler" && bowlers.length < 2) type = "pace-or-spin";
      decisionMatchMap.set(matchNumber, type);
    });
  }

  // A season of REAL opponents. Every era team is ranked by its net strength,
  // then the schedule takes an even spread across that range — so a season
  // includes genuinely weak sides, mid-table ones and elite attacks, and 14-0
  // means beating all of them rather than clearing a random number 14 times.
  const opponentSchedule = isStatsGame ? buildOpponentSchedule(rng, seasonLength) : [];

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

  for (let matchNumber = 1; matchNumber <= seasonLength; matchNumber++) {
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
      decisionRecord = {
        type: decisionType,
        choiceId,
        resultLabel: decisionOutcome.resultLabel,
        outcome: decisionOutcome.outcomeKind,
        subjectName: decisionOutcome.subjectName,
      };
    }

    // A real opposing side for a stats game; the fictional fallback keeps the
    // old generic franchise names.
    const fixture = opponentSchedule[matchNumber - 1];
    const opponent = fixture ? fixture.name : pickRandom(rng, OPPONENT_FRANCHISES);
    const venue = pickRandom(rng, VENUES);
    const pitch = pickRandom(rng, PITCHES);
    const suitability = pitchSuitability(pitch, xi);

    const tossWonByUser = rng() < 0.5;
    const battingFirst = tossWonByUser ? rng() < 0.55 : rng() < 0.45;

    const teamBonus = decisionOutcome?.teamBonus ?? 0;
    const opponentPenalty = decisionOutcome?.opponentPenalty ?? 0;

    // teamBaseline/opponentBaseline are in the same units the tie-break
    // below compares — run-equivalents for a stats game, 0-99 strength
    // points for a rating-based one.
    let teamScore: number;
    let opponentScore: number;
    let teamBaseline: number;
    let opponentBaseline: number;
    if (isStatsGame && fixture) {
      // A real contest: this XI's batting order against that side's actual
      // attack, phase by phase, and then the reverse. Pitch, in-match
      // decisions and the era scale enter as runs-per-over adjustments
      // (the raw values are per-innings, hence the /20).
      const teamInnings = projectInnings(rng, orderedForBatting, fixture.xi, {
        pitchAdjustment: (pitch.runsAdjustment + suitability + teamBonus) / 20,
        eraScale,
        fieldingBonus,
      });
      const opponentInnings = projectInnings(rng, fixture.xi, xi, {
        pitchAdjustment: (pitch.runsAdjustment - suitability * 0.5 - opponentPenalty) / 20,
        eraScale,
      });
      teamScore = teamInnings.runs;
      opponentScore = opponentInnings.runs;
      teamBaseline = teamInnings.baseline;
      opponentBaseline = opponentInnings.baseline;
    } else {
      teamBaseline = ratings.overallRating + teamBonus;
      opponentBaseline = 48 + rng() * 42 - opponentPenalty; // 48-90 range of league opposition
      teamScore = simulateInningsScore(rng, teamBaseline, pitch, suitability);
      opponentScore = simulateInningsScore(rng, opponentBaseline, pitch, -suitability * 0.5);
    }

    let result: "win" | "loss";
    if (teamScore === opponentScore) {
      // Super-over stand-in: nudge toward the stronger side.
      result = teamBaseline + suitability >= opponentBaseline ? "win" : "loss";
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

    // Distribute this match's runs/wickets across the XI for season totals —
    // weighted by real strike rate/reliability and real wicket-taking
    // signal (inverse bowling average) for a stats game, or by the 0-99
    // ratings otherwise.
    const battingWeightOf = (p: Player, i: number): number => {
      const posWeight = battingWeights[i] ?? 0.3;
      if (isStatsGame) return posWeight * (battingProfile(p).strikeRate / 100) * battingProfile(p).reliability;
      return posWeight * (p.t20BattingRating / 100);
    };
    const bowlingWeightOf = (p: Player): number => {
      const convertedAvg = isStatsGame && p.careerStats ? bowlingAverageOnT20Scale(p.careerStats) : null;
      if (convertedAvg !== null) {
        // Lower average = more wickets per run conceded = higher weight.
        return 1 / Math.max(10, convertedAvg);
      }
      return p.t20BowlingRating;
    };

    const battingWeightSum = topBatters.reduce((sum, p, i) => sum + battingWeightOf(p, i), 0);
    topBatters.forEach((p, i) => {
      const weight = battingWeightOf(p, i);
      const share = battingWeightSum > 0 ? weight / battingWeightSum : 1 / topBatters.length;
      const playerRuns = Math.round(teamScore * share * (0.85 + rng() * 0.3));
      runTotals.set(p.id, (runTotals.get(p.id) ?? 0) + Math.max(0, playerRuns));
    });

    const wicketsThisMatch = Math.min(10, Math.max(3, Math.round(4 + rng() * 6)));
    const bowlingWeightSum = bowlers.reduce((sum, p) => sum + bowlingWeightOf(p), 0);
    let wicketsRemaining = wicketsThisMatch;
    bowlers.forEach((p, i) => {
      const share = bowlingWeightSum > 0 ? bowlingWeightOf(p) / bowlingWeightSum : 1 / bowlers.length;
      const playerWickets =
        i === bowlers.length - 1
          ? wicketsRemaining
          : Math.min(wicketsRemaining, Math.round(wicketsThisMatch * share * (0.7 + rng() * 0.6)));
      wicketsRemaining = Math.max(0, wicketsRemaining - playerWickets);
      wicketTotals.set(p.id, (wicketTotals.get(p.id) ?? 0) + Math.max(0, playerWickets));
    });

    const standoutPool = topBatters.length ? topBatters : xi;
    const playerOfMatch = pickWeighted(rng, standoutPool, (p) =>
      isStatsGame
        ? battingProfile(p).strikeRate * battingProfile(p).reliability
        : p.t20BattingRating + p.clutchRating * 0.3
    );

    const target = opponentScore + 1;
    const margin = formatMargin(result, battingFirst, teamScore, opponentScore);
    const marginBits = marginParts(result, battingFirst, teamScore, opponentScore);
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
      marginType: marginBits.type,
      marginValue: marginBits.value,
      pitchType: pitch.type,
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

  // "Best/weakest pick" is a single ranking number purely for this one
  // callout — not shown to the user as a "rating". For a stats game it's
  // derived straight from real career numbers (whichever discipline the
  // player is stronger in); the fictional fallback keeps using the 0-99
  // overallRating.
  const pickQuality = (p: Player): number => {
    if (!isStatsGame) return p.overallRating;
    const cs = p.careerStats;
    if (!cs) return 0;
    const { strikeRate, reliability } = battingProfile(p);
    const battingScore = cs.battingAverage !== null ? strikeRate * reliability : 0;
    const convertedBowlingAvg = bowlingAverageOnT20Scale(cs);
    const convertedEconomy = economyOnT20Scale(cs);
    const bowlingScore =
      convertedBowlingAvg !== null && convertedEconomy !== null
        ? Math.max(0, 60 - convertedBowlingAvg) + Math.max(0, 12 - convertedEconomy) * 5
        : 0;
    return Math.max(battingScore, bowlingScore);
  };
  const byQuality = [...xi].sort((a, b) => pickQuality(b) - pickQuality(a));
  const bestPickPlayerId = byQuality[0].id;
  const weakestPickPlayerId = byQuality[byQuality.length - 1].id;

  const netRunRate =
    Math.round(((totalRunsFor - totalRunsAgainst) / (seasonLength * 20)) * 100) / 100;
  const percentile = Math.max(1, Math.min(99, Math.round((wins / seasonLength) * 90) + 5));

  const stats: SeasonStats = {
    wins,
    losses: seasonLength - wins,
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
