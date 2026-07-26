import { describe, expect, it } from "vitest";
import { ERA_TEAMS, NATIONAL_TEAM_POOL, pickNextEraTeam } from "@/lib/data/eraTeams";
import { FRANCHISE_SEASON_TEAMS } from "@/lib/data/franchiseSeasonTeams";

describe("World Cup Run drafting pool", () => {
  it("contains no club franchises", () => {
    const franchiseIds = new Set(FRANCHISE_SEASON_TEAMS.map((t) => t.id));
    const leaked = NATIONAL_TEAM_POOL.filter((t) => franchiseIds.has(t.id));
    expect(leaked.map((t) => t.name)).toEqual([]);
  });

  it("is a strict subset of the full pool, and smaller than it", () => {
    const allIds = new Set(ERA_TEAMS.map((t) => t.id));
    expect(NATIONAL_TEAM_POOL.every((t) => allIds.has(t.id))).toBe(true);
    expect(NATIONAL_TEAM_POOL.length).toBeLessThan(ERA_TEAMS.length);
  });

  it("holds the same nation in several eras — different squads, not duplicates", () => {
    // The rule that matters is no duplicate PLAYER; a country appearing in
    // more than one era is intentional, so a World Cup XI can pair India
    // 2018-2021 with India 2013-2017.
    const byCountry = new Map<string, number>();
    for (const t of NATIONAL_TEAM_POOL) byCountry.set(t.name, (byCountry.get(t.name) ?? 0) + 1);
    const multiEra = [...byCountry.values()].filter((n) => n > 1);
    expect(multiEra.length).toBeGreaterThan(0);
    expect(new Set(NATIONAL_TEAM_POOL.map((t) => t.id)).size).toBe(NATIONAL_TEAM_POOL.length);
  });

  it("every team can field an XI, so any of them can also be a season opponent", () => {
    // simulate.ts only schedules opponents with 11+ players. A drafting pool
    // team that can't also be played against would be an inconsistency.
    const short = NATIONAL_TEAM_POOL.filter((t) => t.players.length < 11);
    expect(short.map((t) => `${t.name} ${t.eraLabel}`)).toEqual([]);
  });

  it("spins only into national sides when given the national pool", () => {
    const used: string[] = [];
    for (let i = 0; i < 12; i++) {
      const team = pickNextEraTeam("world-cup-seed", used, NATIONAL_TEAM_POOL);
      expect(NATIONAL_TEAM_POOL.some((t) => t.id === team.id)).toBe(true);
      used.push(team.id);
    }
    // No team is offered twice within one draft.
    expect(new Set(used).size).toBe(used.length);
  });
});
