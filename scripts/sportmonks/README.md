# SportMonks pipeline

The **identity + metadata** half of the data stack. Cricsheet gives us superb
ball-by-ball *stats* but knows players only as `"V Kohli"` — no country, no
batting hand, no bowling style, no photo. SportMonks fills exactly that gap, so
the two together produce a complete player: real numbers **and** real identity.

| | Cricsheet | SportMonks |
|---|---|---|
| Provides | ball-by-ball stats, phase splits | country, hand, bowling style, full name, photo, current squads |
| Cost | free | paid (your plan) |
| Identity | `"V Kohli"` | structured `firstname` / `lastname` + stable id |

## Setup

Add your token to `.env.local`:

```
SPORTMONKS_API_TOKEN=your_token_here
```

## Run it

```bash
# 1. Cache the SportMonks player directory (paginated; resumable)
node --env-file=.env.local scripts/sportmonks/fetch-players.mjs
node --env-file=.env.local scripts/sportmonks/fetch-players.mjs --max-pages 5   # smoke test

# 2. Join it onto the Cricsheet stats
node scripts/sportmonks/reconcile.mjs        # → unified-players.json
```

Run the Cricsheet pipeline first (`scripts/cricsheet/`) — reconcile reads its
`cricsheet-players.json`.

## The join is strictly one-to-one

Cricket is full of shared surnames. A naive `surname + first initial` match had
**Rashid Khan's** identity claimed by four different players — which would have
handed three strangers his nationality and bowling style, and created duplicate
people in the draft pool. So matching runs in passes, narrowest evidence first:

0. **Men-only directory.** The Cricsheet side is aggregated men's-only, so the
   1,524 women's entries can never be a correct match — they only manufacture
   false ambiguity. (`INCLUDE_WOMENS=1` keeps them.)
1. **Exact full name** — trustworthy, gets first claim on an identity.
2. **Surname + first initial** — accepted *only* when unambiguous on **both**
   sides: one unmatched Cricsheet player for that key, one unclaimed SportMonks
   player.
3. **National side tie-break** — when one Cricsheet player still faces several
   same-shaped identities, Cricsheet's own team list can single one out:
   `AD Russell` played for West Indies, so he is Andre Russell and not the
   Alex Russell who never did. Applied only when it resolves to exactly one
   candidate, and never when the Cricsheet side is ambiguous too.

Anything else is reported as ambiguous and left unmatched. Marquee players are
not exempt: `JJ Bumrah` shares a surname and initial with a `Jagdeep Bumrah`
of the same country, so he stays unmatched rather than risk the wrong record. A player with no
confirmed identity is still kept — the stats are real and usable, they just
carry no metadata yet. **A missing field beats a wrong one.**

## Verify without the API

A fixture lets you exercise the join against the real Cricsheet data:

```bash
SPORTMONKS_PLAYERS=scripts/sportmonks/fixtures/players.json node scripts/sportmonks/reconcile.mjs
```

Expect 4 matched, each one-to-one (Kohli/India, Bumrah/India, Rashid Khan/
Afghanistan, Maxwell/Australia) — and note the three false "R Khan" claims are
correctly rejected. A fixture run writes `unified-players.fixture.json`, so it
never clobbers the real join output.

## Output (`unified-players.json`)

```jsonc
{
  "cricsheetId": "…", "sportmonksId": 101,       // null when unidentified
  "name": "Virat Kohli",
  "country": "India", "battingStyle": "…", "bowlingStyle": "…",
  "position": "Batsman", "imageUrl": "…", "dateOfBirth": "…",
  "matches": 400, "firstYear": 2008, "lastYear": 2025, "teams": ["…"],
  "batting": { /* incl. phase splits */ }, "bowling": { /* incl. phase splits */ },
  "metadataSource": "sportmonks"
}
```

## What's next

`country` is the key that unlocks the rest: with it, the ~5,000 Cricsheet
players can be grouped into **national squads by year** and folded into the
spin pool — the "thousands of players, more teams" goal. That generator comes
after a real fetch, once we can see how much of the pool SportMonks identifies.

`players.json` and `unified-players.json` are git-ignored (large, regenerated).
