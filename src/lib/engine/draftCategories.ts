import type { DraftCategory, DraftCategoryId, Player } from "@/lib/types";
import { isPaceBowler, isSpinner, isWicketkeeper } from "@/lib/types";

function hasRole(player: Player, role: Player["primaryRole"]): boolean {
  return player.primaryRole === role || player.secondaryRoles.includes(role);
}

function isAllrounder(player: Player): boolean {
  return hasRole(player, "batting-allrounder") || hasRole(player, "bowling-allrounder");
}

// The full set of flavor prompts the draft can surface. Each category is a
// pure predicate over the static player pool, so the draft engine can filter
// deterministically without any hidden state.
export const DRAFT_CATEGORIES: DraftCategory[] = [
  {
    id: "indian-opener",
    label: "Indian Opener",
    description: "An Indian batter who can take the new ball head-on.",
    filter: (p) => p.nationalityType === "indian" && hasRole(p, "opener"),
    weight: 6,
  },
  {
    id: "overseas-finisher",
    label: "Overseas Finisher",
    description: "An overseas batter built to close out the innings.",
    filter: (p) => p.nationalityType === "overseas" && hasRole(p, "finisher"),
    weight: 5,
  },
  {
    id: "left-handed-batter",
    label: "Left-Handed Batter",
    description: "A left-hander to add variety to the batting order.",
    filter: (p) => p.battingHand === "left" && p.t20BattingRating >= 50,
    weight: 4,
  },
  {
    id: "wicketkeeper",
    label: "Wicketkeeper",
    description: "A gloveman who can also contribute with the bat.",
    filter: (p) => isWicketkeeper(p),
    weight: 6,
  },
  {
    id: "fast-bowler",
    label: "Fast Bowler",
    description: "Pace and bounce to trouble the opposition.",
    filter: (p) => isPaceBowler(p),
    weight: 6,
  },
  {
    id: "spinner",
    label: "Spinner",
    description: "A slow bowler to control the middle overs.",
    filter: (p) => isSpinner(p),
    weight: 6,
  },
  {
    id: "allrounder",
    label: "All-Rounder",
    description: "A player who adds value with both bat and ball.",
    filter: (p) => isAllrounder(p),
    weight: 5,
  },
  {
    id: "under-25",
    label: "Under-25 Player",
    description: "A young talent still on the rise.",
    filter: (p) => p.age < 25,
    weight: 3,
  },
  {
    id: "veteran",
    label: "Veteran",
    description: "Experience and composure under pressure.",
    filter: (p) => p.age >= 33,
    weight: 3,
  },
  {
    id: "powerplay-specialist",
    label: "Powerplay Specialist",
    description: "Thrives in the first six overs, bat or ball in hand.",
    filter: (p) =>
      p.tags.includes("powerplay-specialist") ||
      p.powerplayBatting - p.middleOversBatting >= 5 ||
      p.powerplayBowling - p.middleOversBowling >= 5,
    weight: 3,
  },
  {
    id: "death-overs-specialist",
    label: "Death-Overs Specialist",
    description: "Ice in the veins during the final overs.",
    filter: (p) =>
      p.tags.includes("death-overs-specialist") ||
      p.deathOversBatting - p.middleOversBatting >= 5 ||
      p.deathOversBowling - p.middleOversBowling >= 5,
    weight: 3,
  },
  {
    id: "chennai-pitch-specialist",
    label: "Chennai Pitch Specialist",
    description: "Built for a slow, turning surface.",
    filter: (p) =>
      p.tags.includes("chennai-pitch-specialist") ||
      p.pitchPreferences.some((pref) => pref.pitch === "slow-turning" && pref.affinity > 0),
    weight: 2,
  },
  {
    id: "mumbai-pitch-specialist",
    label: "Mumbai Pitch Specialist",
    description: "Comfortable with pace, bounce, and evening dew.",
    filter: (p) =>
      p.tags.includes("mumbai-pitch-specialist") ||
      p.pitchPreferences.some(
        (pref) => (pref.pitch === "pace-and-bounce" || pref.pitch === "heavy-dew-night") && pref.affinity > 0
      ),
    weight: 2,
  },
  {
    id: "big-match-player",
    label: "Big-Match Player",
    description: "Raises their game when it matters most.",
    filter: (p) => p.tags.includes("big-match-player") || p.clutchRating >= 85,
    weight: 3,
  },
  {
    id: "uncapped-indian",
    label: "Uncapped Indian Player",
    description: "An unproven Indian talent looking for a breakout.",
    filter: (p) => p.nationalityType === "indian" && p.tags.includes("uncapped-indian"),
    weight: 3,
  },
  {
    id: "wildcard",
    label: "Wildcard Pick",
    description: "Anyone left in the pool — trust your instincts.",
    filter: () => true,
    weight: 2,
  },
  {
    id: "franchise-legend",
    label: "Franchise Legend",
    description: "A name synonymous with one franchise's history.",
    filter: (p) => p.tags.includes("franchise-legend"),
    weight: 3,
  },
  {
    id: "current-star",
    label: "Current Star",
    description: "One of the form players in the league right now.",
    filter: (p) => p.tags.includes("current-star"),
    weight: 4,
  },
  {
    id: "all-time-great",
    label: "All-Time Great",
    description: "A generational player at the peak of their powers.",
    filter: (p) => p.tags.includes("all-time-great") || p.rarityTier === "legendary",
    weight: 3,
  },
];

export function getCategory(id: DraftCategoryId): DraftCategory {
  const category = DRAFT_CATEGORIES.find((c) => c.id === id);
  if (!category) throw new Error(`Unknown draft category: ${id}`);
  return category;
}
