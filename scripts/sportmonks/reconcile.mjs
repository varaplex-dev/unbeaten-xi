// Joins the two data sources into one player database:
//   Cricsheet  → real ball-by-ball STATS (phase splits, economy, wickets)
//   SportMonks → IDENTITY + METADATA (country, batting hand, bowling style,
//                full name, photo)
//
// Cricsheet names players "V Kohli"; SportMonks stores firstname/lastname
// separately, so the join is a clean surname + first-initial match rather than
// a fuzzy string guess. Ambiguous pairs (two real players sharing a surname
// and initial) are reported and skipped — a wrong country or bowling style
// would quietly corrupt team building and the simulation.
//
// Run:  node scripts/sportmonks/reconcile.mjs
// In:   scripts/cricsheet/cricsheet-players.json, scripts/sportmonks/players.json
// Out:  scripts/sportmonks/unified-players.json

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CRICSHEET_FILE = path.join(REPO, "scripts", "cricsheet", "cricsheet-players.json");
const SPORTMONKS_FILE = process.env.SPORTMONKS_PLAYERS ?? path.join(HERE, "players.json");
const OVERRIDES_FILE = path.join(HERE, "identity-overrides.json");
// A fixture run is a test, not a build — it must not overwrite the real
// unified output the app pipeline depends on.
const OUT_FILE = path.join(
  HERE,
  process.env.SPORTMONKS_PLAYERS ? "unified-players.fixture.json" : "unified-players.json"
);

