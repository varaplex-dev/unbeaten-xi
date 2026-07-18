// Transforms cached raw CricketData.org (CricAPI v1) player responses into
// PlayerSpec literals using the same buildPlayer() rating engine as the
// fictional roster, so real and fictional players stay on one consistent
// scale. Run with:
//   npx tsx scripts/cricket-data/transform.ts
//   npx tsx scripts/cricket-data/transform.ts <cache-dir> <output-path> --legends
//
// Output: src/lib/data/realPlayerSpecs.generated.ts (checked in — this is
// the actual data the app reads at runtime; re-run this script to refresh
// it after fetch.mjs pulls newer stats).
//
// The --legends flag switches to retired-player mode (fixed career-prime
// age, "{country} Legends" team, "legend" tag) for the isolated
// legends-cache/ pipeline — see legendPlayerSpecs.generated.ts. Kept
// separate from the default current-player run specifically so retired
// legends can never leak into realPlayerSpecs.generated.ts (the flat
// current-player pool used by regular Draft mode).

import { readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type {
  BattingHand,
  BowlingStyle,
  NationalityType,
  PlayerRole,
  RarityTier,
} from "../../src/lib/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => a !== "--legends");
const IS_LEGENDS = process.argv.includes("--legends");
const CACHE_DIR = path.join(__dirname, args[0] ?? "cache");
const OUT_PATH = path.join(__dirname, args[1] ?? "../../src/lib/data/realPlayerSpecs.generated.ts");

interface RawStat {
  fn: "batting" | "bowling";
  matchtype: string;
  stat: string;
  value: string;
}

interface RawPlayer {
  id: string;
  name: string;
  dateOfBirth?: string;
  role?: string;
  battingStyle?: string;
  bowlingStyle?: string;
  country: string;
  playerImg?: string;
  stats?: RawStat[];
}

// Mirrors PlayerSpec in src/lib/data/playerFactory.ts (kept structurally
// compatible rather than imported, since this script runs outside Next's
// module graph).
interface GeneratedSpec {
  id: string;
  name: string;
  shortName: string;
  country: string;
  nationalityType: NationalityType;
  currentTeam: string;
  primaryRole: PlayerRole;
  secondaryRoles: PlayerRole[];
  battingHand: BattingHand;
  bowlingStyle: BowlingStyle;
  age: number;
  rarityTier: RarityTier;
  battingSkill: number;
  bowlingSkill: number;
  fieldingSkill: number;
  wicketkeepingSkill: number;
  tags: string[];
  imageUrl: string;
}

function clamp(v: number, min = 0, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** Trimmed percentile so one outlier stat doesn't blow out the whole scale. */
function percentileValue(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

/**
 * Linear rescale of value from [lo, hi] to [outLo, outHi]. Pass outLo > outHi
 * to invert direction (used for economy/bowling average, where a lower raw
 * value is better).
 */
function normalizeRange(value: number, lo: number, hi: number, outLo: number, outHi: number): number {
  if (hi <= lo) return (outLo + outHi) / 2;
  const t = (value - lo) / (hi - lo);
  return outLo + t * (outHi - outLo);
}

function getStatForType(stats: RawStat[], fn: "batting" | "bowling", matchtype: string, stat: string): number | null {
  const entry = stats.find((s) => s.fn === fn && s.matchtype === matchtype && s.stat.trim() === stat);
  if (!entry) return null;
  const n = parseFloat(entry.value.trim());
  return Number.isNaN(n) ? null : n;
}

/**
 * CricketData.org returns an all-zero placeholder record for match types a
 * player has never featured in (e.g. every non-IPL player still gets an
 * "ipl" bucket with m=0, inn=0, runs=0, ...). Picking fields independently
 * per stat would let a zero from an empty bucket silently win over a real
 * number from a lower-priority bucket, so instead we pick ONE matchtype —
 * the first in priority order with actual innings/matches played — and
 * pull every field from that same bucket.
 */
// A handful of balls is not a bowling sample — e.g. one part-time over that
// happened to go for 2/5 shouldn't outrate specialist bowlers who've bowled
// thousands of deliveries. Require at least 5 overs (30 balls) bowled.
const MIN_BOWLING_BALLS = 30;

function pickMatchType(stats: RawStat[], fn: "batting" | "bowling", preferredTypes: string[]): string | null {
  const countStat = fn === "batting" ? "inn" : "wkts";
  for (const mt of preferredTypes) {
    const count = getStatForType(stats, fn, mt, countStat);
    if (count === null || count <= 0) continue;
    if (fn === "bowling") {
      const balls = getStatForType(stats, fn, mt, "b");
      if (balls === null || balls < MIN_BOWLING_BALLS) continue;
    }
    return mt;
  }
  return null;
}

function mapBowlingStyle(raw: string | undefined | null): BowlingStyle {
  if (!raw) return "none";
  const s = raw.toLowerCase();
  if (s.includes("legbreak") || s.includes("wrist-spin")) return "leg-spin";
  if (s.includes("offbreak")) return "right-arm-offspin";
  if (s.includes("orthodox")) return "left-arm-orthodox";
  if (s.includes("left-arm") && (s.includes("fast") || s.includes("medium"))) {
    return s.includes("fast") ? "left-arm-fast" : "left-arm-medium";
  }
  if (s.includes("right-arm") && (s.includes("fast") || s.includes("medium"))) {
    return s.includes("fast") ? "right-arm-fast" : "right-arm-medium";
  }
  return "none";
}

function isSpinStyle(style: BowlingStyle): boolean {
  return style === "leg-spin" || style === "right-arm-offspin" || style === "left-arm-orthodox";
}
function isPaceStyle(style: BowlingStyle): boolean {
  return (
    style === "right-arm-fast" ||
    style === "left-arm-fast" ||
    style === "right-arm-medium" ||
    style === "left-arm-medium"
  );
}

function bowlingRoleFor(style: BowlingStyle): PlayerRole {
  if (style === "leg-spin") return "leg-spinner";
  if (style === "right-arm-offspin") return "off-spinner";
  if (style === "left-arm-orthodox") return "left-arm-spinner";
  return "fast-bowler";
}

function computeAge(dateOfBirth: string | undefined): number {
  if (!dateOfBirth) return 28;
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function shortNameFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return name;
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

const T20_TYPES = ["ipl", "t20i", "t20"];
// Fallback for players with zero cached T20/IPL/T20I data — e.g. a current
// Test specialist without a T20 league contract, not necessarily someone
// retired. Rated off ODI first (closer in shape to a T20 innings), falling
// back to Test if that's all there is.
const LEGACY_TYPES = ["odi", "test"];

type Era = "modern" | "legacy";

interface Metrics {
  raw: RawPlayer;
  era: Era;
  runs: number;
  battingAvg: number;
  strikeRate: number;
  innings: number;
  bowlingAvg: number | null;
  economy: number | null;
  wickets: number;
}

function extractMetrics(raw: RawPlayer): Metrics {
  const stats = raw.stats ?? [];

  // Current players are rated off T20-format stats first since that's their
  // primary competitive identity. Legends are rated off Test/ODI first
  // instead — several (Tendulkar, Warne, Gilchrist, Kallis...) picked up a
  // handful of IPL innings in their final playing years, and a small,
  // unrepresentative late-career T20 sample shouldn't outrank the much
  // larger body of work that actually made them a legend.
  const primaryTypes = IS_LEGENDS ? LEGACY_TYPES : T20_TYPES;
  const secondaryTypes = IS_LEGENDS ? T20_TYPES : LEGACY_TYPES;
  const primaryEra: Era = IS_LEGENDS ? "legacy" : "modern";
  const secondaryEra: Era = IS_LEGENDS ? "modern" : "legacy";

  let battingType = pickMatchType(stats, "batting", primaryTypes);
  let bowlingType = pickMatchType(stats, "bowling", primaryTypes);
  let era: Era = primaryEra;

  if (!battingType && !bowlingType) {
    const fallbackBattingType = pickMatchType(stats, "batting", secondaryTypes);
    const fallbackBowlingType = pickMatchType(stats, "bowling", secondaryTypes);
    if (fallbackBattingType || fallbackBowlingType) {
      battingType = fallbackBattingType;
      bowlingType = fallbackBowlingType;
      era = secondaryEra;
    }
  }

  return {
    raw,
    era,
    runs: battingType ? (getStatForType(stats, "batting", battingType, "runs") ?? 0) : 0,
    battingAvg: battingType ? (getStatForType(stats, "batting", battingType, "avg") ?? 0) : 0,
    strikeRate: battingType ? (getStatForType(stats, "batting", battingType, "sr") ?? 0) : 0,
    innings: battingType ? (getStatForType(stats, "batting", battingType, "inn") ?? 0) : 0,
    bowlingAvg: bowlingType ? getStatForType(stats, "bowling", bowlingType, "avg") : null,
    economy: bowlingType ? getStatForType(stats, "bowling", bowlingType, "econ") : null,
    wickets: bowlingType ? (getStatForType(stats, "bowling", bowlingType, "wkts") ?? 0) : 0,
  };
}

interface PoolNorms {
  avgLo: number;
  avgHi: number;
  srLo: number;
  srHi: number;
  econLo: number;
  econHi: number;
  bowlAvgLo: number;
  bowlAvgHi: number;
}

/**
 * Every player in this pool is a genuine international pro, so ratings are
 * calibrated relative to THIS pool (10th-90th percentile band mapped to
 * 42-97) rather than against fixed all-time thresholds. That keeps the
 * "weakest" player here feeling like a real pro, not a scrub, while still
 * spreading the pool out for draft variety.
 *
 * Computed separately per era: mixing Test/ODI-scale numbers into the same
 * percentile band as T20/IPL numbers would be apples-to-oranges (Test
 * bowling averages, for instance, run on a completely different scale to
 * T20 economy rates).
 */
function computePoolNorms(pool: Metrics[]): PoolNorms {
  const battingAvgs = pool.filter((m) => m.innings > 0).map((m) => m.battingAvg).sort((a, b) => a - b);
  const strikeRates = pool.filter((m) => m.innings > 0).map((m) => m.strikeRate).sort((a, b) => a - b);
  const economies = pool
    .filter((m) => m.wickets > 0 && m.economy !== null)
    .map((m) => m.economy as number)
    .sort((a, b) => a - b);
  const bowlAvgs = pool
    .filter((m) => m.wickets > 0 && m.bowlingAvg !== null)
    .map((m) => m.bowlingAvg as number)
    .sort((a, b) => a - b);

  return {
    avgLo: percentileValue(battingAvgs, 0.1),
    avgHi: percentileValue(battingAvgs, 0.9),
    srLo: percentileValue(strikeRates, 0.1),
    srHi: percentileValue(strikeRates, 0.9),
    econLo: percentileValue(economies, 0.1),
    econHi: percentileValue(economies, 0.9),
    bowlAvgLo: percentileValue(bowlAvgs, 0.1),
    bowlAvgHi: percentileValue(bowlAvgs, 0.9),
  };
}

function transformOne(m: Metrics, norms: PoolNorms, legacyNorms: PoolNorms): GeneratedSpec {
  const raw = m.raw;
  const isLegacy = m.era === "legacy";
  const activeNorms = isLegacy ? legacyNorms : norms;
  // Strike rate off Test/ODI stats isn't a meaningful "explosiveness" signal
  // the way it is in T20 — a watchful 40-off-120-balls innings can still be
  // a match-winning knock. Weight average much more heavily for players
  // rated off this pool; SR/economy still nudge the number but don't
  // dominate it.
  const battingWeights = isLegacy ? ([0.8, 0.2] as const) : ([0.55, 0.45] as const);
  const bowlingWeights = isLegacy ? ([0.35, 0.65] as const) : ([0.5, 0.5] as const);

  let battingSkill = 15;
  if (m.innings > 0) {
    const avgScore = normalizeRange(m.battingAvg, activeNorms.avgLo, activeNorms.avgHi, 42, 97);
    const srScore = normalizeRange(m.strikeRate, activeNorms.srLo, activeNorms.srHi, 42, 97);
    battingSkill = clamp(avgScore * battingWeights[0] + srScore * battingWeights[1], 15, 99);
  }

  let bowlingSkill = 0;
  if (m.wickets > 0 && m.economy !== null && m.bowlingAvg !== null) {
    // Inverted: a lower economy/average maps to a HIGHER score, so outLo/outHi
    // are swapped relative to the batting normalizations above.
    const econScore = normalizeRange(m.economy, activeNorms.econLo, activeNorms.econHi, 97, 42);
    const avgScore = normalizeRange(m.bowlingAvg, activeNorms.bowlAvgLo, activeNorms.bowlAvgHi, 97, 42);
    bowlingSkill = clamp(econScore * bowlingWeights[0] + avgScore * bowlingWeights[1], 15, 99);
  }

  const runs = m.runs;
  const battingHand: BattingHand = raw.battingStyle === "Left Handed Bat" ? "left" : "right";
  const bowlingStyle = mapBowlingStyle(raw.bowlingStyle);
  const nationalityType: NationalityType = raw.country === "India" ? "indian" : "overseas";

  // The API's `role` field is reliable for current players (sourced from
  // official match_squad listings, see discover-squads.mjs) but not for
  // legends fetched via name search — e.g. Malcolm Marshall (376 Test
  // wickets, arguably the greatest fast bowler ever) comes back labeled
  // plain "Batsman". When bowling output clearly dominates batting output,
  // trust the stats over the label rather than drafting a legendary quick
  // as a specialist batter.
  const bowlDominance = bowlingSkill - battingSkill;
  const statsOverrideRole: "specialist-bowler" | "bowling-allrounder" | null =
    m.wickets >= 20 && bowlDominance >= 30
      ? "specialist-bowler"
      : m.wickets >= 20 && bowlDominance >= 10
        ? "bowling-allrounder"
        : null;

  // No stat in the API's `stats` array signals wicketkeeping (no dismissals/
  // stumpings field), so unlike the bowling override above there's no data
  // signal to check — this has to be a manually-curated fact. Only two of
  // the curated legends need it; everyone else's keeper status happened to
  // come through correctly in the raw `role` field.
  const KNOWN_LEGEND_WICKETKEEPERS = new Set(["Jeff Dujon", "Moin Khan"]);
  const isKnownWicketkeeper = IS_LEGENDS && KNOWN_LEGEND_WICKETKEEPERS.has(raw.name);

  const roleRaw = statsOverrideRole ? "" : (raw.role ?? "Batsman").toLowerCase();
  let primaryRole: PlayerRole;
  const secondaryRoles: PlayerRole[] = [];

  if (isKnownWicketkeeper) {
    primaryRole = "wicketkeeper-batter";
  } else if (statsOverrideRole === "specialist-bowler") {
    primaryRole = bowlingRoleFor(bowlingStyle);
  } else if (statsOverrideRole === "bowling-allrounder") {
    primaryRole = "bowling-allrounder";
    secondaryRoles.push(bowlingRoleFor(bowlingStyle));
  } else if (roleRaw.includes("wk")) {
    primaryRole = "wicketkeeper-batter";
  } else if (roleRaw === "bowler") {
    primaryRole = bowlingRoleFor(bowlingStyle);
  } else if (roleRaw.includes("bowling allrounder")) {
    primaryRole = "bowling-allrounder";
    secondaryRoles.push(bowlingRoleFor(bowlingStyle));
  } else if (roleRaw.includes("batting allrounder")) {
    primaryRole = "batting-allrounder";
    if (bowlingStyle !== "none") secondaryRoles.push(bowlingRoleFor(bowlingStyle));
  } else {
    // Pure batsman: the API doesn't expose batting-position data, so this
    // is a heuristic from the player's own scoring profile, not a fact.
    if (m.strikeRate >= 145 && m.battingAvg < 40) {
      primaryRole = "finisher";
    } else if (m.battingAvg >= 42) {
      primaryRole = "top-order";
    } else {
      primaryRole = "middle-order";
    }
  }

  const overallProxy = primaryRole === "wicketkeeper-batter" || !isPaceStyle(bowlingStyle) && !isSpinStyle(bowlingStyle)
    ? battingSkill
    : Math.max(battingSkill, bowlingSkill);
  const rarityTier: RarityTier =
    overallProxy >= 80 ? "legendary" : overallProxy >= 68 ? "rare" : overallProxy >= 50 ? "uncommon" : "common";

  // The "legacy" era flag only controls which stat pool a player is rated
  // against (see activeNorms above) — it does NOT mean "retired". Whether a
  // player is a current pro or a retired legend is determined entirely by
  // which pipeline invocation they came through (IS_LEGENDS), not by which
  // stat bucket their rating happens to be normalized against. A current
  // Test specialist without a T20 league deal is still current, just rated
  // off ODI/Test numbers.
  const age = IS_LEGENDS ? 29 : computeAge(raw.dateOfBirth);
  const currentTeam = IS_LEGENDS ? `${raw.country} Legends` : `${raw.country} National Team`;
  const tags = IS_LEGENDS
    ? runs > 5000
      ? ["legend", "real-player", "hall-of-fame"]
      : ["legend", "real-player"]
    : runs > 5000
      ? ["current-star", "real-player", "big-match-player"]
      : ["current-star", "real-player"];

  return {
    id: `real-${raw.id.slice(0, 8)}`,
    name: raw.name,
    shortName: shortNameFor(raw.name),
    country: raw.country,
    nationalityType,
    currentTeam,
    primaryRole,
    secondaryRoles,
    battingHand,
    bowlingStyle,
    age,
    rarityTier,
    battingSkill: Math.round(battingSkill),
    bowlingSkill: Math.round(bowlingSkill),
    fieldingSkill: 65,
    wicketkeepingSkill: primaryRole === "wicketkeeper-batter" ? 78 : 0,
    tags,
    imageUrl: raw.playerImg ?? "",
  };
}

function main() {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  const allRawPlayers: RawPlayer[] = files.map((f) => JSON.parse(readFileSync(path.join(CACHE_DIR, f), "utf8")));
  // A handful of fringe squad entries (mostly newer associate-circuit
  // leagues like MLC) come back from players_info with no role and no stats
  // at all — nothing to ground a rating in. Rather than fabricate a
  // default-skill filler player, skip them; "ratings built from real stats"
  // only holds if there are real stats to build from.
  const rawPlayers = allRawPlayers.filter((p) => p.role || (p.stats && p.stats.length > 0));
  const skipped = allRawPlayers.length - rawPlayers.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} cached player(s) with no role and no stats.`);
  }
  const metrics = rawPlayers.map(extractMetrics);

  const modernMetrics = metrics.filter((m) => m.era === "modern");
  const legacyMetrics = metrics.filter((m) => m.era === "legacy");
  const norms = computePoolNorms(modernMetrics);
  const legacyNorms = computePoolNorms(legacyMetrics.length > 0 ? legacyMetrics : modernMetrics);

  const specs = metrics.map((m) => transformOne(m, norms, legacyNorms));
  const exportName = IS_LEGENDS ? "LEGEND_PLAYER_SPECS" : "REAL_PLAYER_SPECS";
  const cacheDirName = args[0] ?? "cache";
  const rerunCmd = IS_LEGENDS
    ? `npx tsx scripts/cricket-data/transform.ts ${args[0]} ${args[1]} --legends`
    : `npx tsx scripts/cricket-data/transform.ts`;

  const header = `// AUTO-GENERATED by scripts/cricket-data/transform.ts — do not hand-edit.
// Source: cricketdata.org (CricAPI v1), cached responses in scripts/cricket-data/${cacheDirName}/.
// Re-run \`${rerunCmd}\` after refreshing the cache to regenerate this file.
import type { PlayerSpec } from "@/lib/data/playerFactory";

export const ${exportName}: PlayerSpec[] = ${JSON.stringify(specs, null, 2)};
`;

  writeFileSync(OUT_PATH, header);
  console.log(
    `Wrote ${specs.length} ${IS_LEGENDS ? "legend" : "real"} player specs (${modernMetrics.length} modern, ${legacyMetrics.length} legacy) to ${OUT_PATH}`
  );
}

main();
