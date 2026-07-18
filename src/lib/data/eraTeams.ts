import type { EraTeam, Player } from "@/lib/types";
import { LEGEND_PLAYERS } from "@/lib/data/legendPlayers";
import { REAL_PLAYERS } from "@/lib/data/realPlayers";
import { FRANCHISE_SEASON_TEAMS } from "@/lib/data/franchiseSeasonTeams";

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

/** A country's strongest current players from the real-player pool, for the
 * "current era" teams — reuses the same data as All-Time XI's flat draft
 * pool rather than a separate curated list. */
function currentSquadFor(country: string, count = 16): Player[] {
  return REAL_PLAYERS.filter((p) => p.country === country)
    .sort((a, b) => b.overallRating - a.overallRating)
    .slice(0, count);
}

const HISTORIC_TEAMS: EraTeam[] = [
  {
    id: "west-indies-1980s",
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

const CURRENT_ERA_COUNTRIES = [
  "India",
  "Australia",
  "England",
  "Pakistan",
  "South Africa",
  "West Indies",
  "New Zealand",
  "Sri Lanka",
  "Bangladesh",
  "Afghanistan",
] as const;

const SQUAD_MIN_FOR_ERA_TEAM = 11;

const CURRENT_TEAMS: EraTeam[] = CURRENT_ERA_COUNTRIES.map((country) => ({
  id: `current-${country.toLowerCase().replace(/\s+/g, "-")}`,
  name: country,
  eraLabel: "Today",
  tagline: `${country}'s strongest current squad, straight off today's team sheet.`,
  country,
  isHistoric: false,
  players: currentSquadFor(country),
})).filter((team) => team.players.length >= SQUAD_MIN_FOR_ERA_TEAM);

export const ERA_TEAMS: EraTeam[] = [...HISTORIC_TEAMS, ...CURRENT_TEAMS, ...FRANCHISE_SEASON_TEAMS];

export function getEraTeamById(id: string): EraTeam | undefined {
  return ERA_TEAMS.find((t) => t.id === id);
}
