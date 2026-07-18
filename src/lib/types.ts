// Core domain types for The Unbeaten XI.
// Kept independent of any UI or storage concerns so they can be reused by
// the draft engine, the simulation engine, and (later) a real backend.

export type NationalityType = "indian" | "overseas";

export type BattingHand = "right" | "left";

export type BowlingStyle =
  | "right-arm-fast"
  | "left-arm-fast"
  | "right-arm-medium"
  | "left-arm-medium"
  | "right-arm-offspin"
  | "left-arm-orthodox"
  | "leg-spin"
  | "none";

export type PlayerRole =
  | "opener"
  | "top-order"
  | "middle-order"
  | "finisher"
  | "wicketkeeper-batter"
  | "batting-allrounder"
  | "bowling-allrounder"
  | "fast-bowler"
  | "swing-bowler"
  | "death-bowler"
  | "leg-spinner"
  | "off-spinner"
  | "left-arm-spinner";

export type PitchType =
  | "flat-batting"
  | "slow-turning"
  | "pace-and-bounce"
  | "swing-friendly"
  | "dry-surface"
  | "high-scoring-small-ground"
  | "large-boundaries"
  | "heavy-dew-night";

export type RarityTier = "common" | "uncommon" | "rare" | "legendary";

export interface PitchPreference {
  pitch: PitchType;
  /** -2 (struggles) to +2 (thrives) */
  affinity: number;
}

export interface Player {
  id: string;
  name: string;
  shortName: string;
  country: string;
  nationalityType: NationalityType;
  currentTeam: string;
  historicalTeams: string[];
  primaryRole: PlayerRole;
  secondaryRoles: PlayerRole[];
  battingHand: BattingHand;
  bowlingStyle: BowlingStyle;
  age: number;
  active: boolean;
  imageUrl: string | null;

  overallRating: number;
  t20BattingRating: number;
  t20BowlingRating: number;

  powerplayBatting: number;
  middleOversBatting: number;
  deathOversBatting: number;

  powerplayBowling: number;
  middleOversBowling: number;
  deathOversBowling: number;

  paceRating: number;
  spinRating: number;
  fieldingRating: number;
  wicketkeepingRating: number;
  captaincyRating: number;
  consistency: number;
  clutchRating: number;
  fitnessRating: number;

  pitchPreferences: PitchPreference[];
  venuePreferences: string[];
  tags: string[];
  rarityTier: RarityTier;
}

export function canBowl(player: Player): boolean {
  return (
    player.bowlingStyle !== "none" ||
    player.primaryRole === "bowling-allrounder" ||
    player.secondaryRoles.includes("bowling-allrounder")
  );
}

export function isWicketkeeper(player: Player): boolean {
  return (
    player.primaryRole === "wicketkeeper-batter" ||
    player.secondaryRoles.includes("wicketkeeper-batter")
  );
}

export function isPaceBowler(player: Player): boolean {
  return (
    canBowl(player) &&
    (player.bowlingStyle === "right-arm-fast" ||
      player.bowlingStyle === "left-arm-fast" ||
      player.bowlingStyle === "right-arm-medium" ||
      player.bowlingStyle === "left-arm-medium")
  );
}

export function isSpinner(player: Player): boolean {
  return (
    canBowl(player) &&
    (player.bowlingStyle === "right-arm-offspin" ||
      player.bowlingStyle === "left-arm-orthodox" ||
      player.bowlingStyle === "leg-spin")
  );
}

// --- Draft ---

export type DraftCategoryId =
  | "indian-opener"
  | "overseas-finisher"
  | "left-handed-batter"
  | "wicketkeeper"
  | "fast-bowler"
  | "spinner"
  | "allrounder"
  | "under-25"
  | "veteran"
  | "powerplay-specialist"
  | "death-overs-specialist"
  | "chennai-pitch-specialist"
  | "mumbai-pitch-specialist"
  | "big-match-player"
  | "uncapped-indian"
  | "wildcard"
  | "franchise-legend"
  | "current-star"
  | "all-time-great";

export interface DraftCategory {
  id: DraftCategoryId;
  label: string;
  description: string;
  filter: (player: Player) => boolean;
  /** Higher weight = picked more often when eligible. */
  weight: number;
}

export interface DraftRound {
  roundNumber: number;
  category: DraftCategory;
  options: Player[];
}

export interface DraftPick {
  roundNumber: number;
  categoryId: DraftCategoryId;
  player: Player;
}

// --- Team composition ---

export const SQUAD_SIZE = 11;
export const MIN_WICKETKEEPERS = 1;
export const MIN_BOWLING_OPTIONS = 4;
export const MIN_PACE_BOWLERS = 1;
export const MIN_SPINNERS = 1;
export const MAX_OVERSEAS = 4;
export const MIN_BATTING_DEPTH = 7;

export interface RosterNeeds {
  slotsRemaining: number;
  wicketkeepersNeeded: number;
  bowlingOptionsNeeded: number;
  paceBowlersNeeded: number;
  spinnersNeeded: number;
  overseasSlotsRemaining: number;
}

export interface CompositionIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}
