import { describe, it, expect } from "vitest";
import { simulateSeason, type SeasonStats } from "./simulate";
import { autoAssignLineup } from "./lineup";
import { PLAYERS } from "@/lib/data/players";
import { REAL_PLAYERS } from "@/lib/data/realPlayers";
import { isWicketkeeper, isPaceBowler, isSpinner, canBowl, type Player } from "@/lib/types";

/** Runs a full season to completion, auto-resolving every decision with its first option. */
function runFullSeason(
  seed: string,
  xi: Player[],
  battingOrder: string[],
  captainId: string,
  impactPlayer: Player | null,
  averageEra?: number
): SeasonStats {
  const decisions: Record<number, string> = {};
  for (let guard = 0; guard < 20; guard++) {
    const result = simulateSeason(seed, xi, battingOrder, captainId, impactPlayer, decisions, undefined, averageEra);
    if (result.stats) return result.stats;
    if (!result.pendingDecision) throw new Error("simulateSeason paused without a pendingDecision");
    decisions[result.pendingDecision.matchNumber] = result.pendingDecision.options[0].id;
  }
  throw new Error("simulateSeason never completed after 20 decision resolutions — likely an infinite pause loop");
}

/**
 * Builds a composition-aware legal XI, best or worst by rating: locks in a
 * keeper/pacer/spinner/bowling-depth first (so it's always legal), then
 * fills remaining slots with the best (or worst) remaining players. This
 * matters — "top 11 players by individual rating" is usually an ILLEGAL,
 * batting-only team in practice, which tanks its own team rating via the
 * balance penalty and says nothing real about the simulation's win ceiling.
 */
function buildLegalXi(direction: "best" | "worst"): Player[] {
  const byRating = (a: Player, b: Player) => (direction === "best" ? b.overallRating - a.overallRating : a.overallRating - b.overallRating);
  const xi: Player[] = [];
  const used = new Set<string>();
  const overseasCount = () => xi.filter((p) => p.nationalityType === "overseas").length;

  function tryAdd(p: Player | undefined): void {
    if (!p || used.has(p.id)) return;
    if (p.nationalityType === "overseas" && overseasCount() >= 4) return;
    xi.push(p);
    used.add(p.id);
  }

  tryAdd([...PLAYERS].filter(isWicketkeeper).sort(byRating)[0]);
  tryAdd([...PLAYERS].filter(isPaceBowler).sort(byRating)[0]);
  tryAdd([...PLAYERS].filter(isSpinner).sort(byRating)[0]);
  for (const p of [...PLAYERS].filter(canBowl).sort(byRating)) {
    if (xi.filter(canBowl).length >= 4) break;
    tryAdd(p);
  }
  for (const p of [...PLAYERS].sort(byRating)) {
    if (xi.length >= 11) break;
    tryAdd(p);
  }
  return xi;
}

const strongestLegalXi = () => buildLegalXi("best");
const weakestLegalXi = () => buildLegalXi("worst");

