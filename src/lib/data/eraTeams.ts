import type { EraTeam, Player } from "@/lib/types";
import { LEGEND_PLAYERS } from "@/lib/data/legendPlayers";
import { FRANCHISE_SEASON_TEAMS } from "@/lib/data/franchiseSeasonTeams";
import { NATIONAL_ERA_TEAMS } from "@/lib/data/nationalEraTeams";
import { createRng, pickRandom } from "@/lib/engine/rng";

/** Resolves a roster by exact player name so this file stays readable and
 * auditable — no opaque hardcoded IDs. Throws at module-load time (i.e. on
 * `npm run build`/`npm run dev`) if a name doesn't match, so a typo here
 * can't silently produce a squad missing a player. */
function byNames(pool: Player[], names: string[]): Player[] {
  return names.map((name) => {
    const player = pool.find((p) => p.name === name);
    if (!player) throw new Error(`Era team roster references unknown player: "${name}"`);
    return player;
  });
}

const HISTORIC_TEAMS: EraTeam[] = [
  {
    id: "west-indies-1980s",
    year: 1985,
    name: "West Indies",
    eraLabel: "1980s — The Pace Battery",
    tagline: "Four fast bowlers, no mercy, and Viv Richards walking out without a helmet.",
    country: "West Indies",
    isHistoric: true,
    players: byNames(LEGEND_PLAYERS, [
      "Sir Gordon Greenidge",
      "Desmond Haynes",
      "Sir Viv Richards",
      "Sir Clive Lloyd",
      "Larry Gomes",
      "Jeff Dujon",
      "Malcolm Marshall",
      "Michael Holding",
      "Joel Garner",
      "Sir Andy Roberts",
      "Colin Croft",
      "Richie Richardson",
      "Gus Logie",
      "Brian Lara",
      "Courtney Walsh",
      "Sir Curtly Ambrose",
    ]),
  },
  {
    id: "australia-1995-2007",
    year: 2001,
    name: "Australia",
    eraLabel: "1995–2007 — The Invincibles",
    tagline: "Bat first, bowl you out twice, and sledge you the whole way through.",
    country: "Australia",
    isHistoric: true,
    players: byNames(LEGEND_PLAYERS, [
      "Ricky Ponting",
      "Adam Gilchrist",
      "Matthew Hayden",
      "Justin Langer",
      "Steve Waugh",
      "Mark Waugh",
      "Michael Bevan",
      "Shane Warne",
      "Glenn McGrath",
      "Brett Lee",
      "Damien Martyn",
      "Michael Clarke",
      "Andrew Symonds",
      "Jason Gillespie",
    ]),
  },
  {
    id: "india-2000s-golden-generation",
    year: 2005,
    name: "India",
    eraLabel: "2000s — The Golden Generation",
    tagline: "The batting order that made the rest of the world nervous for a decade.",
    country: "India",
    isHistoric: true,
    players: byNames(LEGEND_PLAYERS, [
      "Sachin Tendulkar",
      "Virender Sehwag",
      "Rahul Dravid",
      "Sourav Ganguly",
      "VVS Laxman",
      "MS Dhoni",
      "Yuvraj Singh",
      "Harbhajan Singh",
      "Anil Kumble",
      "Zaheer Khan",
      "Ashish Nehra",
      "Gautam Gambhir",
      "Irfan Pathan",
    ]),
  },
  {
    id: "pakistan-1992-world-cup",
    year: 1992,
    name: "Pakistan",
    eraLabel: "1992 — World Cup Champions",
    tagline: "Cornered tigers. Imran's men peaked at exactly the right moment.",
    country: "Pakistan",
    isHistoric: true,
    players: byNames(LEGEND_PLAYERS, [
      "Rameez Raja",
      "Aamer Sohail",
      "Javed Miandad",
      "Inzamam-ul-Haq",
      "Asif Mujtaba",
      "Imran Khan",
      "Moin Khan",
      "Wasim Akram",
      "Waqar Younis",
      "Mushtaq Ahmed",
      "Aaqib Javed",
    ]),
  },
  {
    id: "sri-lanka-1996-world-cup",
    year: 1996,
    name: "Sri Lanka",
    eraLabel: "1996 — World Cup Champions",
    tagline: "Reinvented the opening over and blitzed the world in 15 overs flat.",
    country: "Sri Lanka",
    isHistoric: true,
    players: byNames(LEGEND_PLAYERS, [
      "Sanath Jayasuriya",
      "Romesh Kaluwitharana",
      "Asanka Gurusinha",
      "Aravinda de Silva",
      "Arjuna Ranatunga",
      "Hashan Tillakaratne",
      "Roshan Mahanama",
      "Muthiah Muralidaran",
      "Chaminda Vaas",
      "Kumar Dharmasena",
      "Pramodya Wickramasinghe",
      "Upul Chandana",
    ]),
  },
  {
    id: "south-africa-1990s-2000s",
    year: 2000,
    name: "South Africa",
    eraLabel: "1990s–2000s — The Proteas Era",
    tagline: "Ruthlessly professional, one run short of a world title more than once.",
    country: "South Africa",
    isHistoric: true,
    players: byNames(LEGEND_PLAYERS, [
      "Gary Kirsten",
      "Herschelle Gibbs",
      "Hansie Cronje",
      "Jacques Kallis",
      "Jonty Rhodes",
      "Daryll Cullinan",
      "Lance Klusener",
      "Mark Boucher",
      "Shaun Pollock",
      "Allan Donald",
      "Makhaya Ntini",
    ]),
  },
  {
    id: "england-2005-ashes",
    year: 2005,
    name: "England",
    eraLabel: "2005 — Ashes Winners",
    tagline: "The summer that ended eighteen years of Australian dominance.",
    country: "England",
    isHistoric: true,
    players: byNames(LEGEND_PLAYERS, [
      "Marcus Trescothick",
      "Sir Andrew Strauss",
      "Michael Vaughan",
      "Ian Bell",
      "Kevin Pietersen",
      "Andrew Flintoff",
      "Geraint Jones",
      "Ashley Giles",
      "Matthew Hoggard",
      "Steve Harmison",
      "Simon Jones",
    ]),
  },
];

