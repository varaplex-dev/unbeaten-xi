// Discovers real franchise rosters for specific PAST seasons of IPL/BBL/PSL
// (not just "whatever the current squad is", which discover-squads.mjs
// already covers). CricketData.org's current tier only exposes roughly the
// last 4-6 seasons of each league's series list — there is no way to reach
// further back (e.g. IPL 2010) from this API; confirmed by querying with
// totalRows counts before building this script. So this covers "franchise
// history within the last few completed seasons", not full league history.
//
// Unlike discover-squads.mjs (which stops once every team's squad has been
// SEEN once), this fetches match_squad for EVERY match in a season and
// counts how many of a team's matches each player actually appeared in,
// keeping only players who cleared a real appearance threshold — a fringe
// player who played 2 of 14 games shouldn't be listed alongside the
// season's actual first-choice XI.
//
// Run with: node --env-file=.env.local scripts/cricket-data/discover-season-squads.mjs
//
// Output: scripts/cricket-data/discovered-season-squads.json — an array of
// { league, season, teamName, teamMatches, players: [{id,name,role,...,appearances}] }

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "discovered-season-squads.json");
const API_KEY = process.env.CRICKETDATA_API_KEY;
const BASE = "https://api.cricapi.com/v1";
const HITS_BUDGET = 1900;
const APPEARANCE_THRESHOLD = 0.5;

if (!API_KEY) {
  console.error("CRICKETDATA_API_KEY is not set. Run with: node --env-file=.env.local scripts/cricket-data/discover-season-squads.mjs");
  process.exit(1);
}

const LEAGUES = [
  { key: "ipl", searchTerm: "Indian Premier League", namePattern: /Indian Premier League/i },
  { key: "bbl", searchTerm: "Big Bash League", namePattern: /Big Bash League/i },
  { key: "psl", searchTerm: "Pakistan Super League", namePattern: /Pakistan Super League/i },
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
  await sleep(180);
  return res;
}

/** Every season series this API currently exposes for a league (not just
 * the newest one) — same namePattern safety net as discover-squads.mjs,
 * since the API's series search is fuzzy and can otherwise rank an
 * unrelated series above the real competition. */
async function findAllSeasons(searchTerm, namePattern) {
  const res = await apiCall(`${BASE}/series?apikey=${API_KEY}&offset=0&search=${encodeURIComponent(searchTerm)}`);
  if (res.status !== "success" || !res.data?.length) return [];
  return res.data.filter(
    (s) => s.squads > 0 && s.matches > 0 && !/women/i.test(s.name) && namePattern.test(s.name)
  );
}

/** Fetches every match's squad in a season and tallies, per team, how many
 * of that team's matches each player actually appeared in. */
async function tallySeasonAppearances(seriesId) {
  const res = await apiCall(`${BASE}/series_info?apikey=${API_KEY}&id=${seriesId}`);
  if (res.status !== "success") return [];
  const matchList = (res.data?.matchList ?? []).filter((m) => m.hasSquad);

  // teamName -> { matches: number, players: Map<id, {info, count}> }
  const teams = new Map();

  for (const match of matchList) {
    let squadRes;
    try {
      squadRes = await apiCall(`${BASE}/match_squad?apikey=${API_KEY}&id=${match.id}`);
    } catch (err) {
      if (err.message === "budget-exceeded") throw err;
      console.warn(`[skip match] ${match.id}: ${err.message}`);
      continue;
    }
    if (squadRes.status !== "success") continue;

    for (const teamSquad of squadRes.data ?? []) {
      const teamName = teamSquad.teamName;
      if (!teams.has(teamName)) teams.set(teamName, { matches: 0, players: new Map() });
      const team = teams.get(teamName);
      team.matches += 1;
      for (const p of teamSquad.players ?? []) {
        const existing = team.players.get(p.id);
        if (existing) {
          existing.count += 1;
        } else {
          team.players.set(p.id, {
            info: {
              id: p.id,
              name: p.name,
              role: p.role,
              battingStyle: p.battingStyle,
              bowlingStyle: p.bowlingStyle,
              country: p.country,
              playerImg: p.playerImg,
            },
            count: 1,
          });
        }
      }
    }
  }

  const results = [];
  for (const [teamName, team] of teams.entries()) {
    if (team.matches === 0) continue;
    const players = [...team.players.values()]
      .filter((p) => p.count / team.matches >= APPEARANCE_THRESHOLD)
      .map((p) => ({ ...p.info, appearances: p.count }));
    results.push({ teamName, teamMatches: team.matches, players });
  }
  return results;
}

async function main() {
  const existing = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : [];
  const existingKeys = new Set(existing.map((e) => `${e.league}::${e.season}::${e.teamName}`));
  const allResults = [...existing];

  for (const league of LEAGUES) {
    let seasons;
    try {
      seasons = await findAllSeasons(league.searchTerm, league.namePattern);
    } catch (err) {
      if (err.message === "budget-exceeded") {
        console.warn(`[budget] stopping before ${league.key} — hitsToday=${hitsToday}`);
        break;
      }
      console.error(`[error] ${league.key} series search: ${err.message}`);
      continue;
    }
    console.log(`[${league.key}] found ${seasons.length} qualifying season(s): ${seasons.map((s) => s.name).join(", ")}`);

    for (const season of seasons) {
      const seasonLabel = season.name.replace(/\s*\(IPL\)\s*/i, "").trim();
      try {
        const teams = await tallySeasonAppearances(season.id);
        for (const team of teams) {
          const key = `${league.key}::${seasonLabel}::${team.teamName}`;
          if (existingKeys.has(key)) continue;
          existingKeys.add(key);
          allResults.push({
            league: league.key,
            season: seasonLabel,
            teamName: team.teamName,
            teamMatches: team.teamMatches,
            players: team.players,
          });
          console.log(
            `[${league.key}] ${seasonLabel} — ${team.teamName}: ${team.players.length} players >= ${APPEARANCE_THRESHOLD * 100}% of ${team.teamMatches} matches (hitsToday=${hitsToday})`
          );
        }
      } catch (err) {
        if (err.message === "budget-exceeded") {
          console.warn(`[budget] stopping mid-season — hitsToday=${hitsToday}`);
          writeFileSync(OUT_PATH, JSON.stringify(allResults, null, 2));
          console.log(`Partial results written to ${OUT_PATH}`);
          return;
        }
        console.error(`[error] ${league.key} ${seasonLabel}: ${err.message}`);
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(allResults, null, 2));
  console.log(`\nDone. ${allResults.length} team-seasons written to ${OUT_PATH} (hitsToday=${hitsToday})`);
}

main();
