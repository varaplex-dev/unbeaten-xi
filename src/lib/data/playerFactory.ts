import type {
  BattingHand,
  BowlingStyle,
  NationalityType,
  PitchPreference,
  Player,
  PlayerRole,
  RarityTier,
} from "@/lib/types";

// Compact authoring format for the mock player database. Real/licensed data
// can later be mapped into this same PlayerSpec shape (see players.ts) so
// buildPlayer() keeps producing consistent, balanced derived ratings.
export interface PlayerSpec {
  id: string;
  name: string;
  shortName: string;
  country: string;
  nationalityType: NationalityType;
  currentTeam: string;
  historicalTeams?: string[];
  primaryRole: PlayerRole;
  secondaryRoles?: PlayerRole[];
  battingHand: BattingHand;
  bowlingStyle: BowlingStyle;
  age: number;
  active?: boolean;
  rarityTier: RarityTier;

  /** 0-99 core batting quality; drives all batting-derived ratings. */
  battingSkill: number;
  /** 0-99 core bowling quality; 0 for pure batters. */
  bowlingSkill: number;
  fieldingSkill: number;
  /** 0 unless the player keeps wicket. */
  wicketkeepingSkill?: number;

  /** Signed adjustment applied to batting rating in the powerplay phase. */
  powerplayBattingBias?: number;
  /** Signed adjustment applied to batting rating at the death. */
  deathBattingBias?: number;
  /** Signed adjustment applied to bowling rating in the powerplay phase. */
  powerplayBowlingBias?: number;
  /** Signed adjustment applied to bowling rating at the death. */
  deathBowlingBias?: number;

  captaincyRating?: number;
  consistency?: number;
  clutchRating?: number;
  fitnessRating?: number;

  pitchPreferences?: PitchPreference[];
  venuePreferences?: string[];
  tags?: string[];
  imageUrl?: string | null;
}

function clamp(value: number, min = 0, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

const PACE_STYLES: BowlingStyle[] = [
  "right-arm-fast",
  "left-arm-fast",
  "right-arm-medium",
  "left-arm-medium",
];
const SPIN_STYLES: BowlingStyle[] = [
  "right-arm-offspin",
  "left-arm-orthodox",
  "leg-spin",
];

export function buildPlayer(spec: PlayerSpec): Player {
  const isPace = PACE_STYLES.includes(spec.bowlingStyle);
  const isSpin = SPIN_STYLES.includes(spec.bowlingStyle);

  const powerplayBatting = clamp(
    spec.battingSkill + (spec.powerplayBattingBias ?? 0)
  );
  const deathBatting = clamp(spec.battingSkill + (spec.deathBattingBias ?? 0));
  const powerplayBowling = spec.bowlingSkill
    ? clamp(spec.bowlingSkill + (spec.powerplayBowlingBias ?? 0))
    : 0;
  const deathBowling = spec.bowlingSkill
    ? clamp(spec.bowlingSkill + (spec.deathBowlingBias ?? 0))
    : 0;

  // Overall rating blends batting and bowling, weighted toward whichever the
  // player actually does — a specialist batter isn't penalised for having 0
  // bowling skill, and vice versa.
  const isAllrounder =
    spec.primaryRole === "batting-allrounder" ||
    spec.primaryRole === "bowling-allrounder" ||
    spec.secondaryRoles?.includes("batting-allrounder") ||
    spec.secondaryRoles?.includes("bowling-allrounder");
  const battingWeight = spec.bowlingSkill === 0 ? 1 : isAllrounder ? 0.55 : 0.7;
  const bowlingWeight = 1 - battingWeight;
  const overallRating = clamp(
    spec.battingSkill * battingWeight +
      spec.bowlingSkill * bowlingWeight +
      spec.fieldingSkill * 0.05
  );

  return {
    id: spec.id,
    name: spec.name,
    shortName: spec.shortName,
    country: spec.country,
    nationalityType: spec.nationalityType,
    currentTeam: spec.currentTeam,
    historicalTeams: spec.historicalTeams ?? [],
    primaryRole: spec.primaryRole,
    secondaryRoles: spec.secondaryRoles ?? [],
    battingHand: spec.battingHand,
    bowlingStyle: spec.bowlingStyle,
    age: spec.age,
    active: spec.active ?? true,
    imageUrl: spec.imageUrl ?? null,

    overallRating,
    t20BattingRating: clamp(spec.battingSkill),
    t20BowlingRating: clamp(spec.bowlingSkill),

    powerplayBatting,
    middleOversBatting: clamp(spec.battingSkill),
    deathOversBatting: deathBatting,

    powerplayBowling,
    middleOversBowling: clamp(spec.bowlingSkill),
    deathOversBowling: deathBowling,

    paceRating: isPace ? clamp(spec.bowlingSkill) : clamp(spec.bowlingSkill * 0.15),
    spinRating: isSpin ? clamp(spec.bowlingSkill) : clamp(spec.bowlingSkill * 0.15),
    fieldingRating: clamp(spec.fieldingSkill),
    wicketkeepingRating: clamp(spec.wicketkeepingSkill ?? 0),
    captaincyRating: clamp(spec.captaincyRating ?? spec.battingSkill * 0.4 + 20),
    consistency: clamp(spec.consistency ?? 65),
    clutchRating: clamp(spec.clutchRating ?? 60),
    fitnessRating: clamp(spec.fitnessRating ?? 85),

    pitchPreferences: spec.pitchPreferences ?? [],
    venuePreferences: spec.venuePreferences ?? [],
    tags: spec.tags ?? [],
    rarityTier: spec.rarityTier,
  };
}
