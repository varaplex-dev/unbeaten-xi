import type { PlayerRole } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

/** Maps a player's role enum to its i18n key. Callers render it with
 * `t(roleLabelKey(player.primaryRole))` so the pretty, localized label shows
 * everywhere instead of the raw `middle-order` / `wicketkeeper-batter` value. */
const ROLE_KEY: Record<PlayerRole, TranslationKey> = {
  opener: "role.opener",
  "top-order": "role.topOrder",
  "middle-order": "role.middleOrder",
  finisher: "role.finisher",
  "wicketkeeper-batter": "role.wk",
  "batting-allrounder": "role.battingAr",
  "bowling-allrounder": "role.bowlingAr",
  "fast-bowler": "role.fastBowler",
  "swing-bowler": "role.swingBowler",
  "death-bowler": "role.deathBowler",
  "leg-spinner": "role.legSpinner",
  "off-spinner": "role.offSpinner",
  "left-arm-spinner": "role.leftArmSpinner",
};

export function roleLabelKey(role: PlayerRole): TranslationKey {
  return ROLE_KEY[role];
}
