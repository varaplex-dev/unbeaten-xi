import type { Player } from "@/lib/types";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { getLegendPlayerById } from "@/lib/data/legendPlayers";
import { getNationalPlayerById } from "@/lib/data/nationalEraTeams";

/**
 * Resolves a player id against every real-cricketer pool the game drafts from.
 *
 * There are three, and they are keyed by different id prefixes:
 *   `real-…`   CricAPI-sourced current internationals
 *   `legend-…` curated pre-T20 greats
 *   `nat-…`    Cricsheet+SportMonks national era squads
 *
 * This used to be an inline `a(id) ?? b(id)` repeated across six call sites,
 * which meant every new pool had to be threaded through all six by hand — and
 * a missed one shows up as a drafted player silently rendering as "—". One
 * resolver, one place to extend.
 */
export function getRealPoolPlayerById(id: string): Player | undefined {
  return getRealPlayerById(id) ?? getLegendPlayerById(id) ?? getNationalPlayerById(id);
}
