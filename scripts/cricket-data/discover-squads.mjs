// Discovers current, real squads across the world's major T20 leagues by reading
// each league's most recent series and pulling match_squad for a handful of
// matches (enough to see every team). This is far more accurate than a
// hand-typed name list — the API's own squad data can't misidentify a
// player the way a name search can (e.g. two unrelated people sharing a
// common name), and it surfaces the full contracted roster, not just the
// stars a person happens to remember.
//
// Run with: node --env-file=.env.local scripts/cricket-data/discover-squads.mjs
//
// Output: scripts/cricket-data/discovered-players.json — a deduped list of
// {id, name, role, battingStyle, bowlingStyle, country, playerImg, leagues}
// for every player found. This does NOT fetch stats (that's fetch-by-id.mjs);
// it only builds the roster list, using far fewer requests.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "discovered-players.json");
const API_KEY = process.env.CRICKETDATA_API_KEY;
const BASE = "https://api.cricapi.com/v1";
const HITS_BUDGET = 1900;

if (!API_KEY) {
  console.error("CRICKETDATA_API_KEY is not set. Run with: node --env-file=.env.local scripts/cricket-data/discover-squads.mjs");
  process.exit(1);
}

const LEAGUES = [
  { key: "ipl", searchTerm: "Indian Premier League", expectedTeams: 10, namePattern: /Indian Premier League/i },
  { key: "bbl", searchTerm: "Big Bash League", expectedTeams: 8, namePattern: /Big Bash League/i },
  { key: "psl", searchTerm: "Pakistan Super League", expectedTeams: 6, namePattern: /Pakistan Super League/i },
  { key: "cpl", searchTerm: "Caribbean Premier League", expectedTeams: 6, namePattern: /Caribbean Premier League/i },
  { key: "hundred", searchTerm: "The Hundred Men", expectedTeams: 8, namePattern: /The Hundred/i },
  // "SA20" alone is too short/generic for the API's fuzzy series search — it
  // was matching unrelated exhibition series with a later startDate. Anchor
  // to the start of the name so only the real competition matches.
  { key: "sa20", searchTerm: "SA20", expectedTeams: 6, namePattern: /^SA20\b/i },
  { key: "ilt20", searchTerm: "International League T20", expectedTeams: 6, namePattern: /International League T20/i },
  { key: "bpl", searchTerm: "Bangladesh Premier League", expectedTeams: 8, namePattern: /Bangladesh Premier League/i },
  { key: "lpl", searchTerm: "Lanka Premier League", expectedTeams: 5, namePattern: /Lanka Premier League/i },
  { key: "mlc", searchTerm: "Major League Cricket", expectedTeams: 6, namePattern: /Major League Cricket/i },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

let hitsToday = 0;

async function apiCall(url) {
  if (hitsToday >= HITS_BUDGET) throw new Error("budget-exceeded");
  const res = await fetchJson(url);
  hitsToday = res.info?.hitsToday ?? hitsToday;
  await sleep(200);
  return res;
}

/**
 * Picks the most recent men's series whose name contains the search term
 * and has actual squads. The API's series search is fuzzy, not a strict
 * substring match — a short search term like "SA20" can rank an unrelated
 * series above the real competition once results are sorted by date, so
 * namePattern is required and re-checked here rather than trusting the
 * search ranking alone. The API's search also happily matches the women's
 * equivalent competition too (e.g. "Big Bash League" also matches "Womens
 * Big Bash League"), so that's excluded explicitly as well.
 */
async function findLatestSeries(searchTerm, namePattern) {
  const res = await apiCall(`${BASE}/series?apikey=${API_KEY}&offset=0&search=${encodeURIComponent(searchTerm)}`);
  if (res.status !== "success" || !res.data?.length) return null;
  const withSquads = res.data.filter(
    (s) => s.squads > 0 && s.matches > 0 && !/women/i.test(s.name) && namePattern.test(s.name)
  );
  if (withSquads.length === 0) return null;
  // Series are typically returned newest-first; sort defensively by startDate string descending.
  withSquads.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  return withSquads[0];
}

/** Greedily selects matches until every team in the series has appeared at least once. */
async function collectSquadsForSeries(seriesId, expectedTeams) {
  const res = await apiCall(`${BASE}/series_info?apikey=${API_KEY}&id=${seriesId}`);
  if (res.status !== "success") return [];
  const matchList = res.data?.matchList ?? [];
  const seenTeams = new Set();
  const players = new Map();

  for (const match of matchList) {
    if (seenTeams.size >= expectedTeams) break;
    if (!match.hasSquad) continue;
    const newTeams = (match.teams ?? []).filter((t) => !seenTeams.has(t));
    if (newTeams.length === 0) continue;

    const squadRes = await apiCall(`${BASE}/match_squad?apikey=${API_KEY}&id=${match.id}`);
    if (squadRes.status !== "success") continue;

    for (const teamSquad of squadRes.data ?? []) {
      seenTeams.add(teamSquad.teamName);
      for (const p of teamSquad.players ?? []) {
        if (!players.has(p.id)) {
          players.set(p.id, {
            id: p.id,
            name: p.name,
            role: p.role,
            battingStyle: p.battingStyle,
            bowlingStyle: p.bowlingStyle,
            country: p.country,
            playerImg: p.playerImg,
          });
        }
      }
    }
  }

  return [...players.values()];
}

async function main() {
  const allPlayers = new Map();
  const existing = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : [];
  existing.forEach((p) => allPlayers.set(p.id, p));

  for (const league of LEAGUES) {
    try {
      const series = await findLatestSeries(league.searchTerm, league.namePattern);
      if (!series) {
        console.warn(`[skip] ${league.key}: no series with squads found for "${league.searchTerm}"`);
        continue;
      }
      console.log(`[series] ${league.key}: "${series.name}" (${series.squads} squads, ${series.matches} matches)`);

      const players = await collectSquadsForSeries(series.id, league.expectedTeams);
      console.log(`[squads] ${league.key}: found ${players.length} unique players (hitsToday=${hitsToday})`);

      for (const p of players) {
        const existingEntry = allPlayers.get(p.id);
        if (existingEntry) {
          if (!existingEntry.leagues.includes(league.key)) existingEntry.leagues.push(league.key);
        } else {
          allPlayers.set(p.id, { ...p, leagues: [league.key] });
        }
      }
    } catch (err) {
      if (err.message === "budget-exceeded") {
        console.warn(`[budget] stopping — hitsToday=${hitsToday} >= ${HITS_BUDGET}`);
        break;
      }
      console.error(`[error] ${league.key}: ${err.message}`);
    }
  }

  const result = [...allPlayers.values()];
  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(`\nDone. Total unique players discovered: ${result.length} (hitsToday=${hitsToday})`);
  console.log(`Written to ${OUT_PATH}`);
}

main();
