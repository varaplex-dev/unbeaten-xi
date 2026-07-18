// Fetches players_info for every player in discovered-players.json, caching
// each to scripts/cricket-data/cache/. Since IDs come straight from official
// squad listings (discover-squads.mjs), there's no name-collision risk here
// — unlike the name-search path (fetch.mjs), we already know exactly who
// each ID refers to. This script's only job is dedup + stats.
//
// Run with: node --env-file=.env.local scripts/cricket-data/fetch-by-id.mjs

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "cache");
const DISCOVERED_PATH = path.join(__dirname, "discovered-players.json");
const API_KEY = process.env.CRICKETDATA_API_KEY;
const BASE = "https://api.cricapi.com/v1";
const HITS_BUDGET = 1900;

if (!API_KEY) {
  console.error("CRICKETDATA_API_KEY is not set. Run with: node --env-file=.env.local scripts/cricket-data/fetch-by-id.mjs");
  process.exit(1);
}

mkdirSync(CACHE_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Every player already cached under ANY filename, keyed by their real id —
 * both the old name-search cache and this script's id-based cache write into
 * the same directory, so this is how we avoid double-fetching (and later,
 * double-counting) someone who's in both the curated legend list and a
 * current squad, like most contemporary stars. */
function loadCachedIds() {
  const ids = new Set();
  for (const file of readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"))) {
    try {
      const data = JSON.parse(readFileSync(path.join(CACHE_DIR, file), "utf8"));
      if (data.id) ids.add(data.id);
    } catch {
      // skip unreadable/partial files
    }
  }
  return ids;
}

async function main() {
  const discovered = JSON.parse(readFileSync(DISCOVERED_PATH, "utf8"));
  const cachedIds = loadCachedIds();
  let hitsToday = 0;
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const player of discovered) {
    if (cachedIds.has(player.id)) {
      skipped++;
      continue;
    }
    if (hitsToday >= HITS_BUDGET) {
      console.log(`[budget] stopping — hitsToday=${hitsToday} >= ${HITS_BUDGET}, ${discovered.length - fetched - skipped} remaining`);
      break;
    }

    try {
      const res = await fetchJson(`${BASE}/players_info?apikey=${API_KEY}&id=${player.id}`);
      hitsToday = res.info?.hitsToday ?? hitsToday;
      if (res.status !== "success") {
        console.warn(`[miss] ${player.name} (${player.id}): ${res.reason ?? "unknown"}`);
        failed++;
        continue;
      }
      const cachePath = path.join(CACHE_DIR, `id-${player.id.slice(0, 8)}.json`);
      writeFileSync(cachePath, JSON.stringify(res.data, null, 2));
      cachedIds.add(player.id);
      fetched++;
      if (fetched % 25 === 0) console.log(`[progress] ${fetched} fetched, hitsToday=${hitsToday}`);
    } catch (err) {
      console.error(`[error] ${player.name}: ${err.message}`);
      failed++;
    }

    await sleep(150);
  }

  console.log(`\nDone. fetched=${fetched} skipped(already cached)=${skipped} failed=${failed} hitsToday=${hitsToday}`);
}

main();
