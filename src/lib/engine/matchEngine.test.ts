import { describe, it, expect } from "vitest";
import { batterPhaseRate, projectInnings, projectMatch, teamStrength } from "./matchEngine";
import { buildPlayer, type PlayerSpec } from "@/lib/data/playerFactory";
import { REAL_PLAYERS } from "@/lib/data/realPlayers";
import { createRng } from "./rng";
import { canBowl, type Player } from "@/lib/types";

// Build genuinely strong / weak XIs across BOTH disciplines. Note that
// `overallRating` is batting-weighted, so "top 11 by rating" would be a
// batting-heavy side with a poor attack — useless for testing bowling.
const withStats = REAL_PLAYERS.filter((p) => p.careerStats);
const battingScore = (p: Player) =>
  (p.careerStats?.strikeRate ?? 0) * (p.careerStats?.battingAverage ?? 5);

const batterPool = withStats.filter((p) => (p.careerStats?.innings ?? 0) >= 20);
const bowlerPool = withStats.filter(
  (p) => canBowl(p) && p.careerStats?.economyRate != null && (p.careerStats?.wickets ?? 0) >= 20
);

const bestBatters = [...batterPool].sort((a, b) => battingScore(b) - battingScore(a)).slice(0, 6);
const worstBatters = [...batterPool].sort((a, b) => battingScore(a) - battingScore(b)).slice(0, 6);
const bestBowlers = [...bowlerPool]
  .sort((a, b) => (a.careerStats!.economyRate ?? 99) - (b.careerStats!.economyRate ?? 99))
  .slice(0, 5);
const worstBowlers = [...bowlerPool]
  .sort((a, b) => (b.careerStats!.economyRate ?? 0) - (a.careerStats!.economyRate ?? 0))
  .slice(0, 5);

const dedupe = (players: Player[]) => {
  const seen = new Set<string>();
  return players.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
};

const strongXi = dedupe([...bestBatters, ...bestBowlers]);
const weakXi = dedupe([...worstBatters, ...worstBowlers]);

/** A minimal real-shaped player we can hand exact phase splits to. */
function playerWithPhases(id: string, deathStrikeRate: number): Player {
  const spec: PlayerSpec = {
    id,
    name: id,
    shortName: id,
    country: "India",
    nationalityType: "indian",
    currentTeam: "Test XI",
    primaryRole: "finisher",
    battingHand: "right",
    bowlingStyle: "right-arm-medium",
    age: 28,
    rarityTier: "rare",
    battingSkill: 70,
    bowlingSkill: 0,
    fieldingSkill: 60,
    careerStats: {
      format: "T20",
      battingAverage: 30,
      strikeRate: 130,
      runs: 3000,
      innings: 100,
      bowlingAverage: null,
      economyRate: null,
      wickets: 0,
      battingPhases: {
        powerplay: { runs: 300, balls: 300, strikeRate: 100, economy: 6 },
        middle: { runs: 600, balls: 500, strikeRate: 120, economy: 7.2 },
        death: { runs: 900, balls: 400, strikeRate: deathStrikeRate, economy: deathStrikeRate * 0.06 },
      },
    },
  };
  return buildPlayer(spec);
}

describe("phase awareness", () => {
  it("uses a player's real death-overs strike rate, not their overall one", () => {
    const finisher = playerWithPhases("finisher", 200);
    const plodder = playerWithPhases("plodder", 90);
    // Both have the same overall strike rate (130) — only the phase split differs.
    expect(batterPhaseRate(finisher, "death")).toBeGreaterThan(batterPhaseRate(plodder, "death"));
    // 200 SR = 12 runs per over.
    expect(batterPhaseRate(finisher, "death")).toBeCloseTo(12, 1);
  });

  it("falls back to the overall rate when a phase has too small a sample", () => {
    const p = playerWithPhases("sparse", 200);
    // Powerplay split exists with a real sample, so it is used (100 SR = 6 rpo).
    expect(batterPhaseRate(p, "powerplay")).toBeCloseTo(6, 1);
  });
});

describe("projectInnings", () => {
  it("is deterministic for a given seed", () => {
    const a = projectInnings(createRng("innings-1"), strongXi, weakXi);
    const b = projectInnings(createRng("innings-1"), strongXi, weakXi);
    expect(a).toEqual(b);
  });

  it("produces believable T20 totals and never more than ten wickets", () => {
    for (let i = 0; i < 50; i++) {
      const res = projectInnings(createRng(`t-${i}`), strongXi, weakXi);
      expect(res.runs).toBeGreaterThan(60);
      expect(res.runs).toBeLessThan(320);
      expect(res.wickets).toBeGreaterThanOrEqual(0);
      expect(res.wickets).toBeLessThanOrEqual(10);
    }
  });

  it("scores more against a poor attack than an elite one", () => {
    let vsWeakAttack = 0;
    let vsEliteAttack = 0;
    for (let i = 0; i < 40; i++) {
      // Same batting order and seed both times — only the attack changes.
      vsWeakAttack += projectInnings(createRng(`w-${i}`), strongXi, weakXi).runs;
      vsEliteAttack += projectInnings(createRng(`w-${i}`), strongXi, strongXi).runs;
    }
    expect(vsWeakAttack).toBeGreaterThan(vsEliteAttack);
  });
});

describe("projectMatch — intelligent, not random", () => {
  it("the stronger side wins the clear majority of matches", () => {
    let wins = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const m = projectMatch(createRng(`match-${i}`), strongXi, strongXi, weakXi);
      if (m.won) wins++;
    }
    // A materially better team should dominate — nothing like a coin flip.
    expect(wins / n).toBeGreaterThan(0.75);
  });

  it("still produces varied scorelines across seeds (not a fixed result)", () => {
    const scores = new Set<number>();
    for (let i = 0; i < 30; i++) {
      scores.add(projectMatch(createRng(`vary-${i}`), strongXi, strongXi, weakXi).teamRuns);
    }
    expect(scores.size).toBeGreaterThan(5);
  });

  it("is symmetric: swapping sides flips the result", () => {
    const a = projectMatch(createRng("sym"), strongXi, strongXi, weakXi);
    const b = projectMatch(createRng("sym"), weakXi, weakXi, strongXi);
    expect(a.won).toBe(true);
    expect(b.won).toBe(false);
  });
});

describe("teamStrength", () => {
  it("rates a stronger XI above a weaker one", () => {
    expect(teamStrength(strongXi)).toBeGreaterThan(teamStrength(weakXi));
  });
});
