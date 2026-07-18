import type { Player } from "@/lib/types";
import { buildPlayer } from "@/lib/data/playerFactory";
import { REAL_PLAYER_SPECS } from "@/lib/data/realPlayerSpecs.generated";

// Real players sourced from cricketdata.org (CricAPI v1), covering current
// internationals across the IPL, Big Bash League, and PSL circuits. Ratings
// are derived from real T20/IPL/T20I batting and bowling stats — see
// scripts/cricket-data/transform.ts for the exact formulas — rather than
// hand-authored like the fictional roster in players.ts.
//
// This is a periodic snapshot, not a live feed: cricketdata.org's free tier
// caps at 100 requests/day, which isn't viable to query during gameplay.
// Refresh by re-running scripts/cricket-data/fetch.mjs and
// scripts/cricket-data/transform.ts.
export const REAL_PLAYERS: Player[] = REAL_PLAYER_SPECS.map(buildPlayer);

export function getRealPlayerById(id: string): Player | undefined {
  return REAL_PLAYERS.find((p) => p.id === id);
}
