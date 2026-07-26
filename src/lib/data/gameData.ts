import type { EraTeam, Player } from "@/lib/types";

/**
 * Lazy, one-time loader for the heavy player dataset (~3.3MB raw).
 *
 * Every other module reaches the real-cricketer pools and era teams ONLY
 * through the accessors here, and this file imports the heavy data ONLY via
 * dynamic `import()`. That is the whole point: a static import graph made
 * Turbopack copy the dataset into every game route's chunk (five identical
 * 3.26MB chunks). Behind a single dynamic import it becomes one shared async
 * chunk the browser downloads once and caches.
 *
 * The trade-off is that the data is no longer available synchronously at
 * module load. Accessors therefore return empty/undefined until `loadGameData`
 * resolves — callers render through `useGameDataReady()` (a brief loading
 * state) and game actions run only after the data is in. `players.ts`
 * (fictional squad, ~24KB) stays static and synchronous; only the big real /
 * legend / national data is deferred.
 */
interface GameData {
  eraTeams: EraTeam[];
  nationalTeamPool: EraTeam[];
  realPlayers: Player[];
  getEraTeamById: (id: string) => EraTeam | undefined;
  pickNextEraTeam: (seed: string, usedEraTeamIds: string[], teams?: EraTeam[]) => EraTeam;
  getRealPoolPlayerById: (id: string) => Player | undefined;
}

let cache: GameData | null = null;
let inFlight: Promise<GameData> | null = null;

/** Loads the dataset once. Concurrent callers share the same promise, and once
 * resolved it's a no-op that returns the cached bundle. */
export function loadGameData(): Promise<GameData> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // Dynamic imports so the heavy modules land in one shared async chunk.
    // eraTeams + realPool transitively pull in every real/legend/national
    // spec file, so this is the whole dataset.
    const [eraMod, poolMod, realMod] = await Promise.all([
      import("@/lib/data/eraTeams"),
      import("@/lib/data/realPool"),
      import("@/lib/data/realPlayers"),
    ]);
    cache = {
      eraTeams: eraMod.ERA_TEAMS,
      nationalTeamPool: eraMod.NATIONAL_TEAM_POOL,
      realPlayers: realMod.REAL_PLAYERS,
      getEraTeamById: eraMod.getEraTeamById,
      pickNextEraTeam: eraMod.pickNextEraTeam,
      getRealPoolPlayerById: poolMod.getRealPoolPlayerById,
    };
    return cache;
  })();
  return inFlight;
}

export function isGameDataReady(): boolean {
  return cache !== null;
}

// ── Synchronous accessors ─────────────────────────────────────────────────
// Safe before load: they return empty/undefined rather than throwing, so a
// selector or render that runs a tick early just shows nothing until the
// `useGameDataReady()` gate re-renders with the data in place.

export function eraTeams(): EraTeam[] {
  return cache?.eraTeams ?? [];
}

export function nationalTeamPool(): EraTeam[] {
  return cache?.nationalTeamPool ?? [];
}

export function realPlayers(): Player[] {
  return cache?.realPlayers ?? [];
}

export function getEraTeamById(id: string): EraTeam | undefined {
  return cache?.getEraTeamById(id);
}

export function getRealPoolPlayerById(id: string): Player | undefined {
  return cache?.getRealPoolPlayerById(id);
}

/** Deterministic next-spin team. Only meaningful once the data is loaded
 * (callers are game actions that run post-load); returns undefined otherwise. */
export function pickNextEraTeam(
  seed: string,
  usedEraTeamIds: string[],
  teams?: EraTeam[]
): EraTeam | undefined {
  return cache?.pickNextEraTeam(seed, usedEraTeamIds, teams);
}
