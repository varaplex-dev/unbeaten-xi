// Turns the unified Cricsheet+SportMonks database into national era squads
// the spin pool can draft from.
//
// Cricsheet's T20 archive covers 2005-2026. A player active 2012-2025 would
// otherwise belong to every era at once, so each player is assigned to
// EXACTLY ONE era bucket — the one containing their career midpoint. That
// keeps squads disjoint: no player can be spun into twice, and each era shows
// a genuinely different generation of cricketers.
//
// Ratings are percentile-normalized WITHIN each era bucket, not against fixed
// thresholds. T20 scoring inflated substantially between 2005 and 2026, so a
// 2008 strike rate and a 2024 strike rate are not the same achievement. This
// is the same era-fairness principle used in scripts/cricket-data/transform.ts.
//
// Run:  node scripts/sportmonks/generate-national-teams.mjs
// In:   scripts/sportmonks/unified-players.json  (from reconcile.mjs)
// Out:  src/lib/data/nationalPlayerSpecs.generated.ts
//       src/lib/data/nationalEraTeams.generated.ts

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const UNIFIED_FILE = path.join(HERE, "unified-players.json");
const SPECS_OUT = path.join(REPO, "src", "lib", "data", "nationalPlayerSpecs.generated.ts");
const TEAMS_OUT = path.join(REPO, "src", "lib", "data", "nationalEraTeams.generated.ts");

// A floor for ELIGIBILITY — who counts toward an era's statistical sample and
// can fill out a squad. Deliberately low: the shrinkage below regresses a
// short career almost entirely to its era mean, so these players cannot
// distort the percentile bands, and ROSTER_MIN_MATCHES keeps them out of any
// squad with better options. Their only real job is letting thin nation/era
// combinations reach a full XI — at 10, Sri Lanka 2005-2012 had exactly ten
// qualifying players and produced no squad at all, which is what left Mahela
// Jayawardene with no side he actually played for.
const MIN_MATCHES = Number(process.env.MIN_MATCHES ?? 4);

// A second, higher floor for ROSTER SELECTION. Eligibility and squad
// membership are different questions: a player with 12 T20 matches belongs in
// the era's statistical sample but not in his country's national squad. Deep
// pools (India, England, Australia) use this floor and field real
// internationals; thin pools fall back to whoever they have, so no country
// loses its squad for being small. Raising MIN_MATCHES itself would have cut
// the squad count from 73 to 31 — this keeps the breadth and the quality.
const ROSTER_MIN_MATCHES = Number(process.env.ROSTER_MIN_MATCHES ?? 40);
// Eleven is NOT arbitrary and must not be lowered. Every era team does two
// jobs: it is a roster you pick one player from, and it is a season opponent.
// An opponent has to field an XI (see `ERA_TEAMS.filter(t => t.players.length
// >= 11)` in src/lib/engine/simulate.ts). Dropping this floor would create
// teams that can be drafted from but can never be played against — an
// inconsistency with no sensible explanation to a player. To give a thin
// nation/era a squad, lower MIN_MATCHES so more of its real players qualify;
// never lower this.
const MIN_SQUAD = 11;
// How many players a spin actually shows.
const ROSTER_SIZE = Number(process.env.ROSTER_SIZE ?? 22);

// Rosters are picked by ROLE QUOTA, not by a single overall ranking.
//
// Ranking everyone by max(battingSkill, bowlingSkill) looked reasonable and was
// wrong: the two are percentile scores over differently-shaped distributions,
// and batting saturates at the 97 ceiling far more often. Batters therefore
// crowded out the bowlers — 32 of 73 squads came out with fewer than four
// specialist bowlers (below what the game needs to field a legal XI), and it
// pushed Bumrah, Malinga, Shaheen Afridi and Kuldeep Yadav out of their own
// national sides.
//
// Quotas mirror a real touring squad, so every spin offers a full set of
// options to draft from.
const ROSTER_QUOTAS = [
  { key: "bowler", count: 7 },
  { key: "allrounder", count: 6 },
  { key: "batter", count: 7 },
  { key: "keeper", count: 2 },
];

const BOWLER_ROLES = new Set([
  "fast-bowler",
  "swing-bowler",
  "death-bowler",
  "leg-spinner",
  "off-spinner",
  "left-arm-spinner",
]);

