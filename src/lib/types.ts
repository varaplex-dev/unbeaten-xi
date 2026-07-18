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

/** A real player's actual career numbers, drawn from whichever single
 * format (IPL/T20I/T20/ODI/Test) their rating is calibrated against — see
 * scripts/cricket-data/transform.ts. null for fields that don't apply (e.g.
 * bowlingAverage for a player with no bowling record). Absent entirely for
 * fictional players, who have no real career to report. */
export interface CareerStats {
  /** Which competition/format these numbers are drawn from, e.g. "IPL",
   * "ODI", "Test", "T20I" — shown alongside the numbers since an average of
   * 44 means something different in Tests than in a T20 league. */
  format: string;
  battingAverage: number | null;
  strikeRate: number | null;
  runs: number;
  innings: number;
  bowlingAverage: number | null;
  economyRate: number | null;
  wickets: number;
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

  /** Present only for real/legend players. When set, this is what player
   * cards display and what season simulation uses to drive real-player
   * games — the 0-99 fields above still exist (composition legality, draft
   * category filters, and rarity tiers still key off them) but are no
   * longer the primary signal shown to the user or fed into match outcomes
   * for a player who has real numbers to use instead. */
  careerStats: CareerStats | null;
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

// --- Era Teams ---
// A specific, named real squad (a historic team's peak era, or a country's
// current lineup) that "Spin the Wheel" reveals as a whole. The user then
// manually builds their XI from exactly that squad — no auto-draft. See
// src/lib/data/eraTeams.ts for the actual roster data.
export interface EraTeam {
  id: string;
  name: string;
  eraLabel: string;
  tagline: string;
  country: string;
  isHistoric: boolean;
  players: Player[];
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