function normalize(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "V Kohli" / "Virat Kohli" -> { surname, initial, full }. */
function nameKey(name) {
  const tokens = normalize(name).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  return {
    surname: tokens[tokens.length - 1],
    initial: tokens[0][0],
    full: tokens.join(" "),
  };
}

/** SportMonks gives structured names, so build the key from those directly. */
function sportmonksKey(p) {
  const surname = normalize(p.lastname || p.fullname).split(" ").filter(Boolean).pop();
  const firstSource = normalize(p.firstname || p.fullname);
  const initial = firstSource ? firstSource[0] : null;
  if (!surname || !initial) return null;
  return { surname, initial, full: normalize(p.fullname || `${p.firstname} ${p.lastname}`) };
}

function pushKey(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

async function main() {
  const cricsheet = JSON.parse(await readFile(CRICSHEET_FILE, "utf8"));
  let sportmonks;
  try {
    sportmonks = JSON.parse(await readFile(SPORTMONKS_FILE, "utf8"));
  } catch {
    console.error(
      `No SportMonks players file at ${path.relative(process.cwd(), SPORTMONKS_FILE)}.\n` +
        `Run: node --env-file=.env.local scripts/sportmonks/fetch-players.mjs`
    );
    process.exit(1);
  }

  // Fixture runs exercise the automatic passes against a tiny directory, where
  // the real overrides' SportMonks ids don't exist — so they only apply to a
  // real run.
  const overrides = process.env.SPORTMONKS_PLAYERS
    ? []
    : JSON.parse(await readFile(OVERRIDES_FILE, "utf8")).overrides;

  // The Cricsheet side is aggregated men's-only (see cricsheet/aggregate.mjs),
  // so women in the SportMonks directory can never be a correct match — they
  // can only add false candidates and push real players into "ambiguous".
  // Dropping them is a correctness fix, not a heuristic.
  const directory =
    process.env.INCLUDE_WOMENS === "1"
      ? sportmonks
      : sportmonks.filter((p) => p.gender !== "f");
  const womenDropped = sportmonks.length - directory.length;

  // Index SportMonks by surname+initial and by full name.
  const bySurnameInitial = new Map();
  const byFullName = new Map();
  const countryNames = new Set();
  for (const p of directory) {
    if (p.country) countryNames.add(normalize(p.country));
    const key = sportmonksKey(p);
    if (!key) continue;
    pushKey(bySurnameInitial, `${key.surname}|${key.initial}`, p);
    pushKey(byFullName, key.full, p);
  }

  // Cricsheet records every team a player turned out for, national sides
  // included ("India", "West Indies"). When a name is ambiguous, that national
  // side is real evidence: AD Russell played for West Indies, so the Andre
  // Russell in the directory is a different person from the Alex Russell who
  // never did. Only used when it resolves to exactly ONE candidate.
  function countryTieBreak(c, cands) {
    const nations = (c.teams ?? []).map(normalize).filter((t) => countryNames.has(t));
    if (nations.length === 0) return null;
    const hits = cands.filter((p) => nations.includes(normalize(p.country)));
    return hits.length === 1 ? hits[0] : null;
  }

  // The join must be strictly ONE-TO-ONE. Cricket is full of shared surnames
  // (Khan, Singh, Ali), so a surname+initial key like "khan|r" can cover
  // several genuinely different players — assigning one real identity to all
  // of them would hand three strangers Rashid Khan's country and bowling
  // style, and create duplicate people in the draft pool.
  const assignment = new Map(); // cricsheetId -> SportMonks player
  const claimed = new Set(); // SportMonks ids already spoken for
  let exact = 0;
  let initialMatch = 0;
  let countryMatch = 0;
  let ambiguous = 0;

  // Pass 0 — hand-verified identity assertions. Cricket's biggest names are
  // exactly the ones the automatic passes abstain on, because famous surnames
  // (Sharma, Khan, Singh, Afridi) are the crowded ones. Each override in
  // identity-overrides.json was checked individually against initials, country,
  // franchise history, career span and statistical profile. They claim an
  // identity first, and are still bound by the one-to-one rule.
  const cricsheetById = new Map(cricsheet.map((c) => [c.id, c]));
  const directoryById = new Map(directory.map((p) => [p.id, p]));
  for (const o of overrides) {
    const c = cricsheetById.get(o.cricsheetId);
    const m = directoryById.get(o.sportmonksId);
    // A stale override is a silent data bug — a marquee player quietly falls
    // back to unidentified. Fail the run instead.
    if (!c) throw new Error(`Override references unknown Cricsheet id "${o.cricsheetId}" (${o.cricsheetName})`);
    if (!m) throw new Error(`Override references unknown SportMonks id ${o.sportmonksId} (${o.sportmonksName})`);
    if (claimed.has(m.id)) {
      throw new Error(`Two overrides claim SportMonks id ${m.id} (${o.sportmonksName}) — the join must stay one-to-one`);
    }
    assignment.set(c.id, m);
    claimed.add(m.id);
  }
  const overrideMatch = overrides.length;

  // Pass 1 — exact full-name matches. These are trustworthy, so they get
  // first claim on an identity.
  for (const c of cricsheet) {
    if (assignment.has(c.id)) continue; // already fixed by an override
    const key = nameKey(c.name);
    if (!key) continue;
    const cands = byFullName.get(key.full);
    if (cands && cands.length === 1 && !claimed.has(cands[0].id)) {
      assignment.set(c.id, cands[0]);
      claimed.add(cands[0].id);
      exact++;
    }
  }

  // Pass 2 — surname + initial, accepted only when it is unambiguous on BOTH
  // sides: exactly one unmatched Cricsheet player for that key, and exactly
  // one still-unclaimed SportMonks player.
  const groups = new Map();
  for (const c of cricsheet) {
    if (assignment.has(c.id)) continue;
    const key = nameKey(c.name);
    if (!key) continue;
    pushKey(groups, `${key.surname}|${key.initial}`, c);
  }
  for (const [key, group] of groups) {
    const cands = (bySurnameInitial.get(key) ?? []).filter((p) => !claimed.has(p.id));
    if (cands.length === 0) continue; // simply not in the SportMonks directory
    if (group.length === 1 && cands.length === 1) {
      assignment.set(group[0].id, cands[0]);
      claimed.add(cands[0].id);
      initialMatch++;
      continue;
    }
    // One Cricsheet player, several same-shaped identities: their national
    // side can still single one out. Never applied when the Cricsheet side is
    // ambiguous too — then we genuinely don't know who is who.
    if (group.length === 1) {
      const resolved = countryTieBreak(group[0], cands);
      if (resolved) {
        assignment.set(group[0].id, resolved);
        claimed.add(resolved.id);
        countryMatch++;
        continue;
      }
    }
    // Several people share this name shape — don't guess which is which.
    ambiguous += group.length;
  }

  const unified = cricsheet.map((c) => {
    const m = assignment.get(c.id);
    if (!m) {
      // Keep the player: the stats are real and usable, they just have no
      // confirmed identity yet.
      return { ...toRecord(c), sportmonksId: null, metadataSource: null };
    }
    return {
      ...toRecord(c),
      name: m.fullname || c.name,
      sportmonksId: m.id,
      country: m.country,
      battingStyle: m.battingStyle,
      bowlingStyle: m.bowlingStyle,
      position: m.position,
      imageUrl: m.imageUrl,
      dateOfBirth: m.dateOfBirth,
      metadataSource: "sportmonks",
    };
  });
  const unmatched = unified.length - assignment.size - ambiguous;

  await writeFile(OUT_FILE, JSON.stringify(unified, null, 2));

  const matched = overrideMatch + exact + initialMatch + countryMatch;
  const withCountry = unified.filter((p) => p.country).length;
  console.log(`Cricsheet players : ${cricsheet.length}`);
  console.log(`SportMonks players: ${sportmonks.length} (${womenDropped} women's entries excluded)`);
  console.log(
    `Matched           : ${matched} (${overrideMatch} verified overrides, ${exact} exact, ` +
      `${initialMatch} surname+initial, ${countryMatch} via national side)`
  );
  console.log(`Ambiguous (skipped): ${ambiguous}`);
  console.log(`Unmatched          : ${unmatched}`);
  console.log(`With country       : ${withCountry}  <- spinnable into national teams`);
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
}

function toRecord(c) {
  return {
    cricsheetId: c.id,
    name: c.name,
    teams: c.teams,
    matches: c.matches,
    firstYear: c.firstYear,
    lastYear: c.lastYear,
    country: null,
    battingStyle: null,
    bowlingStyle: null,
    position: null,
    imageUrl: null,
    dateOfBirth: null,
    batting: c.batting,
    bowling: c.bowling,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
