// Fetches real player data from cricketdata.org (CricAPI v1) for the curated
// name list, caching raw responses to disk so re-runs don't re-spend quota
// on players already fetched. Run with:
//   node --env-file=.env.local scripts/cricket-data/fetch.mjs
//
// This is a periodic data-refresh script (designed to run unattended via a
// daily scheduled task), NOT called at runtime by the app — the free tier's
// 100 requests/day cap makes live querying during gameplay impractical, so
// the app reads a generated static dataset instead (see transform.ts).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "cache");
const NAMES_PATH = path.join(__dirname, "names.json");
const AMBIGUOUS_LOG = path.join(__dirname, "ambiguous.json");
const API_KEY = process.env.CRICKETDATA_API_KEY;
const BASE = "https://api.cricapi.com/v1";
const HITS_BUDGET = 1900; // stay under the 2000/day paid-tier cap

if (!API_KEY) {
  console.error("CRICKETDATA_API_KEY is not set. Run with: node --env-file=.env.local scripts/cricket-data/fetch.mjs");
  process.exit(1);
}

mkdirSync(CACHE_DIR, { recursive: true });

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * Same common name can match several unrelated real people in the DB (e.g.
 * a random Indonesian "Rohit Sharma" alongside India's captain, or a
 * Pakistani "Rashid Khan" alongside the Afghan leg-spinner). Rank candidates
 * so the country-matching, exact-name, data-rich one is tried first; if a
 * candidate turns out to be an empty stub (no stats), fall through to the
 * next-best candidate rather than caching a hollow record.
 */
function rankCandidates(candidates, name, expectedCountry) {
  return [...candidates].sort((a, b) => {
    const aCountryMatch = expectedCountry && a.country?.toLowerCase() === expectedCountry.toLowerCase() ? 1 : 0;
    const bCountryMatch = expectedCountry && b.country?.toLowerCase() === expectedCountry.toLowerCase() ? 1 : 0;
    if (aCountryMatch !== bCountryMatch) return bCountryMatch - aCountryMatch;
    const aExact = a.name.toLowerCase() === name.toLowerCase() ? 1 : 0;
    const bExact = b.name.toLowerCase() === name.toLowerCase() ? 1 : 0;
    return bExact - aExact;
  });
}

async function fetchPlayer(name, expectedCountry) {
  const searchUrl = `${BASE}/players?apikey=${API_KEY}&offset=0&search=${encodeURIComponent(name)}`;
  const searchRes = await fetchJson(searchUrl);
  if (searchRes.status !== "success" || !searchRes.data?.length) {
    return { ok: false, reason: "not found", hitsToday: searchRes.info?.hitsToday };
  }

  const ranked = rankCandidates(searchRes.data, name, expectedCountry);
  let hitsToday = searchRes.info?.hitsToday;
  let lastAttempt = null;

  for (const candidate of ranked.slice(0, 3)) {
    await sleep(250);
    const infoUrl = `${BASE}/players_info?apikey=${API_KEY}&id=${candidate.id}`;
    const infoRes = await fetchJson(infoUrl);
    hitsToday = infoRes.info?.hitsToday ?? hitsToday;
    if (infoRes.status !== "success") continue;

    const data = infoRes.data;
    const hasStats = Array.isArray(data.stats) && data.stats.length > 0;
    const countryOk = !expectedCountry || data.country?.toLowerCase() === expectedCountry.toLowerCase();
    lastAttempt = data;

    if (hasStats && countryOk) {
      return { ok: true, data, hitsToday, ambiguous: false };
    }
  }

  // Nothing matched cleanly — return the last attempt (if any) flagged as
  // ambiguous, so it's still usable but easy to find and review later.
  if (lastAttempt) {
    return { ok: true, data: lastAttempt, hitsToday, ambiguous: true };
  }
  return { ok: false, reason: "no valid candidate", hitsToday };
}

async function main() {
  const entries = JSON.parse(readFileSync(NAMES_PATH, "utf8"));
  let hitsToday = 0;
  let fetched = 0;
  let skipped = 0;
  let failed = [];
  let ambiguous = [];

  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry.name;
    const expectedCountry = typeof entry === "string" ? undefined : entry.country;
    const cachePath = path.join(CACHE_DIR, `${slugify(name)}.json`);
    if (existsSync(cachePath)) {
      continue;
    }

    if (hitsToday >= HITS_BUDGET) {
      skipped++;
      continue;
    }

    try {
      const result = await fetchPlayer(name, expectedCountry);
      hitsToday = result.hitsToday ?? hitsToday;
      if (!result.ok) {
        console.warn(`[miss] ${name}: ${result.reason}`);
        failed.push({ name, reason: result.reason });
        continue;
      }
      writeFileSync(cachePath, JSON.stringify(result.data, null, 2));
      if (result.ambiguous) {
        console.warn(`[ambiguous] ${name}: cached best-effort match, please review`);
        ambiguous.push({ name, expectedCountry, gotCountry: result.data.country });
      } else {
        console.log(`[fetched] ${name} (hitsToday=${hitsToday})`);
      }
      fetched++;
    } catch (err) {
      console.error(`[error] ${name}: ${err.message}`);
      failed.push({ name, reason: err.message });
    }

    await sleep(300);
  }

  if (ambiguous.length) {
    writeFileSync(AMBIGUOUS_LOG, JSON.stringify(ambiguous, null, 2));
  }

  console.log(
    `\nDone. fetched=${fetched} skipped=${skipped} failed=${failed.length} ambiguous=${ambiguous.length} hitsToday=${hitsToday}`
  );
  if (failed.length) console.log("Failed:", failed.map((f) => f.name).join(", "));
  if (ambiguous.length) console.log("Ambiguous (see ambiguous.json):", ambiguous.map((a) => a.name).join(", "));
}

main();
