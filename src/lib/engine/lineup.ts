import type { Player, PlayerRole } from "@/lib/types";
import { canBowl, isWicketkeeper } from "@/lib/types";

export type BowlingPhase = "powerplay" | "middle" | "death";

export interface AutoLineup {
  battingOrder: string[];
  bowlingRoleAssignments: Record<string, BowlingPhase>;
  captainId: string;
  viceCaptainId: string;
  wicketkeeperId: string;
}

const BATTING_ORDER_RANK: Record<PlayerRole, number> = {
  opener: 0,
  "top-order": 1,
  "wicketkeeper-batter": 2,
  "middle-order": 3,
  "batting-allrounder": 4,
  finisher: 5,
  "bowling-allrounder": 6,
  "fast-bowler": 7,
  "swing-bowler": 7,
  "death-bowler": 7,
  "leg-spinner": 8,
  "off-spinner": 8,
  "left-arm-spinner": 8,
};

/**
 * Produces a sensible default lineup from a drafted XI so play can jump
 * straight to simulation. Batting order follows role convention (openers
 * first, tail last), bowling phases are assigned by each bowler's strongest
 * phase rating, and captain/keeper follow their specialist ratings.
 */
export function autoAssignLineup(xi: Player[]): AutoLineup {
  const battingOrder = [...xi]
    .sort((a, b) => {
      const rankDiff = BATTING_ORDER_RANK[a.primaryRole] - BATTING_ORDER_RANK[b.primaryRole];
      if (rankDiff !== 0) return rankDiff;
      return b.t20BattingRating - a.t20BattingRating;
    })
    .map((p) => p.id);

  const bowlers = xi.filter(canBowl);
  const bowlingRoleAssignments: AutoLineup["bowlingRoleAssignments"] = {};
  bowlers.forEach((player) => {
    const phases: [AutoLineup["bowlingRoleAssignments"][string], number][] = [
      ["powerplay", player.powerplayBowling],
      ["middle", player.middleOversBowling],
      ["death", player.deathOversBowling],
    ];
    phases.sort((a, b) => b[1] - a[1]);
    bowlingRoleAssignments[player.id] = phases[0][0];
  });

  const captain = [...xi].sort((a, b) => b.captaincyRating - a.captaincyRating)[0];
  const viceCaptain = [...xi]
    .filter((p) => p.id !== captain.id)
    .sort((a, b) => b.captaincyRating - a.captaincyRating)[0];

  const keeperCandidates = xi.filter(isWicketkeeper);
  const wicketkeeper =
    [...keeperCandidates].sort((a, b) => b.wicketkeepingRating - a.wicketkeepingRating)[0] ?? xi[0];

  return {
    battingOrder,
    bowlingRoleAssignments,
    captainId: captain.id,
    viceCaptainId: (viceCaptain ?? captain).id,
    wicketkeeperId: wicketkeeper.id,
  };
}
