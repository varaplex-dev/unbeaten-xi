import type { Player } from "@/lib/types";
import { PLAYERS } from "@/lib/data/players";

/**
 * Extension point for swapping the fictional mock roster for a real,
 * licensed data source (see /docs or the project chat history for provider
 * options — CricketData.org, Sportmonks, Roanuz were evaluated).
 *
 * Every provider — mock or live — resolves to the same Player[] shape
 * (src/lib/types.ts), so nothing in the draft engine, simulation, or UI
 * needs to change when a real provider is added. Only:
 *   1. A new class implementing this interface (e.g. LivePlayerDataProvider)
 *   2. The factory below, switched via an env var
 *   3. A small refactor of the pages that currently read PLAYERS
 *      synchronously (draft/team-setup) to await getPlayerDataProvider()
 *      once, on mount — the draft engine itself already accepts an
 *      arbitrary `pool: Player[]`, so this is a load-time concern only.
 */
export interface PlayerDataProvider {
  /** Human-readable id for logging/debugging, e.g. "mock" or "sportmonks". */
  readonly id: string;
  getAllPlayers(): Promise<Player[]>;
}

export class MockPlayerDataProvider implements PlayerDataProvider {
  readonly id = "mock";

  async getAllPlayers(): Promise<Player[]> {
    return PLAYERS;
  }
}

/**
 * Stub for a real provider. Fill in once an API key is available:
 *   - Read the key from an env var (e.g. CRICKET_DATA_API_KEY) — never
 *     hardcode it, and never call the provider directly from client
 *     components, since that would expose the key. Route the fetch through
 *     a Next.js Route Handler (src/app/api/players/route.ts) instead.
 *   - Map the provider's response shape into Player[] using a function
 *     analogous to buildPlayer() in playerFactory.ts, so rating fields stay
 *     consistent with how the simulation engine expects them.
 *   - Respect the provider's rate limits and cache responses (players don't
 *     change every request — a daily revalidation is plenty).
 */
export class LivePlayerDataProvider implements PlayerDataProvider {
  readonly id = "live";

  async getAllPlayers(): Promise<Player[]> {
    throw new Error(
      "LivePlayerDataProvider is not configured yet. Set CRICKET_DATA_PROVIDER=mock, " +
        "or implement this class once a licensed cricket data API key is available."
    );
  }
}

export function getPlayerDataProvider(): PlayerDataProvider {
  const providerId = process.env.CRICKET_DATA_PROVIDER ?? "mock";
  switch (providerId) {
    case "live":
      return new LivePlayerDataProvider();
    case "mock":
    default:
      return new MockPlayerDataProvider();
  }
}
