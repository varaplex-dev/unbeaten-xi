"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

interface LeaderboardRow {
  id: string;
  user_id: string;
  username: string;
  wins: number;
  losses: number;
  unbeaten: boolean;
  team_rating_out_of_100: number;
}

// Only these (mode, is_daily) combinations occur in gameplay — see
// startNewGame/startDailyChallenge in src/lib/store/gameStore.ts. Kept as
// separate boards rather than one merged ranking because a Daily Challenge
// result (fixed seed, same team for everyone that day) isn't comparable to
// a free draft (each player picks their own XI). The fictional mode is no
// longer playable, so it has no tab here — any pre-existing fictional
// results still in season_results just won't show up on this leaderboard.
// Weekly reuses the same (mode, is_daily) filter as All-Time but reads from
// the weekly_leaderboard view instead, which additionally scopes rows to
// the current calendar week (see supabase/schema.sql) — a resetting board
// alongside the unbounded all-time one.
const TABS = [
  { key: "all-time", label: "All-Time", view: "leaderboard", mode: "all-time-real", isDaily: false },
  { key: "daily", label: "Daily", view: "leaderboard", mode: "all-time-real", isDaily: true },
  { key: "weekly", label: "Weekly", view: "weekly_leaderboard", mode: "all-time-real", isDaily: false },
] as const;

export default function LeaderboardPage() {
  const [tabKey, setTabKey] = useState<(typeof TABS)[number]["key"]>("all-time");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    supabase
      .from(tab.view)
      .select("id, user_id, username, wins, losses, unbeaten, team_rating_out_of_100")
      .eq("mode", tab.mode)
      .eq("is_daily", tab.isDaily)
      .order("wins", { ascending: false })
      .order("losses", { ascending: true })
      .order("team_rating_out_of_100", { ascending: false })
      .limit(50)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        setLoadedKey(tab.key);
        if (fetchError) setError(fetchError.message);
        else {
          setError(null);
          setRows(data ?? []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tab.key, tab.view, tab.mode, tab.isDaily]);

  const isLoading = loadedKey !== tab.key;

  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-1">Leaderboard</h1>
      <p className="text-foreground-muted mb-6">Best season record per player, updated as results come in.</p>

      {!isSupabaseConfigured ? (
        <p className="text-sm text-foreground-muted">
          Leaderboards need an account.{" "}
          <Link href="/settings" className="text-accent underline underline-offset-4">
            This isn&apos;t turned on yet
          </Link>{" "}
          — check back soon.
        </p>
      ) : (
        <>
          <div className="mb-6 flex gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTabKey(t.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  t.key === tabKey
                    ? "bg-accent text-[#04120d]"
                    : "bg-background-elevated text-foreground-muted border border-border hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          {!error && isLoading && <p className="text-sm text-foreground-muted">Loading…</p>}

          {!isLoading && rows !== null && rows.length === 0 && (
            <p className="text-sm text-foreground-muted">No results yet for {tab.label} — be the first.</p>
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground-muted">Rating {row.team_rating_out_of_100}</span>
                    <Badge variant={row.unbeaten ? "accent" : "default"}>
                      {row.wins}-{row.losses}
                    </Badge>
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
