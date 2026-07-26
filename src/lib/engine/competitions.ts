/**
 * How many matches a competition actually asks one team to play.
 *
 * The numbers below are PER TEAM, which is the figure that matters here and
 * the one most published totals obscure. IPL 2025 is widely reported as 74
 * matches, but that is the whole tournament — 10 teams, 70 league games plus 4
 * playoffs — and each side plays exactly 14 in the league. Major League
 * Cricket's 34 is the same arithmetic with 6 teams: 30 league games, 10 each.
 *
 * So the game's original 14 was never arbitrary; it is precisely an IPL league
 * campaign. It just wasn't labelled as one, which is why it read as a magic
 * number.
 *
 * Everything here is T20. ODI competitions (Champions Trophy, most bilateral
 * tours) are deliberately absent: the entire stack — Cricsheet aggregation,
 * the powerplay/middle/death phase splits, the match engine — is built on T20
 * ball-by-ball data, so a 50-over mode is a second engine and a second data
 * pipeline rather than a different match count. Deferred on purpose.
 */
export interface Competition {
  id: CompetitionId;
  /** Shown in the UI. */
  label: string;
  /** Matches this competition asks ONE team to play. */
  matches: number;
  /** Where the number comes from, so it can be checked rather than trusted. */
  basis: string;
  /** True when going undefeated means winning a knockout, not a league. */
  isKnockout: boolean;
}

export type CompetitionId = "league-major" | "league-short" | "world-cup";

export const COMPETITIONS: Record<CompetitionId, Competition> = {
  "league-major": {
    id: "league-major",
    label: "League Season",
    matches: 14,
    basis: "IPL: 10 teams, 70 league matches, 14 per team (74 total with playoffs).",
    isKnockout: false,
  },
  "league-short": {
    id: "league-short",
    label: "Short League Season",
    matches: 10,
    basis: "BBL / PSL / MLC / CPL: 6-8 teams on a double round robin, 10 per team.",
    isKnockout: false,
  },
  "world-cup": {
    id: "world-cup",
    label: "World Cup Run",
    matches: 9,
    basis: "T20 World Cup: 4 group + 3 Super 8 + semi-final + final for a finalist.",
    isKnockout: true,
  },
};

/** The competition a season runs as when nothing else is specified — the
 * flagship All-Time XI mode, and the format the 14-0 branding refers to. */
export const DEFAULT_COMPETITION_ID: CompetitionId = "league-major";

export function competitionById(id: CompetitionId = DEFAULT_COMPETITION_ID): Competition {
  return COMPETITIONS[id];
}

/** The season length for a competition, for callers that only need the count. */
export function matchesFor(id: CompetitionId = DEFAULT_COMPETITION_ID): number {
  return COMPETITIONS[id].matches;
}
