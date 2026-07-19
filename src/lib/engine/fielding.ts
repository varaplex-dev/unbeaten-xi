// Hardcore Mode's simulation tie-in for real fielding-position assignments.
// There's no "fielding rating" anywhere in the underlying player data (real
// career stats only cover batting/bowling), so this deliberately doesn't
// fabricate one. Instead it reuses a signal the rest of the engine already
// relies on: canBowl(). Bowlers and all-rounders are the players actually
// engaged with the ball every over — putting them at the two close-catching
// positions (slip, gully) is a defensible upgrade; parking a specialist
// batter there instead is a small, realistic downside. The adjustment is
// deliberately modest — this is flavor and strategy depth, not a second
// simulation engine.
import type { Player } from "@/lib/types";
import { canBowl } from "@/lib/types";
import { FIELDING_POSITIONS } from "@/lib/data/fieldingPositions";

const CATCHING_POSITION_IDS = new Set(
  FIELDING_POSITIONS.filter((p) => p.zone === "catching").map((p) => p.id)
);

const BONUS_PER_ATHLETIC_CATCHER = 0.025;
const PENALTY_PER_MISMATCHED_CATCHER = 0.02;

/** playerId -> fielding position id. Only positions actually filled count —
 * Hardcore Mode doesn't require completing the whole field. */
export type FieldingAssignments = Record<string, string>;

export function fieldingWicketBonus(xi: Player[], assignments: FieldingAssignments): number {
  let bonus = 0;
  for (const [playerId, positionId] of Object.entries(assignments)) {
    if (!CATCHING_POSITION_IDS.has(positionId)) continue;
    const player = xi.find((p) => p.id === playerId);
    if (!player) continue;
    bonus += canBowl(player) ? BONUS_PER_ATHLETIC_CATCHER : -PENALTY_PER_MISMATCHED_CATCHER;
  }
  return bonus;
}
