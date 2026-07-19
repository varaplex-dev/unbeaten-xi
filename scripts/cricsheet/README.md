# Cricsheet pipeline

Turns [Cricsheet](https://cricsheet.org) ball-by-ball match data into a rich
per-player stats database — the substrate for a smarter, real-stats season
simulation and a much larger spinnable player pool.

Cricsheet is free and openly licensed (attribution: *"Data from Cricsheet"*).
It publishes one JSON file per match, each with a **registry** mapping every
player name to a stable Cricsheet id — so aggregation keys off real identities,
never guesses.

## Why this over the current CricAPI data

| | CricAPI (current) | Cricsheet (this) |
|---|---|---|
| Depth | career **aggregates** only | **ball-by-ball** → phase splits, boundary %, death economy |
| History | ~4–6 recent seasons | many years, back to the 2000s |
| Coverage | budget tier, some bad rosters | internationals + all major leagues, men's **and women's** |
| Cost | paid tier | free (bulk download) |
| Identity | CricAPI ids | Cricsheet registry ids (map to others via `people.csv`) |

## Run it

Node 18+ (the project uses 24). From the repo root:

```bash
# 1. Download + extract competition archives into ./data
node scripts/cricsheet/download.mjs                 # default: t20s, ipl, bbl, psl
node scripts/cricsheet/download.mjs ipl bbl psl cpl sa20 wpl wbb t20s_female

# 2. Aggregate every T20-family match into per-player stats
node scripts/cricsheet/aggregate.mjs                # writes cricsheet-players.json
```

Pass archive **base names** (without `_json.zip`) as arguments — find the exact
list on <https://cricsheet.org/downloads/>. On Windows extraction uses
PowerShell's `Expand-Archive` automatically; on macOS/Linux it uses `unzip`.

Tuning knobs (env vars on the aggregate step):

- `MIN_MATCHES=5` — drop players below N T20 matches (default 3).
- `CRICSHEET_DATA=some/dir` — read matches from a different directory.

## Verify the parser without downloading anything

A tiny hand-checked match lives in `fixtures/`:

```bash
MIN_MATCHES=1 CRICSHEET_DATA=scripts/cricsheet/fixtures node scripts/cricsheet/aggregate.mjs
```

It should report 5 players and produce a `cricsheet-players.json` whose numbers
match the fixture by hand (e.g. the wide is charged to the bowler but is not a
ball faced by the batter).

## Output shape (`cricsheet-players.json`)

One entry per player:

```jsonc
{
  "id": "cricsheet-registry-id",
  "name": "…", "aliases": ["…"], "teams": ["…"],
  "matches": 128, "firstYear": 2013, "lastYear": 2025,
  "batting": {
    "innings", "runs", "balls", "outs",
    "average", "strikeRate", "boundaryPct", "fours", "sixes",
    "phases": { "powerplay": { "runs","balls","strikeRate","economy" }, "middle": {…}, "death": {…} }
  },
  "bowling": {
    "innings", "balls", "runs", "wickets",
    "average", "economy", "strikeRate",
    "phases": { "powerplay": {…}, "middle": {…}, "death": {…} }
  }
}
```

## What's next

- `generate.mjs` (not built yet) maps this into the app's `PlayerSpec` /
  `CareerStats` format and, once `CareerStats` is extended with phase splits,
  feeds the smarter simulation.
- **SportMonks** later becomes the identity + current-squad + player-image
  layer, reconciled onto these Cricsheet ids by name + country.

## Ignored files

`data/`, `archives/`, and `cricsheet-players.json` are git-ignored — they're
large and regenerated locally. Only the scripts and the fixture are committed.
