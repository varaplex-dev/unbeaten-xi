import type { EraTeam, Player } from "@/lib/types";
import { SQUAD_SIZE } from "@/lib/types";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import discoveredSeasonSquads from "../../../scripts/cricket-data/discovered-season-squads.json";

// Real franchise rosters for specific PAST seasons of IPL/BBL/PSL — e.g.
// "Gujarat Titans 2022" (their actual debut and title-winning season), not
// just a curated "greatest era" team. Built from
// scripts/cricket-data/discover-season-squads.mjs, which fetches every
// match's squad for a season and keeps only players who appeared in at
// least half of their team's matches that season — a fringe player who
// played 2 of 14 games isn't "part of that team's story" the way the
// regulars are.
//
// Scope note: CricketData.org's current tier only exposes roughly the last
// 4-6 seasons of each league — there is no way to reach further back (e.g.
// IPL 2010) from this API. This is real season history, just a recent
// window of it, not the full life of each league.
//
// Data-quality note: while building this, several team-seasons came back
// from the API with an obviously wrong, fixed roster (e.g. one 2023 IPL
// team's "squad" listed Sachin Tendulkar and other players who never
// played for them) — a data error on the API's side, not ours. Those
// team-seasons (and the entire 2023 IPL season, once the pattern showed up
// across multiple teams) were identified and dropped during discovery
// rather than shipped. What remains here was spot-checked against known
// real rosters.

interface DiscoveredSeasonPlayer {
  id: string;
  name: string;
}

interface DiscoveredSeasonTeam {
  league: string;
  season: string;
  teamName: string;
  teamMatches: number;
  players: DiscoveredSeasonPlayer[];
}

const LEAGUE_LABELS: Record<string, string> = {
  ipl: "IPL",
  bbl: "BBL",
  psl: "PSL",
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** "Indian Premier League 2025" -> "2025"; "Big Bash League 2024-25" ->
 * "2024-25"; "Pakistan Super League, 2024" -> "2024". */
function seasonYearLabel(season: string): string {
  const match = season.match(/(\d{4}(?:-\d{2,4})?)\s*$/);
  return match ? match[1] : season;
}

function buildFranchiseSeasonTeams(): EraTeam[] {
  const teams: EraTeam[] = [];
  for (const raw of discoveredSeasonSquads as DiscoveredSeasonTeam[]) {
    const players: Player[] = raw.players
      // discovered-season-squads.json stores the raw CricAPI UUID; the
      // generated spec/Player id format truncates it to 8 chars with a
      // "real-" prefix (see transform.ts) — same conversion every other
      // real-player ID reference in this codebase relies on.
      .map((p) => getRealPlayerById(`real-${p.id.slice(0, 8)}`))
      .filter((p): p is Player => Boolean(p));
    // A handful of matches may have failed to fetch stats for one or two
    // players (rare) — if that drops a team below a full XI's worth of
    // real options, skip it rather than surface a squad users can't
    // actually complete a team from.
    if (players.length < SQUAD_SIZE) continue;

    const leagueLabel = LEAGUE_LABELS[raw.league] ?? raw.league.toUpperCase();
    const yearLabel = seasonYearLabel(raw.season);
    // The first four digits of the season label are the calendar year the
    // squad played (a "2024-25" BBL season is anchored to 2024); falls back
    // to the current year if a season string is ever unparseable.
    const year = Number(yearLabel.slice(0, 4)) || new Date().getFullYear();
    const possessive = raw.teamName.endsWith("s") ? `${raw.teamName}'` : `${raw.teamName}'s`;
    teams.push({
      id: `${raw.league}-${slugify(raw.season)}-${slugify(raw.teamName)}`,
      name: raw.teamName,
      eraLabel: `${leagueLabel} ${yearLabel}`,
      tagline: `${possessive} actual ${yearLabel} squad — everyone who played at least half the season.`,
      country: leagueLabel,
      isHistoric: true,
      year,
      players,
    });
  }
  return teams;
}

export const FRANCHISE_SEASON_TEAMS: EraTeam[] = buildFranchiseSeasonTeams();
