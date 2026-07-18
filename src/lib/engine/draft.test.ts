import { describe, it, expect } from "vitest";
import {
  generateDraftRound,
  generateRandomXI,
  generateImpactPlayerOptions,
  spinImpactPlayer,
  checkComposition,
} from "./draft";
import { PLAYERS } from "@/lib/data/players";
import { REAL_PLAYERS } from "@/lib/data/realPlayers";
import { MAX_OVERSEAS, SQUAD_SIZE, type Player } from "@/lib/types";

function draftFullXi(seed: string, pool: Player[]): Player[] {
  const drafted: Player[] = [];
  for (let round = 1; round <= SQUAD_SIZE; round++) {
    const r = generateDraftRound({ seed, roundNumber: round, draftedSoFar: drafted, pool });
    // Deterministic choice: always take the first option, so the whole
    // sequence is reproducible for the determinism test below.
    drafted.push(r.options[0]);
  }
  return drafted;
}

describe("generateDraftRound", () => {
  it("never offers a player already drafted this game", () => {
    for (const seed of ["seed-a", "seed-b", "seed-c"]) {
      const drafted: Player[] = [];
      for (let round = 1; round <= SQUAD_SIZE; round++) {
        const r = generateDraftRound({ seed, roundNumber: round, draftedSoFar: drafted, pool: PLAYERS });
        const draftedIds = new Set(drafted.map((p) => p.id));
        for (const option of r.options) {
          expect(draftedIds.has(option.id)).toBe(false);
        }
        drafted.push(r.options[0]);
      }
    }
  });

  it("always yields a legal, complete XI when the same option index is taken every round", () => {
    for (const seed of ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"]) {
      const xi = draftFullXi(seed, PLAYERS);
      expect(xi).toHaveLength(SQUAD_SIZE);
      const result = checkComposition(xi);
      expect(result.legal, `seed ${seed} produced an illegal XI: ${JSON.stringify(result.issues)}`).toBe(true);
    }
  });

  it("is fully deterministic: the same seed and the same choices reproduce the same draft", () => {
    const first = draftFullXi("determinism-check", PLAYERS);
    const second = draftFullXi("determinism-check", PLAYERS);
    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
  });

  it("different seeds produce different drafts", () => {
    const a = draftFullXi("seed-alpha", PLAYERS);
    const b = draftFullXi("seed-beta", PLAYERS);
    expect(a.map((p) => p.id)).not.toEqual(b.map((p) => p.id));
  });

  it("never lets overseas count exceed the cap, even under adversarial always-pick-first choices", () => {
    for (const seed of ["seed-1", "seed-2", "seed-3", "over-a", "over-b"]) {
      const xi = draftFullXi(seed, PLAYERS);
      const overseas = xi.filter((p) => p.nationalityType === "overseas").length;
      expect(overseas).toBeLessThanOrEqual(MAX_OVERSEAS);
    }
  });

  it("holds up against the much larger real-player pool too", () => {
    for (const seed of ["real-seed-1", "real-seed-2", "real-seed-3"]) {
      const xi = draftFullXi(seed, REAL_PLAYERS);
      expect(xi).toHaveLength(SQUAD_SIZE);
      expect(checkComposition(xi).legal).toBe(true);
    }
  });
});

describe("generateRandomXI (Spin the Wheel)", () => {
  it("always produces a complete, legal XI across many seeds", () => {
    for (let i = 0; i < 25; i++) {
      const picks = generateRandomXI(`spin-fictional-${i}`, PLAYERS);
      expect(picks).toHaveLength(SQUAD_SIZE);
      const xi = picks.map((p) => p.player);
      const uniqueIds = new Set(xi.map((p) => p.id));
      expect(uniqueIds.size).toBe(SQUAD_SIZE);
      const result = checkComposition(xi);
      expect(result.legal, `spin seed ${i} illegal: ${JSON.stringify(result.issues)}`).toBe(true);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generateRandomXI("spin-determinism", PLAYERS).map((p) => p.player.id);
    const b = generateRandomXI("spin-determinism", PLAYERS).map((p) => p.player.id);
    expect(a).toEqual(b);
  });

  it("produces legal XIs against the real-player pool too", () => {
    for (let i = 0; i < 15; i++) {
      const picks = generateRandomXI(`spin-real-${i}`, REAL_PLAYERS);
      const xi = picks.map((p) => p.player);
      expect(checkComposition(xi).legal).toBe(true);
    }
  });
});

describe("checkComposition", () => {
  it("flags a squad missing a wicketkeeper", () => {
    const noKeeper = PLAYERS.filter((p) => !p.secondaryRoles.includes("wicketkeeper-batter") && p.primaryRole !== "wicketkeeper-batter").slice(0, SQUAD_SIZE);
    const result = checkComposition(noKeeper);
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.code === "wicketkeeper")).toBe(true);
  });

  it("flags a squad over the overseas cap", () => {
    const overseasHeavy = PLAYERS.filter((p) => p.nationalityType === "overseas").slice(0, SQUAD_SIZE);
    if (overseasHeavy.length === SQUAD_SIZE) {
      const result = checkComposition(overseasHeavy);
      expect(result.legal).toBe(false);
      expect(result.issues.some((i) => i.code === "overseas-limit")).toBe(true);
    }
  });

  it("flags a squad that isn't 11 players", () => {
    const result = checkComposition(PLAYERS.slice(0, 5));
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.code === "squad-size")).toBe(true);
  });
});

describe("generateImpactPlayerOptions / spinImpactPlayer", () => {
  it("never offers an already-drafted player", () => {
    const xi = draftFullXi("impact-test", PLAYERS);
    const draftedIds = new Set(xi.map((p) => p.id));
    const options = generateImpactPlayerOptions("impact-test", xi, PLAYERS);
    for (const option of options) {
      expect(draftedIds.has(option.id)).toBe(false);
    }
  });

  it("spinImpactPlayer is deterministic and picks from the offered options", () => {
    const xi = draftFullXi("impact-spin", PLAYERS);
    const a = spinImpactPlayer("impact-spin", xi, PLAYERS);
    const b = spinImpactPlayer("impact-spin", xi, PLAYERS);
    expect(a?.id).toBe(b?.id);
    const options = generateImpactPlayerOptions("impact-spin", xi, PLAYERS);
    expect(options.some((o) => o.id === a?.id)).toBe(true);
  });
});