describe("simulateSeason", () => {
  it("always produces exactly 14 matches once complete", () => {
    const xi = PLAYERS.slice(0, 11);
    const lineup = autoAssignLineup(xi);
    const stats = runFullSeason("season-length-check", xi, lineup.battingOrder, lineup.captainId, null);
    expect(stats.wins + stats.losses).toBe(14);
  });

  it("is fully deterministic: same seed, same team, same decisions -> identical result", () => {
    const xi = PLAYERS.slice(0, 11);
    const lineup = autoAssignLineup(xi);
    const a = runFullSeason("determinism-season", xi, lineup.battingOrder, lineup.captainId, null);
    const b = runFullSeason("determinism-season", xi, lineup.battingOrder, lineup.captainId, null);
    expect(a).toEqual(b);
  });

  it("older-era squads face lower-scoring opposition (cross-era fairness)", () => {
    // A real, stats-backed XI so the sim runs its stats-game path (the only
    // one the era adjustment touches).
    const xi = REAL_PLAYERS.filter((p) => p.careerStats).slice(0, 11);
    const lineup = autoAssignLineup(xi);
    const modern = runFullSeason("era-fair", xi, lineup.battingOrder, lineup.captainId, null, 2022);
    const legends = runFullSeason("era-fair", xi, lineup.battingOrder, lineup.captainId, null, 1980);
    // Same seed and team, older era → opponents scaled down → they concede
    // no more runs than in a modern-era season.
    expect(legends.totalRunsAgainst).toBeLessThanOrEqual(modern.totalRunsAgainst);
  });

  it("resuming with a growing decisions map replays already-decided matches identically", () => {
    const xi = PLAYERS.slice(0, 11);
    const lineup = autoAssignLineup(xi);
    const seed = "resume-consistency";

    // Run to completion once, recording every decision made along the way.
    const decisionsMade: Record<number, string> = {};
    let finalStats: SeasonStats | null = null;
    for (let guard = 0; guard < 20 && !finalStats; guard++) {
      const result = simulateSeason(seed, xi, lineup.battingOrder, lineup.captainId, null, decisionsMade);
      if (result.stats) {
        finalStats = result.stats;
        break;
      }
      if (!result.pendingDecision) throw new Error("unexpected: no pending decision and no stats");
      decisionsMade[result.pendingDecision.matchNumber] = result.pendingDecision.options[0].id;
    }
    expect(finalStats).not.toBeNull();

    // Now replay from scratch with the SAME final decisions map supplied
    // up front — every match, including the pre-decision ones, must match.
    const replay = simulateSeason(seed, xi, lineup.battingOrder, lineup.captainId, null, decisionsMade);
    expect(replay.stats).toEqual(finalStats);
  });

  it("net run rate sign matches whether runs for exceeds runs against", () => {
    const xi = PLAYERS.slice(0, 11);
    const lineup = autoAssignLineup(xi);
    const stats = runFullSeason("nrr-check", xi, lineup.battingOrder, lineup.captainId, null);
    if (stats.totalRunsFor > stats.totalRunsAgainst) {
      expect(stats.netRunRate).toBeGreaterThan(0);
    } else if (stats.totalRunsFor < stats.totalRunsAgainst) {
      expect(stats.netRunRate).toBeLessThan(0);
    }
  });

  it("percentile stays within 1-99 regardless of record", () => {
    for (const seed of ["pctl-a", "pctl-b", "pctl-c"]) {
      const xi = PLAYERS.slice(0, 11);
      const lineup = autoAssignLineup(xi);
      const stats = runFullSeason(seed, xi, lineup.battingOrder, lineup.captainId, null);
      expect(stats.percentile).toBeGreaterThanOrEqual(1);
      expect(stats.percentile).toBeLessThanOrEqual(99);
    }
  });

  it("a genuinely elite XI wins meaningfully more often than a genuinely weak one across many seeds", () => {
    const strong = strongestLegalXi();
    const weak = weakestLegalXi();
    const strongLineup = autoAssignLineup(strong);
    const weakLineup = autoAssignLineup(weak);

    const TRIALS = 20;
    let strongWinsTotal = 0;
    let weakWinsTotal = 0;
    for (let i = 0; i < TRIALS; i++) {
      strongWinsTotal += runFullSeason(`strong-${i}`, strong, strongLineup.battingOrder, strongLineup.captainId, null).wins;
      weakWinsTotal += runFullSeason(`weak-${i}`, weak, weakLineup.battingOrder, weakLineup.captainId, null).wins;
    }
    const strongAvg = strongWinsTotal / TRIALS;
    const weakAvg = weakWinsTotal / TRIALS;
    expect(strongAvg).toBeGreaterThan(weakAvg);
  });

  it("a 14-0 perfect record is reachable (not mathematically capped below 14 wins) for an elite XI over enough attempts", () => {
    // Empirically, a properly-composed elite XI goes 14-0 roughly 1% of the
    // time (measured: 5/500 in an offline sweep) — genuinely rare, which is
    // the point (it's a real achievement to chase), but never zero. 400
    // attempts gives this a >98% chance of surfacing at least one instance
    // if the true rate holds; a flake here on re-runs would be a real signal
    // worth re-investigating, not just noise to raise the count past.
    const strong = strongestLegalXi();
    const lineup = autoAssignLineup(strong);
    let sawPerfect = false;
    const ATTEMPTS = 400;
    for (let i = 0; i < ATTEMPTS; i++) {
      const stats = runFullSeason(`perfect-search-${i}`, strong, lineup.battingOrder, lineup.captainId, null);
      if (stats.wins === 14) {
        sawPerfect = true;
        break;
      }
    }
    expect(sawPerfect, `no 14-0 season found for the strongest XI across ${ATTEMPTS} seeds — the win ceiling may be capped`).toBe(true);
  });

  it("even the weakest legal XI does not always lose 0-14 — variance genuinely applies both ways", () => {
    const weak = weakestLegalXi();
    const lineup = autoAssignLineup(weak);
    let sawAnyWin = false;
    for (let i = 0; i < 60; i++) {
      const stats = runFullSeason(`weak-variance-${i}`, weak, lineup.battingOrder, lineup.captainId, null);
      if (stats.wins > 0) {
        sawAnyWin = true;
        break;
      }
    }
    expect(sawAnyWin).toBe(true);
  });

  it("awards reference players who are actually in the XI", () => {
    const xi = PLAYERS.slice(0, 11);
    const lineup = autoAssignLineup(xi);
    const stats = runFullSeason("awards-check", xi, lineup.battingOrder, lineup.captainId, null);
    const xiIds = new Set(xi.map((p) => p.id));
    expect(xiIds.has(stats.mvpPlayerId)).toBe(true);
    expect(xiIds.has(stats.bestPickPlayerId)).toBe(true);
    expect(xiIds.has(stats.weakestPickPlayerId)).toBe(true);
    expect(xiIds.has(stats.leadingRunScorer.playerId)).toBe(true);
    expect(xiIds.has(stats.leadingWicketTaker.playerId)).toBe(true);
  });
});
