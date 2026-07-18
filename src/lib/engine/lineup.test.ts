import { describe, it, expect } from "vitest";
import { autoAssignLineup } from "./lineup";
import { checkComposition } from "./draft";
import { PLAYERS } from "@/lib/data/players";
import { isWicketkeeper, canBowl } from "@/lib/types";

describe("autoAssignLineup", () => {
  it("puts every XI member in the batting order exactly once", () => {
    const xi = PLAYERS.slice(0, 11);
    const lineup = autoAssignLineup(xi);
    expect(lineup.battingOrder).toHaveLength(11);
    expect(new Set(lineup.battingOrder).size).toBe(11);
    const xiIds = new Set(xi.map((p) => p.id));
    for (const id of lineup.battingOrder) expect(xiIds.has(id)).toBe(true);
  });

  it("only assigns a bowling role to players who can actually bowl", () => {
    const xi = PLAYERS.slice(0, 11);
    const lineup = autoAssignLineup(xi);
    for (const [playerId] of Object.entries(lineup.bowlingRoleAssignments)) {
      const player = xi.find((p) => p.id === playerId);
      expect(player).toBeDefined();
      expect(canBowl(player!)).toBe(true);
    }
  });

  it("picks a wicketkeeper who is actually keeper-eligible, when one exists in the XI", () => {
    for (let i = 0; i < PLAYERS.length - 11; i += 5) {
      const xi = PLAYERS.slice(i, i + 11);
      if (xi.length < 11 || !checkComposition(xi).legal) continue;
      const lineup = autoAssignLineup(xi);
      const keeper = xi.find((p) => p.id === lineup.wicketkeeperId);
      expect(keeper).toBeDefined();
      expect(isWicketkeeper(keeper!)).toBe(true);
    }
  });

  it("captain and vice-captain are two different XI members", () => {
    const xi = PLAYERS.slice(0, 11);
    const lineup = autoAssignLineup(xi);
    expect(lineup.captainId).not.toBe(lineup.viceCaptainId);
  });
});
