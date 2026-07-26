import { describe, expect, it } from "vitest";
import {
  seasonPoints,
  SEASON_WIN_POINTS,
  SEASON_PERFECT_BONUS,
  SEASON_DOMINANCE_CAP,
} from "./seasonPoints";

describe("seasonPoints", () => {
  it("is monotonic in wins — one more win always scores higher", () => {
    for (let w = 0; w < 14; w++) {
      const losses = 14 - w;
      const fewer = seasonPoints(w, losses, 0);
      const more = seasonPoints(w + 1, losses - 1, 0);
      expect(more).toBeGreaterThan(fewer);
    }
  });

  it("record is inviolable — max dominance never overturns a better record", () => {
    // A scrappy 13-1 with the worst possible NRR must still beat a crushing
    // 12-2 with the best possible NRR. This is the whole reason the dominance
    // component is capped below SEASON_WIN_POINTS.
    const scrappyThirteen = seasonPoints(13, 1, -10); // clamps to -CAP
    const dominantTwelve = seasonPoints(12, 2, +10); // clamps to +CAP
    expect(scrappyThirteen).toBeGreaterThan(dominantTwelve);
  });

  it("an undefeated season earns the perfect premium over a one-loss season", () => {
    // 14-0 vs 13-1, both with neutral run rate: the gap is a full win plus the
    // perfect bonus, so perfection stands clearly apart.
    const perfect = seasonPoints(14, 0, 0);
    const oneLoss = seasonPoints(13, 1, 0);
    expect(perfect - oneLoss).toBe(SEASON_WIN_POINTS + SEASON_PERFECT_BONUS);
  });

  it("dominance orders two identical records by net run rate", () => {
    const dominant = seasonPoints(14, 0, 2.0);
    const narrow = seasonPoints(14, 0, 0.1);
    expect(dominant).toBeGreaterThan(narrow);
    // ...but only within the cap — it never adds more than a single win.
    expect(dominant - narrow).toBeLessThan(SEASON_WIN_POINTS);
  });

  it("caps dominance both ways so extreme run rates can't run away", () => {
    expect(seasonPoints(7, 7, 99)).toBe(7 * SEASON_WIN_POINTS + SEASON_DOMINANCE_CAP);
    expect(seasonPoints(7, 7, -99)).toBe(7 * SEASON_WIN_POINTS - SEASON_DOMINANCE_CAP);
  });

  it("never returns negative points, even for a winless, hammered season", () => {
    expect(seasonPoints(0, 14, -5)).toBe(0);
  });

  it("does not award the perfect bonus to an empty 0-0 record", () => {
    expect(seasonPoints(0, 0, 0)).toBe(0);
  });

  it("scores a shorter competition on the same scale (World Cup 9-0)", () => {
    // Separate boards, so magnitudes need not match the league — only the
    // internal ordering matters, and a 9-0 still gets the perfect premium.
    const worldCupPerfect = seasonPoints(9, 0, 1.5);
    expect(worldCupPerfect).toBe(9 * SEASON_WIN_POINTS + SEASON_PERFECT_BONUS + Math.round(1.5 * 15));
  });
});
