// Downloads + extracts Cricsheet competition archives into ./data, ready for
// aggregate.mjs. Cricsheet publishes one zip of match JSON per competition at
// https://cricsheet.org/downloads/<name>_json.zip.
//
// Usage:
//   node scripts/cricsheet/download.mjs                # a sensible default set
//   node scripts/cricsheet/download.mjs ipl bbl psl    # only these
//   node scripts/cricsheet/download.mjs t20s wbb wpl   # add women's comps
//
// Pass the archive base names (without "_json.zip"). Find the full, exact list
// on the Cricsheet downloads page. Requires `unzip` (macOS/Linux) or runs
// PowerShell's Expand-Archive automatically on Windows.

import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVES_DIR = path.join(HERE, "archives");
const DATA_DIR = path.join(HERE, "data");
const BASE_URL = "https://cricsheet.org/downloads";

// Long-standing T20 archives. The Cricsheet downloads page lists many more
// (cpl, sa20, ilt20, the-hundred, wbb = WBBL, wpl = Women's Premier League,
// t20s_female, county T20 = ntb/blast, etc.) — pass their base names as args.
const DEFAULT_ARCHIVES = ["t20s", "ipl", "bbl", "psl"];

async function downloadArchive(name) {
  const url = `${BASE_URL}/${name}_json.zip`;
  const zipPath = path.join(ARCHIVES_DIR, `${name}_json.zip`);
  process.stdout.write(`↓ ${name}_json.zip … `);
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`FAILED (${res.status}). Check the exact name at ${BASE_URL}/`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(zipPath, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
  return zipPath;
}

async function extract(zipPath, name) {
  const dest = path.join(DATA_DIR, name);
  await mkdir(dest, { recursive: true });
  try {
    if (process.platform === "win32") {
      await execFileP("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${dest}" -Force`,
      ]);
    } else {
      await execFileP("unzip", ["-o", "-q", zipPath, "-d", dest]);
    }
    console.log(`  → extracted to data/${name}/`);
  } catch (err) {
    console.log(`  ! could not auto-extract (${err.message?.split("\n")[0] ?? err}).`);
    console.log(`    Unzip ${path.relative(process.cwd(), zipPath)} into ${path.relative(process.cwd(), dest)}/ manually.`);
  }
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ARCHIVES;
  await mkdir(ARCHIVES_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });
  console.log(`Fetching ${names.length} archive(s): ${names.join(", ")}\n`);

  for (const name of names) {
    const zipPath = await downloadArchive(name);
    if (zipPath) await extract(zipPath, name);
  }

  // The zips are only needed for extraction; drop them to save space.
  await rm(ARCHIVES_DIR, { recursive: true, force: true });
  console.log(`\nDone. Next: node scripts/cricsheet/aggregate.mjs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
