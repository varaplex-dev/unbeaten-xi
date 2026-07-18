import type { DraftCategory, DraftCategoryId, DraftRound, Player, RosterNeeds } from "@/lib/types";
import {
  MAX_OVERSEAS,
  MIN_BOWLING_OPTIONS,
  MIN_PACE_BOWLERS,
  MIN_SPINNERS,
  MIN_WICKETKEEPERS,
  SQUAD_SIZE,
} from "@/lib/types";
import { canBowl, isPaceBowler, isSpinner, isWicketkeeper } from "@/lib/types";
import { PLAYERS } from "@/lib/data/players";
import { DRAFT_CATEGORIES, getCategory } from "@/lib/engine/draftCategories";
import { createRng, pickN, pickNWeighted, pickWeighted } from "@/lib/engine/rng";

const MIN_OPTIONS = 3;
const MAX_OPTIONS = 5;
const IMPACT_PLAYER_OPTIONS = 4;

export function computeRosterNeeds(drafted: Player[]): RosterNeeds {
  const slotsRemaining = SQUAD_SIZE - drafted.length;
  const wicketkeepersNeeded = Math.max(
    0,
    MIN_WICKETKEEPERS - drafted.filter(isWicketkeeper).length
  );
  const bowlingOptionsNeeded = Math.max(
    0,
    MIN_BOWLING_OPTIONS - drafted.filter(canBowl).length
  );
  const paceBowlersNeeded = Math.max(
    0,
    MIN_PACE_BOWLERS - drafted.filter(isPaceBowler).length
  );
  const spinnersNeeded = Math.max(0, MIN_SPINNERS - drafted.filter(isSpinner).length);
  const overseasSlotsRemaining = Math.max(
    0,
    MAX_OVERSEAS - drafted.filter((p) => p.nationalityType === "overseas").length
  );

  return {
    slotsRemaining,
    wicketkeepersNeeded,
    bowlingOptionsNeeded,
    paceBowlersNeeded,
    spinnersNeeded,
    overseasSlotsRemaining,
  };
}

/**
 * A need is "critical" once there are no longer enough remaining rounds to
 * safely defer it — i.e. addressing it later might no longer be possible.
 * slotsRemaining includes the current round, so a need is critical when its
 * count is >= slotsRemaining (every remaining pick, including this one, must
 * go toward it).
 */
function criticalNeedCategory(needs: RosterNeeds): DraftCategory | null {
  const { slotsRemaining, wicketkeepersNeeded, paceBowlersNeeded, spinnersNeeded, bowlingOptionsNeeded } =
    needs;

  if (wicketkeepersNeeded >= slotsRemaining) return getCategory("wicketkeeper");
  if (paceBowlersNeeded >= slotsRemaining) return getCategory("fast-bowler");
  if (spinnersNeeded >= slotsRemaining) return getCategory("spinner");
  if (bowlingOptionsNeeded >= slotsRemaining) return getCategory("allrounder");
  return null;
}

/**
 * Boosts a category's draft odds while its matching roster need is still
 * unmet, so constraints tend to get filled naturally across the draft
 * instead of only getting guaranteed at the very last possible round by
 * criticalNeedCategory(). This is probabilistic, not a hard force — other
 * categories can still come up, just less often while a need is open.
 */
function urgencyMultiplier(category: DraftCategory, needs: RosterNeeds): number {
  switch (category.id) {
    case "wicketkeeper":
      return needs.wicketkeepersNeeded > 0 ? 3 : 1;
    case "fast-bowler":
      return needs.paceBowlersNeeded > 0 ? 3 : 1;
    case "spinner":
      return needs.spinnersNeeded > 0 ? 3 : 1;
    case "allrounder":
      return needs.bowlingOptionsNeeded > 0 ? 2 : 1;
    default:
      return 1;
  }
}

function effectiveWeight(category: DraftCategory, needs: RosterNeeds): number {
  return category.weight * urgencyMultiplier(category, needs);
}

/** Applies global roster constraints (overseas cap, no duplicates) on top of a category filter. */
function eligiblePlayers(
  category: DraftCategory,
  pool: Player[],
  draftedIds: Set<string>,
  needs: RosterNeeds
): Player[] {
  return pool.filter((p) => {
    if (draftedIds.has(p.id)) return false;
    if (p.nationalityType === "overseas" && needs.overseasSlotsRemaining <= 0) return false;
    return category.filter(p);
  });
}

export interface GenerateRoundOptions {
  seed: string;
  roundNumber: number;
  draftedSoFar: Player[];
  pool?: Player[];
}

export function generateDraftRound({
  seed,
  roundNumber,
  draftedSoFar,
  pool = PLAYERS,
}: GenerateRoundOptions): DraftRound {
  const rng = createRng(`${seed}::round-${roundNumber}`);
  const draftedIds = new Set(draftedSoFar.map((p) => p.id));
  const needs = computeRosterNeeds(draftedSoFar);

  const forced = criticalNeedCategory(needs);
  let category: DraftCategory;
  let options: Player[];

  if (forced) {
    category = forced;
    options = eligiblePlayers(category, pool, draftedIds, needs);
  } else {
    // Weighted-random category selection, skipping any category that
    // doesn't have enough eligible players left to make a real choice.
    // The wildcard category (filter: always true) is the guaranteed
    // fallback since it only excludes already-drafted/over-cap players.
    const candidates = DRAFT_CATEGORIES;
    const attempted = new Set<string>();
    let chosen: { category: DraftCategory; options: Player[] } | null = null;

    while (!chosen) {
      const remaining = candidates.filter((c) => !attempted.has(c.id));
      if (remaining.length === 0) break;
      const pick = pickWeighted(rng, remaining, (c) => effectiveWeight(c, needs));
      attempted.add(pick.id);
      const eligible = eligiblePlayers(pick, pool, draftedIds, needs);
      if (eligible.length >= MIN_OPTIONS || pick.id === "wildcard") {
        chosen = { category: pick, options: eligible };
      }
    }

    if (!chosen) {
      const wildcard = getCategory("wildcard");
      chosen = { category: wildcard, options: eligiblePlayers(wildcard, pool, draftedIds, needs) };
    }

    category = chosen.category;
    options = chosen.options;
  }

  const targetCount = Math.min(options.length, MAX_OPTIONS);
  const selected = pickN(rng, options, Math.max(1, targetCount));

  return {
    roundNumber,
    category,
    options: selected,
  };
}