// National sides come from NATIONAL_ERA_TEAMS — 73 squads spanning four era
// buckets (2005-09 through 2020-26), generated from the Cricsheet+SportMonks
// database. They replaced a hand-listed set of ten "current squad" teams built
// off the older CricAPI pool: that covered ten countries and one era, and its
// players would now be duplicated by the 2020-2026 generated squads.
export const ERA_TEAMS: EraTeam[] = [
  ...HISTORIC_TEAMS,
  ...NATIONAL_ERA_TEAMS,
  ...FRANCHISE_SEASON_TEAMS,
];

/**
 * National sides only — every curated historic side plus every generated
 * national era squad, with the club franchises left out. This is the World Cup
 * Run drafting pool: a tournament of nations shouldn't hand you Chennai Super
 * Kings.
 *
 * The same country appearing in several eras is intentional and allowed. Two
 * different India sides are two different squads, and the rule that matters is
 * that no PLAYER is drafted twice — which is enforced by name across pools, not
 * by blocking a country.
 */
export const NATIONAL_TEAM_POOL: EraTeam[] = [...HISTORIC_TEAMS, ...NATIONAL_ERA_TEAMS];

/**
 * IPL franchise-season squads only — the drafting pool for the India XI mode.
 * FRANCHISE_SEASON_TEAMS ids are league-prefixed ("ipl-…", "bbl-…", "psl-…"),
 * so this keeps just the IPL sides and drops BBL/PSL. Everyone in these squads
 * actually played that IPL season, so a squad spun together here is entirely
 * IPL players (Indian and overseas alike).
 */
export const IPL_FRANCHISE_POOL: EraTeam[] = FRANCHISE_SEASON_TEAMS.filter((t) =>
  t.id.startsWith("ipl-")
);

export function getEraTeamById(id: string): EraTeam | undefined {
  return ERA_TEAMS.find((t) => t.id === id);
}

/** Deterministically picks the team for the next spin — every pick draft
 * (first XI pick, later picks, and the Impact Player round) calls this the
 * same way, keyed off how many teams have already been used. Pure and
 * side-effect-free so it can be called twice for the same spin: once to
 * compute the target the reel animation should land on, and once (identical
 * result) when the store commits the pick after the animation finishes. */
export function pickNextEraTeam(
  seed: string,
  usedEraTeamIds: string[],
  /** Which teams this game drafts from. World Cup Run passes
   * NATIONAL_TEAM_POOL so no club franchise can be spun into. */
  teams: EraTeam[] = ERA_TEAMS
): EraTeam {
  const available = teams.filter((t) => !usedEraTeamIds.includes(t.id));
  // Only hit if usedEraTeamIds somehow grew past the pool size — not
  // reachable in practice (the smallest pool is 81 teams against 12 picks)
  // but a safe fallback beats a spin that silently does nothing.
  const pool = available.length > 0 ? available : teams;
  const rng = createRng(`${seed}::era-team-${usedEraTeamIds.length}`);
  return pickRandom(rng, pool);
}
