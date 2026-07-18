import type { Player } from "@/lib/types";
import { buildPlayer } from "@/lib/data/playerFactory";
import { LEGEND_PLAYER_SPECS } from "@/lib/data/legendPlayerSpecs.generated";

// Retired greats sourced from cricketdata.org (CricAPI v1), rated off their
// career Test/ODI numbers rather than the T20-format stats used for current
// players — see scripts/cricket-data/transform.ts's --legends mode. Kept
// entirely separate from realPlayers.ts's current-player pool: these players
// are only ever surfaced through a specific Era Team (src/lib/data/eraTeams.ts),
// never through the flat All-Time XI draft/spin pool.
export const LEGEND_PLAYERS: Player[] = LEGEND_PLAYER_SPECS.map(buildPlayer);

export function getLegendPlayerById(id: string): Player | undefined {
  return LEGEND_PLAYERS.find((p) => p.id === id);
}