export interface CompositionCheckResult {
  legal: boolean;
  issues: { code: string; message: string; severity: "error" | "warning" }[];
}

export function checkComposition(drafted: Player[]): CompositionCheckResult {
  const issues: CompositionCheckResult["issues"] = [];

  if (drafted.length !== SQUAD_SIZE) {
    issues.push({
      code: "squad-size",
      message: `Squad must have exactly ${SQUAD_SIZE} players (currently ${drafted.length}).`,
      severity: "error",
    });
  }

  const keepers = drafted.filter(isWicketkeeper).length;
  if (keepers < MIN_WICKETKEEPERS) {
    issues.push({
      code: "wicketkeeper",
      message: "At least one wicketkeeper is required.",
      severity: "error",
    });
  }

  const bowlers = drafted.filter(canBowl).length;
  if (bowlers < MIN_BOWLING_OPTIONS) {
    issues.push({
      code: "bowling-options",
      message: `At least ${MIN_BOWLING_OPTIONS} bowling options are required.`,
      severity: "error",
    });
  }

  const pacers = drafted.filter(isPaceBowler).length;
  if (pacers < MIN_PACE_BOWLERS) {
    issues.push({
      code: "pace-bowler",
      message: "At least one specialist pace bowler is required.",
      severity: "error",
    });
  }

  const spinners = drafted.filter(isSpinner).length;
  if (spinners < MIN_SPINNERS) {
    issues.push({
      code: "spinner",
      message: "At least one specialist spinner is required.",
      severity: "error",
    });
  }

  const overseas = drafted.filter((p) => p.nationalityType === "overseas").length;
  if (overseas > MAX_OVERSEAS) {
    issues.push({
      code: "overseas-limit",
      message: `No more than ${MAX_OVERSEAS} overseas players are allowed.`,
      severity: "error",
    });
  }

  return { legal: issues.every((i) => i.severity !== "error"), issues };
}

/**
 * A small bench of Impact Player candidates drawn from whoever's left after
 * the XI is drafted, weighted toward versatile difference-makers (strong at
 * the death, clutch under pressure) rather than a uniform random slice.
 */
function impactScore(p: Player): number {
  return p.deathOversBatting * 0.3 + p.deathOversBowling * 0.3 + p.clutchRating * 0.2 + p.overallRating * 0.2;
}

export function generateImpactPlayerOptions(seed: string, xi: Player[], pool: Player[] = PLAYERS): Player[] {
  const rng = createRng(`${seed}::impact-player`);
  const draftedIds = new Set(xi.map((p) => p.id));
  const eligible = pool.filter((p) => !draftedIds.has(p.id));
  return pickNWeighted(rng, eligible, Math.min(IMPACT_PLAYER_OPTIONS, eligible.length), impactScore);
}

export interface RandomXiPick {
  roundNumber: number;
  categoryId: DraftCategoryId;
  player: Player;
}

/**
 * "Spin the Wheel": generates a complete, legal XI in one shot instead of an
 * interactive round-by-round draft. Deliberately reuses generateDraftRound()
 * for every pick — same category weighting, same critical-need forcing,
 * same overseas cap and duplicate-prevention rules — so a spun team is held
 * to exactly the same legality guarantees as a manually drafted one. The
 * only new logic here is HOW a pick is chosen from a round's options: a
 * skill-weighted random draw (weight = overallRating cubed) so the result
 * leans toward a competitive team without being a deterministic
 * highest-rating-wins pick every round, which would make every spin with a
 * given seed converge on the same handful of stars.
 */
export function generateRandomXI(seed: string, pool: Player[] = PLAYERS): RandomXiPick[] {
  const rng = createRng(`${seed}::spin-wheel::picks`);
  const drafted: Player[] = [];
  const picks: RandomXiPick[] = [];

  for (let roundNumber = 1; roundNumber <= SQUAD_SIZE; roundNumber++) {
    const round = generateDraftRound({
      seed: `${seed}::spin-wheel`,
      roundNumber,
      draftedSoFar: drafted,
      pool,
    });
    const pick = pickWeighted(rng, round.options, (p) => Math.pow(Math.max(1, p.overallRating), 3));
    drafted.push(pick);
    picks.push({ roundNumber, categoryId: round.category.id, player: pick });
  }

  return picks;
}

/** Weighted-random Impact Player pick for the spin-the-wheel flow, using the same candidate pool as the manual picker. */
export function spinImpactPlayer(seed: string, xi: Player[], pool: Player[] = PLAYERS): Player | null {
  const rng = createRng(`${seed}::spin-wheel::impact`);
  const options = generateImpactPlayerOptions(seed, xi, pool);
  if (options.length === 0) return null;
  return pickWeighted(rng, options, impactScore);
}
