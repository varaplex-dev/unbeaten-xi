import { describe, it, expect } from "vitest";
import {
  compareRosters,
  simulateH2HMatch,
  h2hPoints,
  rankLadder,
  seedPlayoffBracket,
  type H2HMatchResult,
  type LadderRow,
} from "./headToHead";
import { REAL_PLAYERS } from "@/lib/data/realPlayers";
import type { Player } from "@/lib/types";

// Two disjoint 11-player rosters drawn from the real, stats-backed pool.
const withStats = REAL_PLAYERS.filter((p) => p.careerStats);
const rosterA: Player[] = withStats.slice(0, 11);
const rosterB: Player[] = withStats.slice(11, 22);

describe("compareRosters", () => {
  it("produces one metric row per axis with a decided advantage", () => {
    const cmp = compareRosters(rosterA, rosterB);
    expect(cmp.metrics.length).toBeGreaterThanOrEqual(5);
    for (const m of cmp.metrics) {
      expect(["a", "b", "even"]).toContain(m.advantage);
    }
    // Category counts never exceed the number of metrics.
    expect(cmp.aCategories + cmp.bCategories).toBeLessThanOrEqual(cmp.metrics.length);
  });

  it("is symmetric: swapping sides flips every advantage", () => {
    const ab = compareRosters(rosterA, rosterB);
    const ba = compareRosters(rosterB, rosterA);
    ab.metrics.forEach((m, i) => {
      const flipped = ba.metrics[i];
      if (m.advantage === "even") expect(flipped.advantage).toBe("even");
      else expect(flipped.advantage).toBe(m.advantage === "a" ? "b" : "a");
    });
  });
});

describe("simulateH2HMatch", () => {
  it("is deterministic for a given match id", () => {
    const r1 = simulateH2HMatch("match-1", rosterA, rosterB);
    const r2 = simulateH2HMatch("match-1", rosterA, rosterB);
    expect(r2).toEqual(r1);
  });

  it("always produces a winner and a non-negative margin", () => {
    for (let i = 0; i < 25; i++) {
      const res = simulateH2HMatch(`m-${i}`, rosterA, rosterB);
      expect(["a", "b"]).toContain(res.winner);
      expect(res.margin).toBeGreaterThanOrEqual(0);
      expect(res.margin).toBe(Math.abs(res.a.score - res.b.score));
    }
  });
});

describe("h2hPoints", () => {
  const base = (winner: "a" | "b", margin: number): H2HMatchResult => ({
    a: { score: 0, baseline: 0 },
    b: { score: 0, baseline: 0 },
    winner,
    margin,
  });

  it("awards 3 for a win, 0 for a clear loss", () => {
    expect(h2hPoints(base("a", 20))).toEqual({ a: 3, b: 0 });
  });

  it("adds a bonus point for a dominant win", () => {
    expect(h2hPoints(base("a", 35))).toEqual({ a: 4, b: 0 });
  });

  it("gives the loser a consolation point for a narrow defeat", () => {
    expect(h2hPoints(base("b", 6))).toEqual({ a: 1, b: 3 });
  });
});

describe("rankLadder + seedPlayoffBracket", () => {
  const ladder: LadderRow[] = [
    { playerId: "p1", played: 5, wins: 4, losses: 1, points: 12, runDiff: 40 },
    { playerId: "p2", played: 5, wins: 4, losses: 1, points: 12, runDiff: 55 },
    { playerId: "p3", played: 5, wins: 3, losses: 2, points: 9, runDiff: 10 },
    { playerId: "p4", played: 5, wins: 2, losses: 3, points: 7, runDiff: -5 },
  ];

  it("breaks a points tie by wins then run differential", () => {
    const ranked = rankLadder(ladder);
    // p2 and p1 both 12 pts / 4 wins → higher runDiff (p2) ranks first.
    expect(ranked[0].playerId).toBe("p2");
    expect(ranked[1].playerId).toBe("p1");
  });

  it("seeds a 4-team bracket as 1v4 and 2v3", () => {
    const pairings = seedPlayoffBracket(ladder, 4);
    expect(pairings).toHaveLength(2);
    expect(pairings[0].high.seed).toBe(1);
    expect(pairings[0].low.seed).toBe(4);
    expect(pairings[1].high.seed).toBe(2);
    expect(pairings[1].low.seed).toBe(3);
  });
});
