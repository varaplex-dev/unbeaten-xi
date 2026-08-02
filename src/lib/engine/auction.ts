// Auction Mode — a salary-cap fantasy draft. Every player carries a fixed price
// derived from their overall rating (the same 0-99 signal the rest of the app
// ranks players by), on a CONVEX curve so the very best cost disproportionately
// more — a handful of marquee names will eat most of your purse, and the skill
// is finding value to fill the rest of the XI. No live bidding war: prices are
// fixed and you buy against a budget, NBA/NFL-fantasy style.
import type { Player } from "@/lib/types";
import { isWicketkeeper } from "@/lib/types";
import { realPlayers } from "@/lib/data/gameData";

/** The purse, in credits. Sized so an all-star XI (~11 marquee names) is well
 * out of reach — you can splash on two or three, then must find value for the
 * other eight. Tuned against the live price curve below. */
export const AUCTION_BUDGET = 100;

// How many players go on the block. Enough for real depth and budget options
// without an unbrowsably long list.
const MARKET_SIZE = 200;
// Guarantee a floor of keepers on the block so a legal XI is always buildable.
const MIN_KEEPERS = 12;
// A real T20 track record — enough batting innings OR wickets — so a handful of
// gaudy small-sample games (a 13-year-old's two-innings strike rate of 200)
// can't muscle established stars off the top of the block. Curated legends
// carry no stat line and are trusted on their rating.
const MIN_INNINGS = 40;
const MIN_WICKETS = 30;

function establishedEnough(p: Player): boolean {
  const cs = p.careerStats;
  if (!cs) return true;
  return (cs.innings ?? 0) >= MIN_INNINGS || cs.wickets >= MIN_WICKETS;
}

const MAX_PRICE = 20; // the single best player
const MIN_PRICE = 1.5; // the cheapest on the block
const PRICE_CURVE = 2.0; // >1 ⇒ the top end is disproportionately expensive

/** A continuous quality score used only to RANK the block. overallRating alone
 * saturates at 99 for the whole star tier, which would flat-price the top; the
 * finer 0-99 ratings and then real career VOLUME (runs, wickets, innings) break
 * those ties. Volume — not rate — is the tie-breaker on purpose: a marquee
 * international with thousands of runs sorts above a domestic player whose
 * strike rate is gaudy off a small sample, so the priciest names are the ones a
 * fan expects, not flat-track unknowns. */
function valueScore(p: Player): number {
  let s = p.overallRating * 100000 + (p.t20BattingRating + p.t20BowlingRating) * 100;
  const cs = p.careerStats;
  if (cs) {
    s += (cs.runs ?? 0) + cs.wickets * 25 + (cs.innings ?? 0) * 3;
  }
  return s;
}

export interface AuctionListing {
  player: Player;
  price: number;
}

let cached: AuctionListing[] | null = null;

/** The same real cricketer can appear under several ids (a legend entry vs a
 * franchise-season entry). Keep the highest-rated instance of each name so the
 * block never lists a player twice. */
function dedupeByName(players: Player[]): Player[] {
  const best = new Map<string, Player>();
  for (const p of players) {
    const cur = best.get(p.name);
    if (!cur || p.overallRating > cur.overallRating) best.set(p.name, p);
  }
  return [...best.values()];
}

/** The priced player market, highest price first. Memoised — it's deterministic
 * from the loaded pool. Returns [] until the dataset has loaded (callers gate on
 * useGameDataReady), and caches once it's non-empty. */
export function auctionMarket(): AuctionListing[] {
  if (cached) return cached;
  const pool = realPlayers();
  if (pool.length === 0) return [];

  const unique = dedupeByName(pool)
    .filter(establishedEnough)
    .sort((a, b) => valueScore(b) - valueScore(a));
  const selected = unique.slice(0, MARKET_SIZE);
  const keepersIn = selected.filter(isWicketkeeper).length;
  if (keepersIn < MIN_KEEPERS) {
    const seen = new Set(selected.map((p) => p.id));
    const topUp = unique
      .filter((p) => isWicketkeeper(p) && !seen.has(p.id))
      .slice(0, MIN_KEEPERS - keepersIn);
    selected.push(...topUp);
    selected.sort((a, b) => valueScore(b) - valueScore(a));
  }

  // Price by RANK, not raw rating — the best is dearest and it tapers down the
  // list, so the whole top tier no longer flat-lines at 99. Convex, so the very
  // top costs disproportionately more and a long value tail stays affordable.
  const n = selected.length;
  const market: AuctionListing[] = selected.map((player, rank) => {
    const f = n > 1 ? (n - 1 - rank) / (n - 1) : 1; // 1 = best, 0 = cheapest
    const price = MIN_PRICE + (MAX_PRICE - MIN_PRICE) * Math.pow(f, PRICE_CURVE);
    return { player, price: Math.round(price * 10) / 10 };
  });
  cached = market;
  return market;
}

export function auctionListingOf(playerId: string): AuctionListing | undefined {
  return auctionMarket().find((l) => l.player.id === playerId);
}

export function auctionPriceOf(playerId: string): number {
  return auctionListingOf(playerId)?.price ?? 0;
}

/** Total spent on a set of purchased player ids. */
export function auctionSpend(playerIds: string[]): number {
  const total = playerIds.reduce((sum, id) => sum + auctionPriceOf(id), 0);
  return Math.round(total * 10) / 10;
}
