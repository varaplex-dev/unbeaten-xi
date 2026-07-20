// Fetches the SportMonks player directory — the identity + metadata layer
// Cricsheet can't provide (country, batting hand, bowling style, full names,
// photos). Paginates the whole /players endpoint into a local cache.
//
// Run:
//   node --env-file=.env.local scripts/sportmonks/fetch-players.mjs
//   node --env-file=.env.local scripts/sportmonks/fetch-players.mjs --max-pages 5
//
// Needs SPORTMONKS_API_TOKEN in .env.local. Output: scripts/sportmonks/players.json

import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(HERE, "players.json");
const BASE = "https://cricket.sportmonks.com/api/v2.0";
const TOKEN = process.env.SPORTMONKS_API_TOKEN;

// SportMonks rate-limits per plan; a small gap between pages keeps us well
// inside it and makes a long run survivable.
const PAGE_DELAY_MS = 250;
const MAX_RETRIES = 4;

if (!TOKEN) {
  console.error(
    "SPORTMONKS_API_TOKEN is not set.\n" +
      "Add it to .env.local and run:\n" +
      "  node --env-file=.env.local scripts/sportmonks/fetch-players.mjs"
  );
  process.exit(1);
}

const argMaxPages = (() => {
  const i = process.argv.indexOf("--max-pages");
  return i !== -1 ? Number(process.argv[i + 1]) : Infinity;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page) {
  const url = `${BASE}/players?api_token=${TOKEN}&include=country&page=${page}`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      // Rate limited — back off and retry rather than losing the run.
      const wait = 2000 * attempt;
      console.log(`  rate limited, waiting ${wait}ms…`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      if (attempt === MAX_RETRIES) throw new Error(`page ${page}: HTTP ${res.status}`);
      await sleep(1000 * attempt);
      continue;
    }
    return res.json();
  }
  throw new Error(`page ${page}: exhausted retries`);
}

/** Keep only the fields we actually need, so the cache stays small. */
function slim(p) {
  return {
    id: p.id,
    fullname: p.fullname ?? null,
    firstname: p.firstname ?? null,
    lastname: p.lastname ?? null,
    country: p.country?.name ?? null,
    countryId: p.country_id ?? null,
    dateOfBirth: p.dateofbirth ?? null,
    gender: p.gender ?? null,
    battingStyle: p.battingstyle ?? null,
    bowlingStyle: p.bowlingstyle ?? null,
    position: p.position?.name ?? null,
    imageUrl: p.image_path ?? null,
  };
}

async function main() {
  await mkdir(HERE, { recursive: true });

  // Resume support: keep anything already fetched.
  let existing = [];
  try {
    existing = JSON.parse(await readFile(OUT_FILE, "utf8"));
    console.log(`Resuming — ${existing.length} players already cached.`);
  } catch {
    /* first run */
  }
  const byId = new Map(existing.map((p) => [p.id, p]));

  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= argMaxPages) {
    const json = await fetchPage(page);
    const rows = json.data ?? [];
    for (const p of rows) byId.set(p.id, slim(p));

    const pagination = json.meta?.pagination;
    totalPages = pagination?.total_pages ?? page;
    process.stdout.write(`\rpage ${page}/${totalPages} — ${byId.size} players`);
    page++;
    if (page <= totalPages) await sleep(PAGE_DELAY_MS);
  }

  const all = [...byId.values()];
  await writeFile(OUT_FILE, JSON.stringify(all, null, 2));
  console.log(`\nWrote ${all.length} players to ${path.relative(process.cwd(), OUT_FILE)}`);
  const withCountry = all.filter((p) => p.country).length;
  console.log(`  with country   : ${withCountry}`);
  console.log(`  with batting   : ${all.filter((p) => p.battingStyle).length}`);
  console.log(`  with bowling   : ${all.filter((p) => p.bowlingStyle).length}`);
  console.log(`\nNext: node scripts/sportmonks/reconcile.mjs`);
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
