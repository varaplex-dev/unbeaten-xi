import { describe, it, expect } from "vitest";
import { computeTeamRatings } from "./teamRatings";
import { checkComposition } from "./draft";
import { PLAYERS } from "@/lib/data/players";

describe("computeTeamRatings", () => {
  it("rates a higher-overallRating XI at least as highly as a lower one, all else equal", () => {
    const sorted = [...PLAYERS].sort((a, b) => b.overallRating - a.overallRating);
    const strong = sorted.slice(0, 11);
    const weak = sorted.slice(-11);
    const strongCaptain = strong.reduce((best, p) => (p.captaincyRating > best.captaincyRating ? p : best));
    const weakCaptain = weak.reduce((best, p) => (p.captaincyRating > best.captaincyRating ? p : best));

    const strongRatings = computeTeamRatings(strong, strong, strongCaptain);
    const weakRatings = computeTeamRatings(weak, weak, weakCaptain);

    expect(strongRatings.overallRating).toBeGreaterThan(weakRatings.overallRating);
  });

  it("penalizes an illegal composition relative to an otherwise-similar legal one", () => {
    const overseasOnly = PLAYERS.filter((p) => p.nationalityType === "overseas").slice(0, 11);
    if (overseasOnly.length < 11) return; // pool too small to construct this case, skip
    expect(checkComposition(overseasOnly).legal).toBe(false);

    const ratings = computeTeamRatings(overseasOnly, overseasOnly, overseasOnly[0]);
    // balanceBonus should be negative for an illegal composition.
    expect(ratings.balanceBonus).toBeLessThan(0);
  });

  it("overallRating always stays within the 1-99 band", () => {
    for (let i = 0; i < PLAYERS.length - 11; i += 7) {
      const xi = PLAYERS.slice(i, i + 11);
      if (xi.length < 11) continue;
      const ratings = computeTeamRatings(xi, xi, xi[0]);
      expect(ratings.overallRating).toBeGreaterThanOrEqual(1);
      expect(ratings.overallRating).toBeLessThanOrEqual(99);
    }
  });
});
