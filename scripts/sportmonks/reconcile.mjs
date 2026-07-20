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
const OUT_FILE = path.join(HERE, "unified-players.json");

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

  // Index SportMonks by surname+initial and by full name.
  const bySurnameInitial = new Map();
  const byFullName = new Map();
  for (const p of sportmonks) {
    const key = sportmonksKey(p);
    if (!key) continue;
    pushKey(bySurnameInitial, `${key.surname}|${key.initial}`, p);
    pushKey(byFullName, key.full, p);
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
  let ambiguous = 0;

  // Pass 1 — exact full-name matches. These are trustworthy, so they get
  // first claim on an identity.
  for (const c of cricsheet) {
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
    } else {
      // Several people share this name shape — don't guess which is which.
      ambiguous += group.length;
    }
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

  const matched = exact + initialMatch;
  const withCountry = unified.filter((p) => p.country).length;
  console.log(`Cricsheet players : ${cricsheet.length}`);
  console.log(`SportMonks players: ${sportmonks.length}`);
  console.log(`Matched           : ${matched} (${exact} exact, ${initialMatch} surname+initial)`);
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
