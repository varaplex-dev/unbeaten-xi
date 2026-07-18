// Sanity-checks the cache directory against names.json's expected countries.
// Run with: node scripts/cricket-data/validate.mjs
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "cache");
const NAMES_PATH = path.join(__dirname, "names.json");

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const entries = JSON.parse(readFileSync(NAMES_PATH, "utf8"));
const expectedCountryBySlug = new Map(
  entries
    .filter((e) => typeof e !== "string")
    .map((e) => [slugify(e.name), e.country])
);

const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
let problems = 0;

for (const file of files) {
  const key = file.replace(".json", "");
  const data = JSON.parse(readFileSync(path.join(CACHE_DIR, file), "utf8"));
  const expectedCountry = expectedCountryBySlug.get(key);
  const issues = [];

  if (!data.role) issues.push("missing role");
  if (!data.stats || data.stats.length === 0) issues.push("no stats");
  if (expectedCountry && data.country !== expectedCountry) {
    issues.push(`country mismatch: expected ${expectedCountry}, got ${data.country}`);
  }

  if (issues.length > 0) {
    console.log(`[ISSUE] ${data.name} (${file}): ${issues.join("; ")}`);
    problems++;
  }
}

console.log(`\nChecked ${files.length} files, ${problems} with issues.`);