function rosterGroup(role) {
  if (role === "wicketkeeper-batter") return "keeper";
  if (BOWLER_ROLES.has(role)) return "bowler";
  if (role === "batting-allrounder" || role === "bowling-allrounder") return "allrounder";
  return "batter";
}

/** Ranks a player within their own group by the skill that group is picked
 * for — bowlers by bowling, batters by batting — so the two percentile scales
 * are never compared against each other. */
function groupRank(spec, group) {
  switch (group) {
    case "bowler":
      return spec.bowlingSkill;
    case "allrounder":
      return (spec.battingSkill + spec.bowlingSkill) / 2;
    default:
      return spec.battingSkill;
  }
}

/** Builds a squad to the role quotas, backfilling from whoever is left when a
 * country/era is thin in some role (a shallow pool shouldn't lose its best
 * players just because they're all batters). */
function selectRoster(all) {
  const groups = new Map(ROSTER_QUOTAS.map((q) => [q.key, []]));
  for (const s of all) groups.get(rosterGroup(s.primaryRole)).push(s);
  for (const [key, list] of groups) list.sort((a, b) => groupRank(b, key) - groupRank(a, key));

  const chosen = [];
  const taken = new Set();
  for (const { key, count } of ROSTER_QUOTAS) {
    const list = groups.get(key);
    // Established careers fill the quota first; short ones only TOP UP what is
    // left. An earlier version swapped the whole group back to the unfiltered
    // list whenever it was short, which threw away the floor entirely and let
    // a 14-match player outrank a 200-match one in his own national squad.
    const established = list.filter((s) => s.careerStats.matches >= ROSTER_MIN_MATCHES);
    const rest = list.filter((s) => s.careerStats.matches < ROSTER_MIN_MATCHES);
    const source = [...established, ...rest];
    for (const s of source.slice(0, count)) {
      chosen.push(s);
      taken.add(s.id);
    }
  }
  if (chosen.length < ROSTER_SIZE) {
    const rest = all
      .filter((s) => !taken.has(s.id))
      .sort((a, b) => b._overall - a._overall)
      .slice(0, ROSTER_SIZE - chosen.length);
    chosen.push(...rest);
  }
  // Best-to-worst overall, the order the spin reveal shows (82-0 style).
  return chosen.sort((a, b) => b._overall - a._overall);
}

// Bucket WIDTH tracks how much cricket was actually recorded, rather than
// being a uniform five years. Cricsheet's league coverage grows steadily —
// career midpoints run from ~4 players in 2007 to ~325 in 2023 — so equal-width
// eras starved the early ones: Sri Lanka ended up with a single squad, leaving
// Malinga, Jayawardene and Thisara Perera with no side to be picked from.
// Equal-POPULATION buckets were the other extreme; they'd have made "2022–2023"
// an era. Widening the early windows keeps every label a plausible cricketing
// period while giving the older eras enough players to field squads.
// Windows are FINER where the data is dense and WIDER where it's thin. Eligible
// career midpoints climb from a couple in 2008 to 140+ per year by 2023, so the
// modern era can support ~2-3 year windows (many nations field a distinct squad
// in each) while the early years stay wide enough to field a squad at all.
// Because every player lands in exactly ONE bucket by midpoint, finer windows
// just redistribute the same ~1,800 players into more squads — the heavy player
// data barely grows; only the small per-team roster lists do.
const BUCKETS = [
  { id: "2005-2012", from: 2005, to: 2012, label: "2005–2012", year: 2009 },
  { id: "2013-2016", from: 2013, to: 2016, label: "2013–2016", year: 2015 },
  { id: "2017-2019", from: 2017, to: 2019, label: "2017–2019", year: 2018 },
  { id: "2020-2021", from: 2020, to: 2021, label: "2020–2021", year: 2021 },
  { id: "2022-2023", from: 2022, to: 2023, label: "2022–2023", year: 2023 },
  { id: "2024-2026", from: 2024, to: 2026, label: "2024–2026", year: 2025 },
];

const BOWLING_STYLE_MAP = {
  "right-arm-fast": "right-arm-fast",
  "right-arm-fast-medium": "right-arm-medium",
  "left-arm-fast": "left-arm-fast",
  "left-arm-fast-medium": "left-arm-medium",
  "right-arm-offbreak": "right-arm-offspin",
  "slow-right-arm-orthodox": "right-arm-offspin",
  "slow-left-arm-orthodox": "left-arm-orthodox",
  // Wrist spin bowled left-handed. The app models spin by arm rather than by
  // wrist/finger action, so left-arm is the closest honest slot.
  "left-arm-chinaman": "left-arm-orthodox",
  legbreak: "leg-spin",
  "legbreak-googly": "leg-spin",
};

