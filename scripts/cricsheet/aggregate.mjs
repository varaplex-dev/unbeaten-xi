// Cricsheet aggregator — turns ball-by-ball match JSON into per-player career
// stats with phase splits, the rich substrate the season simulation reads.
//
// Cricsheet (https://cricsheet.org) publishes one JSON file per match, with a
// `registry` mapping every player name to a stable Cricsheet id — so we key
// aggregation by that id and never guess at identity. This script reads every
// T20-family match under ./data and writes cricsheet-players.json.
//
// Run:  node scripts/cricsheet/aggregate.mjs
// (Download + extract match archives into ./data first — see README.md.)

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Where the extracted Cricsheet match JSON lives. Override with
// CRICSHEET_DATA to point at the bundled fixture for a quick self-test.
const DATA_DIR = process.env.CRICSHEET_DATA
  ? path.resolve(process.env.CRICSHEET_DATA)
  : path.join(HERE, "data");
const OUT_FILE = path.join(HERE, "cricsheet-players.json");

// The game is T20; aggregate only the T20 family so averages/economies are
// on one comparable scale. (ODI/Test could be aggregated separately later.)
const T20_MATCH_TYPES = new Set(["T20", "IT20"]);

// Wicket kinds credited to the bowler (run-outs, retirements, etc. are not).
const BOWLER_WICKET_KINDS = new Set([
  "bowled",
  "caught",
  "lbw",
  "stumped",
  "caught and bowled",
  "hit wicket",
]);

/** T20 phase from the 0-indexed over number. */
function phaseOfOver(over) {
  if (over < 6) return "powerplay";
  if (over < 15) return "middle";
  return "death";
}

function emptyPhase() {
  return { runs: 0, balls: 0, outs: 0, wickets: 0 };
}

function newPlayer(id) {
  return {
    id,
    names: new Set(),
    teams: new Set(),
    matches: 0,
    firstYear: null,
    lastYear: null,
    bat: {
      innings: 0,
      runs: 0,
      balls: 0,
      outs: 0,
      fours: 0,
      sixes: 0,
      phases: { powerplay: emptyPhase(), middle: emptyPhase(), death: emptyPhase() },
    },
    bowl: {
      innings: 0,
      balls: 0,
      runs: 0,
      wickets: 0,
      phases: { powerplay: emptyPhase(), middle: emptyPhase(), death: emptyPhase() },
    },
  };
}

/** Recursively collect every *.json match file under a directory. */
async function findMatchFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findMatchFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "cricsheet-players.json") {
      out.push(full);
    }
  }
  return out;
}

