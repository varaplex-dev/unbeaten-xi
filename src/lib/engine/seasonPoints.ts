// Season points — the single score that ranks the single-player leaderboards.
//
// A points total reads far better than a raw wins/losses sort: it turns a
// season into one number a player can chase and compare. The formula is built
// in the spirit of "chase perfection" games (go the whole season unbeaten),
// tuned to this game's identity — it is called The Unbeaten XI, so going
// undefeated is the thing it rewards most.
//
// Three principles, strictly ranked:
//   1. Record is king. More wins always scores higher — nothing can overturn a
//      better record.
//   2. Perfection is exalted. An undefeated season earns a premium beyond the
//      linear value of its wins.
//   3. Dominance breaks ties. Net run rate separates two equal records but is
//      capped below the value of a single win, so it can never cross a win
//      boundary.
//
// ⚠ This formula is mirrored in SQL in the leaderboard views
// (supabase/setup_all.sql and supabase/add_season_points.sql) so the database
// ranks by exactly the same score. If you change the numbers here, change them
// there too — the two must stay identical.

/** Points per win — the fundamental unit, a round number for a clean board. */
export const SEASON_WIN_POINTS = 100;

/** Premium for finishing a season with zero losses. ≈ 2.5 wins, so a perfect
 * season stands clearly apart from a one-loss one without being unreachable. */
export const SEASON_PERFECT_BONUS = 250;

/** Net-run-rate is multiplied by this to form the dominance component. NRR in
 * this game runs roughly -3..+3, so this yields about ±45 before the cap. */
export const SEASON_DOMINANCE_PER_NRR = 15;

/** Hard cap on the dominance component. Deliberately BELOW SEASON_WIN_POINTS so
 * however dominant a season is, it can never outweigh a single extra win — the
 * record hierarchy is inviolable. */
export const SEASON_DOMINANCE_CAP = 45;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The leaderboard score for one completed season.
 *
 * @param wins        matches won
 * @param losses      matches lost (wins + losses = the competition's length)
 * @param netRunRate  season net run rate; positive = outscored opponents
 */
export function seasonPoints(wins: number, losses: number, netRunRate: number): number {
  const base = wins * SEASON_WIN_POINTS;
  // `wins > 0` guards against an empty 0-0 record scoring the perfect bonus.
  const perfect = losses === 0 && wins > 0 ? SEASON_PERFECT_BONUS : 0;
  const dominance = clamp(
    Math.round(netRunRate * SEASON_DOMINANCE_PER_NRR),
    -SEASON_DOMINANCE_CAP,
    SEASON_DOMINANCE_CAP
  );
  return Math.max(0, base + perfect + dominance);
}