function clamp(v, lo = 0, hi = 99) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Strips everything the app never reads before the data is written into the
 * client bundle. This dataset ships to the browser, so every wasted field is
 * bytes a player downloads on a phone before they can spin.
 *
 * Three safe removals, each verified against the consumers:
 *  - `runs` inside a phase split. The engine reads only `balls` (a sample
 *    gate), `strikeRate` and `economy`; nothing in the engine or UI reads
 *    phase runs.
 *  - Phase objects with zero balls. `phaseStat()` in matchEngine already
 *    returns null for a missing split AND for one under MIN_PHASE_BALLS, so
 *    an absent object behaves identically to an empty one. 24% of phase
 *    objects are empty.
 *  - null-valued fields. Every consumer tests `!= null` or uses optional
 *    chaining, which treats undefined and null the same.
 */
function compactCareerStats(cs) {
  const compactPhases = (phases) => {
    if (!phases) return undefined;
    const out = {};
    for (const [key, split] of Object.entries(phases)) {
      if (!split?.balls) continue; // no sample — engine would ignore it anyway
      out[key] = { balls: split.balls };
      if (split.strikeRate != null) out[key].strikeRate = split.strikeRate;
      if (split.economy != null) out[key].economy = split.economy;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const out = { ...cs, battingPhases: compactPhases(cs.battingPhases), bowlingPhases: compactPhases(cs.bowlingPhases) };
  for (const key of Object.keys(out)) {
    if (out[key] == null) delete out[key];
  }
  return out;
}

function percentileValue(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor(sorted.length * q), 0, sorted.length - 1);
  return sorted[idx];
}

/** Maps `value` from [inLo, inHi] onto [outLo, outHi], clamped. Swap outLo and
 * outHi for inverted stats (economy, bowling average: lower is better). */
function normalizeRange(value, inLo, inHi, outLo, outHi) {
  if (inHi === inLo) return (outLo + outHi) / 2;
  const t = clamp((value - inLo) / (inHi - inLo), 0, 1);
  return outLo + t * (outHi - outLo);
}

function bucketFor(p) {
  const mid = Math.round((p.firstYear + p.lastYear) / 2);
  return BUCKETS.find((b) => mid >= b.from && mid <= b.to) ?? null;
}

function shortNameFor(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

function bowlingRoleFor(style) {
  switch (style) {
    case "leg-spin":
      return "leg-spinner";
    case "right-arm-offspin":
      return "off-spinner";
    case "left-arm-orthodox":
      return "left-arm-spinner";
    case "right-arm-fast":
    case "left-arm-fast":
      return "fast-bowler";
    default:
      return "swing-bowler";
  }
}

// Small samples lie. A batter who played twelve matches in a purple patch can
// post a better average and strike rate than Virat Kohli's 400-match career,
// and a naive percentile rank believes them — the first run of this generator
// left Kohli and Rohit Sharma out of India's roster in favour of players with
// a season of good luck.
//
// So every rate is regressed toward its era's mean, weighted by how much
// cricket the player actually played (empirical-Bayes shrinkage). A large
// career barely moves; a tiny one collapses toward average until it earns its
// number. These priors are "how much evidence counts as a real sample":
// roughly a full season of batting, and a season's bowling workload.
// Tuned by inspection: at 300/12 a 26-match domestic player still held the
// batting ceiling and Bumrah ranked below a journeyman quick. Doubling the
// priors barely moves a 400-match career while pulling a 26-match one most of
// the way back to its era's mean — quality self-corrects without discarding
// players, which a blunt match-count floor cannot do (raising it to 30 cut the
// squad count from 73 to 31).
const PRIOR_BALLS_FACED = Number(process.env.PRIOR_BALLS_FACED ?? 600);
const PRIOR_OUTS = Number(process.env.PRIOR_OUTS ?? 24);
const PRIOR_BALLS_BOWLED = Number(process.env.PRIOR_BALLS_BOWLED ?? 600);
const PRIOR_WICKETS = Number(process.env.PRIOR_WICKETS ?? 24);

/** Career rates regressed toward the era mean by sample size. */
function shrunkRates(p, priors) {
  const b = p.batting;
  const w = p.bowling;
  return {
    battingAverage:
      b.outs > 0 || b.runs > 0
        ? (b.runs + priors.battingAverage * PRIOR_OUTS) / ((b.outs ?? 0) + PRIOR_OUTS)
        : null,
    strikeRate:
      b.balls > 0
        ? ((b.runs + (priors.strikeRate / 100) * PRIOR_BALLS_FACED) / (b.balls + PRIOR_BALLS_FACED)) * 100
        : null,
    economy:
      w.balls > 0
        ? ((w.runs + (priors.economy / 6) * PRIOR_BALLS_BOWLED) / (w.balls + PRIOR_BALLS_BOWLED)) * 6
        : null,
    bowlingAverage:
      w.balls > 0 ? (w.runs + priors.bowlingAverage * PRIOR_WICKETS) / (w.wickets + PRIOR_WICKETS) : null,
  };
}

/** Percentile bands for one era bucket, so players are rated against their own
 * generation rather than across a 20-year scoring shift. Bands are computed on
 * the SHRUNK rates, so the ends of the scale represent sustained performance
 * rather than the luckiest short careers in the pool. */
function computeNorms(pool) {
  const batted = pool.filter((p) => p.batting.innings > 0 && p.batting.average != null);
  const bowled = pool.filter((p) => p.bowling.wickets > 0 && p.bowling.economy != null);

  // Era means, weighted by volume so they reflect the era's cricket rather
  // than the average of its cameos.
  const priors = {
    battingAverage: sum(batted, (p) => p.batting.runs) / Math.max(1, sum(batted, (p) => p.batting.outs ?? 0)),
    strikeRate: (sum(batted, (p) => p.batting.runs) / Math.max(1, sum(batted, (p) => p.batting.balls))) * 100,
    economy: (sum(bowled, (p) => p.bowling.runs) / Math.max(1, sum(bowled, (p) => p.bowling.balls))) * 6,
    bowlingAverage: sum(bowled, (p) => p.bowling.runs) / Math.max(1, sum(bowled, (p) => p.bowling.wickets)),
  };

  const sortNum = (xs) => xs.filter((x) => x != null).sort((a, b) => a - b);
  const batRates = batted.map((p) => shrunkRates(p, priors));
  const bowlRates = bowled.map((p) => shrunkRates(p, priors));

  const avgs = sortNum(batRates.map((r) => r.battingAverage));
  const srs = sortNum(batRates.map((r) => r.strikeRate));
  const econs = sortNum(bowlRates.map((r) => r.economy));
  const bowlAvgs = sortNum(bowlRates.map((r) => r.bowlingAverage));

  return {
    priors,
    // Shrinkage compresses the distribution, so the band is widened to the
    // 5th-95th percentile — otherwise the top decile all saturate at the
    // ceiling and rank in arbitrary order.
    avgLo: percentileValue(avgs, 0.05),
    avgHi: percentileValue(avgs, 0.95),
    srLo: percentileValue(srs, 0.05),
    srHi: percentileValue(srs, 0.95),
    econLo: percentileValue(econs, 0.05),
    econHi: percentileValue(econs, 0.95),
    bowlAvgLo: percentileValue(bowlAvgs, 0.05),
    bowlAvgHi: percentileValue(bowlAvgs, 0.95),
  };
}

function sum(xs, f) {
  return xs.reduce((acc, x) => acc + (f(x) ?? 0), 0);
}

function toSpec(p, norms, bucket) {
  // Rated on sample-size-regressed rates; the raw career numbers are still
  // what gets DISPLAYED on the player card, since those are the real figures.
  const r = shrunkRates(p, norms.priors);

  let battingSkill = 15;
  if (p.batting.innings > 0 && r.battingAverage != null && r.strikeRate != null) {
    const avgScore = normalizeRange(r.battingAverage, norms.avgLo, norms.avgHi, 42, 97);
    const srScore = normalizeRange(r.strikeRate, norms.srLo, norms.srHi, 42, 97);
    // T20: scoring pace matters nearly as much as not getting out.
    battingSkill = clamp(avgScore * 0.55 + srScore * 0.45, 15, 99);
  }

  let bowlingSkill = 0;
  if (p.bowling.wickets > 0 && r.economy != null && r.bowlingAverage != null) {
    // Inverted: a lower economy/average is better, so the output range is
    // reversed rather than the input.
    const econScore = normalizeRange(r.economy, norms.econLo, norms.econHi, 97, 42);
    const avgScore = normalizeRange(r.bowlingAverage, norms.bowlAvgLo, norms.bowlAvgHi, 97, 42);
    bowlingSkill = clamp(econScore * 0.5 + avgScore * 0.5, 15, 99);
  }

  const bowlingStyle = BOWLING_STYLE_MAP[p.bowlingStyle] ?? "none";
  const battingHand = p.battingStyle === "left-hand-bat" ? "left" : "right";

  // SportMonks' `position` is a squad label, not an outcome. Where the ball
  // clearly says otherwise, trust the stats — a player labelled "Batsman"
  // with 60 wickets and a bowling skill 30 points above their batting is a
  // bowler, whatever the label says.
  const dominance = bowlingSkill - battingSkill;
  const statsOverride =
    p.bowling.wickets >= 20 && dominance >= 30
      ? "specialist-bowler"
      : p.bowling.wickets >= 20 && dominance >= 10
        ? "bowling-allrounder"
        : null;

  const label = String(p.position ?? "").toLowerCase();
  const secondaryRoles = [];
  let primaryRole;

  if (label.includes("wicketkeeper")) {
    primaryRole = "wicketkeeper-batter";
  } else if (statsOverride === "specialist-bowler") {
    primaryRole = bowlingRoleFor(bowlingStyle);
  } else if (statsOverride === "bowling-allrounder") {
    primaryRole = "bowling-allrounder";
    secondaryRoles.push(bowlingRoleFor(bowlingStyle));
  } else if (label === "bowler") {
    primaryRole = bowlingRoleFor(bowlingStyle);
  } else if (label.includes("bowling allrounder")) {
    primaryRole = "bowling-allrounder";
    if (bowlingStyle !== "none") secondaryRoles.push(bowlingRoleFor(bowlingStyle));
  } else if (label.includes("batting allrounder")) {
    primaryRole = "batting-allrounder";
    if (bowlingStyle !== "none") secondaryRoles.push(bowlingRoleFor(bowlingStyle));
  } else if (label === "allrounder") {
    primaryRole = bowlingSkill > battingSkill ? "bowling-allrounder" : "batting-allrounder";
    if (bowlingStyle !== "none") secondaryRoles.push(bowlingRoleFor(bowlingStyle));
  } else if (label.includes("top order")) {
    primaryRole = "top-order";
  } else if (label.includes("middle order")) {
    primaryRole = "middle-order";
  } else {
    // Batsman with no finer label — infer from the scoring profile. This is a
    // heuristic about batting position, not a claim about the player.
    if (r.strikeRate >= 145 && r.battingAverage < 30) primaryRole = "finisher";
    else if (r.battingAverage >= 35) primaryRole = "top-order";
    else primaryRole = "middle-order";
  }

  const isKeeper = primaryRole === "wicketkeeper-batter";
  const overallProxy = isKeeper || bowlingStyle === "none" ? battingSkill : Math.max(battingSkill, bowlingSkill);
  const rarityTier =
    overallProxy >= 80 ? "legendary" : overallProxy >= 68 ? "rare" : overallProxy >= 50 ? "uncommon" : "common";

  return {
    id: `nat-${p.cricsheetId}`,
    name: p.name,
    shortName: shortNameFor(p.name),
    country: p.country,
    nationalityType: p.country === "India" ? "indian" : "overseas",
    currentTeam: `${p.country} ${bucket.label}`,
    primaryRole,
    secondaryRoles,
    battingHand,
    bowlingStyle,
    // Cricsheet has no birth date and SportMonks' is often absent, so age is
    // left at a neutral value rather than invented; nothing in the sim reads
    // it for these players.
    age: 28,
    rarityTier,
    battingSkill: Math.round(battingSkill),
    bowlingSkill: Math.round(bowlingSkill),
    fieldingSkill: 65,
    wicketkeepingSkill: isKeeper ? 78 : 0,
    tags: ["real-player", "national-era"],
    imageUrl: p.imageUrl ?? "",
    careerStats: {
      format: "T20",
      battingAverage: p.batting.innings > 0 ? p.batting.average : null,
      strikeRate: p.batting.innings > 0 ? p.batting.strikeRate : null,
      runs: p.batting.runs,
      innings: p.batting.innings,
      bowlingAverage: p.bowling.wickets > 0 ? p.bowling.average : null,
      economyRate: p.bowling.wickets > 0 ? p.bowling.economy : null,
      wickets: p.bowling.wickets,
      matches: p.matches,
      boundaryPct: p.batting.boundaryPct,
      bowlingStrikeRate: p.bowling.strikeRate,
      battingPhases: p.batting.phases,
      bowlingPhases: p.bowling.phases,
      source: "cricsheet",
    },
    _overall: overallProxy,
  };
}

async function main() {
  let unified;
  try {
    unified = JSON.parse(await readFile(UNIFIED_FILE, "utf8"));
  } catch {
    console.error(
      `No unified players file at ${path.relative(process.cwd(), UNIFIED_FILE)}.\n` +
        `Run: node scripts/sportmonks/reconcile.mjs`
    );
    process.exit(1);
  }

  // Only identified players can be grouped by nation — an unmatched player has
  // real stats but no country, so there is no squad to place them in.
  const eligible = unified.filter((p) => p.sportmonksId && p.country && p.matches >= MIN_MATCHES);

  // Assign each player to one era, then rate — so the percentile bands are
  // per-era.
  //
  // The career-midpoint rule alone ORPHANS great players: Rashid Khan's
  // midpoint lands in a window where Afghanistan has only five qualifying
  // players, so no squad forms and he appears nowhere. Malinga and
  // Jayawardene were lost the same way. So a player whose midpoint bucket
  // can't field a squad falls back to the nearest bucket that can — but only
  // one his career actually OVERLAPS, so the placement stays factually true
  // (Rashid played 2016-2026, so 2022-2026 is a period he really played in).
  // Each player still lands in exactly one bucket, keeping squads disjoint.
  const spans = (p, b) => p.firstYear <= b.to && p.lastYear >= b.from;

  const assign = new Map(); // cricsheetId -> bucket
  for (const p of eligible) {
    const b = bucketFor(p);
    if (b) assign.set(p.cricsheetId, b);
  }

  const countPer = () => {
    const counts = new Map();
    for (const p of eligible) {
      const b = assign.get(p.cricsheetId);
      if (!b) continue;
      const k = `${p.country}|${b.id}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  };

  let counts = countPer();
  let moved = 0;
  for (const p of eligible) {
    const b = assign.get(p.cricsheetId);
    if (!b || (counts.get(`${p.country}|${b.id}`) ?? 0) >= MIN_SQUAD) continue;
    const home = BUCKETS.indexOf(b);
    const fallback = BUCKETS.map((cand, i) => ({ cand, dist: Math.abs(i - home) }))
      .filter(({ cand }) => cand !== b && spans(p, cand))
      .filter(({ cand }) => (counts.get(`${p.country}|${cand.id}`) ?? 0) >= MIN_SQUAD)
      .sort((x, y) => x.dist - y.dist)[0];
    if (fallback) {
      assign.set(p.cricsheetId, fallback.cand);
      counts = countPer();
      moved++;
    }
  }

  const byBucket = new Map(BUCKETS.map((b) => [b.id, []]));
  for (const p of eligible) {
    const b = assign.get(p.cricsheetId);
    if (b) byBucket.get(b.id).push(p);
  }

  const specsById = new Map();
  const squads = [];

  for (const bucket of BUCKETS) {
    const pool = byBucket.get(bucket.id);
    if (pool.length === 0) continue;
    const norms = computeNorms(pool);

    const byCountry = new Map();
    for (const p of pool) {
      if (!byCountry.has(p.country)) byCountry.set(p.country, []);
      byCountry.get(p.country).push(toSpec(p, norms, bucket));
    }

    for (const [country, all] of byCountry) {
      if (all.length < MIN_SQUAD) continue;
      const roster = selectRoster(all);
      for (const s of roster) {
        // `_overall` is a ranking scratch field, not part of PlayerSpec.
        const clean = { ...s, careerStats: compactCareerStats(s.careerStats) };
        delete clean._overall;
        // Empty arrays and blank strings are optional in PlayerSpec and
        // default identically when absent — no reason to ship them.
        for (const key of Object.keys(clean)) {
          const v = clean[key];
          if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) delete clean[key];
        }
        specsById.set(clean.id, clean);
      }
      squads.push({
        id: `national-${country.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${bucket.id}`,
        name: country,
        eraLabel: bucket.label,
        tagline: `${country}'s leading T20 cricketers of ${bucket.label}.`,
        country,
        isHistoric: bucket.id !== "2020-2026",
        year: bucket.year,
        playerIds: roster.map((s) => s.id),
        depth: all.length,
      });
    }
  }

  const specs = [...specsById.values()];
  squads.sort((a, b) => a.name.localeCompare(b.name) || a.eraLabel.localeCompare(b.eraLabel));

  // Emitted in chunks, not as one array literal. Past ~1,500 entries a single
  // literal of objects with union-typed fields (primaryRole, bowlingStyle)
  // trips TypeScript's TS2590 "union type that is too complex to represent"
  // and `tsc --noEmit` fails, even though tests and the bundler are fine.
  // Each chunk is annotated separately, keeping every expression small enough
  // to check while the exported value is identical.
  //
  // A `JSON.parse("…")` form was tried here and REVERTED. The usual argument
  // for it is that V8 parses JSON faster than it evaluates an equivalent
  // literal, but measured on this actual dataset (1,806 players / 1.7 MB of
  // JSON) it came out at 0.98x — no gain — while escaping every quote for the
  // JS string literal made the gzipped chunk ~9 KB LARGER. Don't reintroduce
  // it without benchmarking against real data first.
  const CHUNK = 250;
  const chunks = [];
  for (let i = 0; i < specs.length; i += CHUNK) chunks.push(specs.slice(i, i + CHUNK));
  const chunkDecls = chunks
    .map((c, i) => `const SPECS_${i}: PlayerSpec[] = ${JSON.stringify(c, null, 2)};`)
    .join("\n\n");

  const specsBanner =
    `// AUTO-GENERATED by scripts/sportmonks/generate-national-teams.mjs — do not hand-edit.\n` +
    `// Stats: Cricsheet ball-by-ball (https://cricsheet.org). Identity: SportMonks.\n` +
    `// ${specs.length} players across ${squads.length} national era squads.\n` +
    `// Ratings are percentile-normalized within each era bucket, so a 2008\n` +
    `// strike rate is judged against 2008 and not against 2024.\n` +
    `import type { PlayerSpec } from "@/lib/data/playerFactory";\n\n` +
    `${chunkDecls}\n\n` +
    `export const NATIONAL_PLAYER_SPECS: PlayerSpec[] = [\n` +
    chunks.map((_, i) => `  ...SPECS_${i},`).join("\n") +
    `\n];\n`;

  const teamsBanner =
    `// AUTO-GENERATED by scripts/sportmonks/generate-national-teams.mjs — do not hand-edit.\n` +
    `// Each player belongs to exactly one era bucket (their career midpoint), so\n` +
    `// these squads are disjoint — the same cricketer can never be spun twice.\n` +
    `// \`depth\` is how many players that country/era had before the roster cap.\n\n` +
    `export interface NationalEraTeamSpec {\n` +
    `  id: string;\n  name: string;\n  eraLabel: string;\n  tagline: string;\n` +
    `  country: string;\n  isHistoric: boolean;\n  year: number;\n` +
    `  playerIds: string[];\n  depth: number;\n}\n\n` +
    `export const NATIONAL_ERA_TEAM_SPECS: NationalEraTeamSpec[] = ${JSON.stringify(squads, null, 2)};\n`;

  await writeFile(SPECS_OUT, specsBanner);
  await writeFile(TEAMS_OUT, teamsBanner);

  const perBucket = {};
  for (const s of squads) perBucket[s.eraLabel] = (perBucket[s.eraLabel] ?? 0) + 1;

  console.log(`Eligible (identified, >=${MIN_MATCHES} matches): ${eligible.length}`);
  console.log(`Rehomed from an era too thin to field a squad: ${moved}`);
  console.log(`Squads (>=${MIN_SQUAD} players): ${squads.length}`);
  for (const [label, n] of Object.entries(perBucket)) console.log(`  ${label}: ${n} squads`);
  console.log(`Players in rosters: ${specs.length}`);
  console.log(`Wrote ${path.relative(process.cwd(), SPECS_OUT)}`);
  console.log(`Wrote ${path.relative(process.cwd(), TEAMS_OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