function yearFromMatch(info) {
  const date = info?.dates?.[0] ?? info?.season;
  const m = String(date ?? "").match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function main() {
  return run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

async function run() {
  const files = await findMatchFiles(DATA_DIR);
  if (files.length === 0) {
    console.error(
      `No match files found under ${DATA_DIR}.\n` +
        `Download + extract Cricsheet archives there first (see scripts/cricsheet/README.md).`
    );
    process.exit(1);
  }

  const players = new Map();
  const get = (id) => {
    let p = players.get(id);
    if (!p) {
      p = newPlayer(id);
      players.set(id, p);
    }
    return p;
  };

  let matchesUsed = 0;
  let skipped = 0;

  for (const file of files) {
    let match;
    try {
      match = JSON.parse(await readFile(file, "utf8"));
    } catch {
      skipped++;
      continue;
    }
    const info = match?.info;
    if (!info || !Array.isArray(match.innings)) {
      skipped++;
      continue;
    }
    if (!T20_MATCH_TYPES.has(info.match_type)) continue;
    // Men's only by default (set INCLUDE_WOMENS=1 to include women's cricket).
    if (process.env.INCLUDE_WOMENS !== "1" && info.gender && info.gender !== "male") continue;

    const registry = info.registry?.people ?? {};
    const idOf = (name) => registry[name] ?? `name:${name}`;
    const year = yearFromMatch(info);

    // Match appearance + team + era, from the named XI(s).
    for (const [team, roster] of Object.entries(info.players ?? {})) {
      for (const name of roster) {
        const p = get(idOf(name));
        p.names.add(name);
        p.teams.add(team);
        p.matches++;
        if (year) {
          p.firstYear = p.firstYear === null ? year : Math.min(p.firstYear, year);
          p.lastYear = p.lastYear === null ? year : Math.max(p.lastYear, year);
        }
      }
    }
    matchesUsed++;

    for (const inn of match.innings) {
      const battedThisInnings = new Set();
      const bowledThisInnings = new Set();

      for (const overObj of inn.overs ?? []) {
        const phase = phaseOfOver(overObj.over ?? 0);
        for (const d of overObj.deliveries ?? []) {
          const runsBat = d.runs?.batter ?? 0;
          const wides = d.extras?.wides ?? 0;
          const noballs = d.extras?.noballs ?? 0;
          const isWide = wides > 0;
          const isNoball = noballs > 0;

          // --- batting (striker) ---
          const bat = get(idOf(d.batter));
          battedThisInnings.add(bat.id);
          bat.bat.runs += runsBat;
          bat.bat.phases[phase].runs += runsBat;
          if (!isWide) {
            // A wide isn't a ball faced; everything else (incl. no-ball,
            // byes, leg-byes) is a ball the striker faced.
            bat.bat.balls++;
            bat.bat.phases[phase].balls++;
          }
          if (runsBat === 4) bat.bat.fours++;
          else if (runsBat === 6) bat.bat.sixes++;

          // --- bowling ---
          const bowl = get(idOf(d.bowler));
          bowledThisInnings.add(bowl.id);
          const legal = !isWide && !isNoball;
          if (legal) {
            bowl.bowl.balls++;
            bowl.bowl.phases[phase].balls++;
          }
          // Charged to the bowler: runs off the bat + wides + no-balls. Byes
          // and leg-byes are conceded by the team, not the bowler.
          const charged = runsBat + wides + noballs;
          bowl.bowl.runs += charged;
          bowl.bowl.phases[phase].runs += charged;

          // --- wickets ---
          for (const w of d.wickets ?? []) {
            // Dismissal counts toward the dismissed batter's outs (for their
            // average) — even a run-out, which still ends their innings.
            const outId = idOf(w.player_out ?? d.batter);
            const outP = get(outId);
            outP.bat.outs++;
            outP.bat.phases[phase].outs++;
            // Wicket credited to the bowler only for bowling dismissals.
            if (BOWLER_WICKET_KINDS.has(w.kind)) {
              bowl.bowl.wickets++;
              bowl.bowl.phases[phase].wickets++;
            }
          }
        }
      }

      for (const id of battedThisInnings) get(id).bat.innings++;
      for (const id of bowledThisInnings) get(id).bowl.innings++;
    }
  }

  // Keep players with a meaningful sample so the pool isn't full of one-cap
  // curiosities; override with MIN_MATCHES=1 to inspect everything.
  const minMatches = Number(process.env.MIN_MATCHES ?? 3);
  const result = [...players.values()]
    .map(finalizePlayer)
    .filter((p) => p.matches >= minMatches)
    .sort((a, b) => b.matches - a.matches);

  await writeFile(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(
    `Aggregated ${result.length} players from ${matchesUsed} T20-family matches ` +
      `(${files.length} files scanned, ${skipped} unreadable/skipped).`
  );
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
}

function ratio(num, den) {
  return den > 0 ? num / den : null;
}

function round(n, dp = 2) {
  return n === null || n === undefined ? null : Math.round(n * 10 ** dp) / 10 ** dp;
}

function phaseStats(p) {
  const out = {};
  for (const phase of ["powerplay", "middle", "death"]) {
    const ph = p[phase];
    out[phase] = {
      runs: ph.runs,
      balls: ph.balls,
      strikeRate: round(ratio(ph.runs, ph.balls) === null ? null : ratio(ph.runs, ph.balls) * 100),
      economy: round(ratio(ph.runs, ph.balls) === null ? null : ratio(ph.runs, ph.balls) * 6),
    };
  }
  return out;
}

function finalizePlayer(p) {
  const bat = p.bat;
  const bowl = p.bowl;
  const batBoundaries = bat.fours + bat.sixes;
  return {
    id: p.id,
    name: [...p.names][0] ?? p.id,
    aliases: [...p.names],
    teams: [...p.teams],
    matches: p.matches,
    firstYear: p.firstYear,
    lastYear: p.lastYear,
    batting: {
      innings: bat.innings,
      runs: bat.runs,
      balls: bat.balls,
      outs: bat.outs,
      average: round(ratio(bat.runs, bat.outs)),
      strikeRate: round(ratio(bat.runs, bat.balls) === null ? null : ratio(bat.runs, bat.balls) * 100),
      boundaryPct: round(ratio(batBoundaries, bat.balls) === null ? null : ratio(batBoundaries, bat.balls) * 100),
      fours: bat.fours,
      sixes: bat.sixes,
      phases: phaseStats(bat.phases),
    },
    bowling: {
      innings: bowl.innings,
      balls: bowl.balls,
      runs: bowl.runs,
      wickets: bowl.wickets,
      average: round(ratio(bowl.runs, bowl.wickets)),
      economy: round(ratio(bowl.runs, bowl.balls) === null ? null : ratio(bowl.runs, bowl.balls) * 6),
      strikeRate: round(ratio(bowl.balls, bowl.wickets)),
      phases: phaseStats(bowl.phases),
    },
  };
}

main();
