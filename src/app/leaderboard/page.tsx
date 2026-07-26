"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { COMPETITIONS, type CompetitionId } from "@/lib/engine/competitions";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n";

/** Fills {placeholders} in a translated string. Word order around them is
 * free, so each locale can put the competition or count where its grammar
 * wants it. */
function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template
  );
}

interface LeaderboardRow {
  id: string;
  user_id: string;
  username: string;
  wins: number;
  losses: number;
  unbeaten: boolean;
  team_rating_out_of_100: number;
  points: number;
}

// Each competition is its own board. They can't share one ranking: a World
// Cup Run is 9 matches and a League Season is 14, so ranked by raw wins a
// *perfect* 9-0 World Cup would sit below any 10-win league campaign. Split
// by competition and every board compares like with like.
const COMPETITION_TABS = [
  { id: "league-major" as CompetitionId, labelKey: "lb.comp.league", fullKey: "lb.compFull.league" },
  { id: "world-cup" as CompetitionId, labelKey: "lb.comp.worldCup", fullKey: "lb.compFull.worldCup" },
] as const satisfies readonly {
  id: CompetitionId;
  labelKey: TranslationKey;
  fullKey: TranslationKey;
}[];

// Periods within a competition. Monthly/Weekly read the scoped views, which
// additionally limit rows to the current calendar month/week (see
// supabase/setup_all.sql), so they reset while All-Time doesn't.
//
// Daily is league-only: startDailyChallenge() in gameStore doesn't set a
// competition, so every Daily result is a league campaign — a Daily tab under
// World Cup would always be empty.
const PERIODS = [
  { key: "all-time", labelKey: "lb.allTime", view: "leaderboard", isDaily: false, leagueOnly: false },
  { key: "monthly", labelKey: "lb.monthly", view: "monthly_leaderboard", isDaily: false, leagueOnly: false },
  { key: "weekly", labelKey: "lb.weekly", view: "weekly_leaderboard", isDaily: false, leagueOnly: false },
  { key: "daily", labelKey: "lb.daily", view: "leaderboard", isDaily: true, leagueOnly: true },
] as const satisfies readonly {
  key: string;
  labelKey: TranslationKey;
  view: string;
  isDaily: boolean;
  leagueOnly: boolean;
}[];

const MODE = "all-time-real";

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const [competition, setCompetition] = useState<CompetitionId>("league-major");
  const [periodKey, setPeriodKey] = useState<(typeof PERIODS)[number]["key"]>("all-time");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const periods = PERIODS.filter((p) => !p.leagueOnly || competition === "league-major");
  const period = periods.find((p) => p.key === periodKey) ?? periods[0];
  // Identifies the exact board being shown, so the loading state can't show
  // the previous board's rows after switching either control.
  const boardKey = `${competition}:${period.key}`;

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    supabase
      .from(period.view)
      .select("id, user_id, username, wins, losses, unbeaten, team_rating_out_of_100, points")
      .eq("competition", competition)
      .eq("mode", MODE)
      .eq("is_daily", period.isDaily)
      // Season Points is the ranking — see seasonPoints() and the leaderboard
      // views. team_rating breaks the rare exact-points tie.
      .order("points", { ascending: false })
      .order("team_rating_out_of_100", { ascending: false })
      .limit(50)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        setLoadedKey(boardKey);
        if (fetchError) setError(fetchError.message);
        else {
          setError(null);
          setRows(data ?? []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardKey, competition, period.view, period.isDaily]);

  const isLoading = loadedKey !== boardKey;
  const matches = COMPETITIONS[competition].matches;
  const competitionTab = COMPETITION_TABS.find((c) => c.id === competition) ?? COMPETITION_TABS[0];
  const competitionName = t(competitionTab.fullKey);

  function selectCompetition(id: CompetitionId) {
    setCompetition(id);
    // Daily doesn't exist outside the league, so switching to World Cup while
    // on Daily would otherwise leave a selected tab that isn't rendered.
    if (id !== "league-major" && PERIODS.find((p) => p.key === periodKey)?.leagueOnly) {
      setPeriodKey("all-time");
    }
  }

  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-1">{t("nav.leaderboard")}</h1>
      <p className="text-foreground-muted mb-6">{t("lb.subtitle")}</p>

      {!isSupabaseConfigured ? (
        <p className="text-sm text-foreground-muted">
          {t("lb.needAccount")}{" "}
          <Link href="/settings" className="text-accent underline underline-offset-4">
            {t("lb.notOnYet")}
          </Link>{" "}
          {t("lb.checkBack")}
        </p>
      ) : (
        <>
          {/* Competition switcher — the primary split, since boards for
              different competition lengths are not comparable. */}
          <div
            role="tablist"
            aria-label="Competition"
            className="mb-3 flex gap-1 rounded-xl border border-border bg-background-elevated p-1"
          >
            {COMPETITION_TABS.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === competition}
                onClick={() => selectCompetition(c.id)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                  c.id === competition
                    ? "bg-accent text-[#04120d]"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>

          <p className="mb-4 text-xs text-foreground-muted">
            {fill(t("lb.blurb"), { competition: competitionName, n: matches })}
          </p>

          {/* Period switcher within the selected competition. */}
          <div role="tablist" aria-label="Period" className="mb-6 flex gap-2 overflow-x-auto">
            {periods.map((p) => (
              <button
                key={p.key}
                role="tab"
                aria-selected={p.key === period.key}
                onClick={() => setPeriodKey(p.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  p.key === period.key
                    ? "bg-accent text-[#04120d]"
                    : "bg-background-elevated text-foreground-muted border border-border hover:text-foreground"
                }`}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          {!error && isLoading && <p className="text-sm text-foreground-muted">{t("lb.loading")}</p>}

          {!isLoading && rows !== null && rows.length === 0 && (
            <p className="text-sm text-foreground-muted">
              {fill(t("lb.empty"), {
                period: t(period.labelKey),
                competition: competitionName,
              })}
            </p>
          )}

          {!isLoading && rows !== null && rows.length > 0 && (
            <ol className="grid gap-2">
              {rows.map((row, i) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-center text-sm font-black text-foreground-muted tabular-nums">
                      {i + 1}
                    </span>
                    <span className="font-semibold">{row.username}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={row.unbeaten ? "accent" : "default"}>
                      {row.wins}-{row.losses}
                    </Badge>
                    <div className="w-16 text-right">
                      <span className="font-black tabular-nums text-foreground">
                        {row.points.toLocaleString("en-US")}
                      </span>
                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                        {t("lb.pts")}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}
