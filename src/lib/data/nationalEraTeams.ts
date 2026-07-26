import type { EraTeam, Player } from "@/lib/types";
import { buildPlayer } from "@/lib/data/playerFactory";
import { NATIONAL_PLAYER_SPECS } from "@/lib/data/nationalPlayerSpecs.generated";
import { NATIONAL_ERA_TEAM_SPECS } from "@/lib/data/nationalEraTeams.generated";

/** Every player who appears in a national era squad, built once and shared —
 * the same Player object is reused by its squad rather than rebuilt, so
 * identity comparisons by reference stay valid. */
export const NATIONAL_PLAYERS: Player[] = NATIONAL_PLAYER_SPECS.map(buildPlayer);

const BY_ID = new Map(NATIONAL_PLAYERS.map((p) => [p.id, p]));

/** National squads grouped by era bucket. A player belongs to exactly one
 * bucket (the era containing their career midpoint), so these squads are
 * disjoint: no cricketer can be spun into twice across a draft. */
export const NATIONAL_ERA_TEAMS: EraTeam[] = NATIONAL_ERA_TEAM_SPECS.map((spec) => {
  const players = spec.playerIds.map((id) => {
    const player = BY_ID.get(id);
    // Both files come from the same generator run, so a miss means they have
    // drifted out of sync — fail loudly at module load (build/dev) rather than
    // silently serving a squad that is short a player.
    if (!player) {
      throw new Error(`National era squad "${spec.id}" references unknown player id: "${id}"`);
    }
    return player;
  });

  return {
    id: spec.id,
    name: spec.name,
    eraLabel: spec.eraLabel,
    tagline: spec.tagline,
    country: spec.country,
    isHistoric: spec.isHistoric,
    year: spec.year,
    players,
  };
});

export function getNationalPlayerById(id: string): Player | undefined {
  return BY_ID.get(id);
}
