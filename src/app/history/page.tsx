"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/store/authStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

interface HistoryRow {
  id: string;
  mode: "fictional" | "all-time-real";
  is_daily: boolean;
  wins: number;
  losses: number;
  unbeaten: boolean;
  team_rating_out_of_100: number;
  created_at: string;
}

function modeLabel(row: HistoryRow): string {
  if (row.is_daily) return "Daily Challenge";
  return row.mode === "all-time-real" ? "All-Time XI" : "Fictional";
}

export default function HistoryPage() {
  const hasLoaded = useAuthStore((s) => s.hasLoaded);
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user) return;
    let cancelled = false;

    supabase
      .from("season_results")
      .select("id, mode, is_daily, wins, losses, unbeaten, team_rating_out_of_100, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        setLoadedForUserId(user.id);
        if (fetchError) setError(fetchError.message);
        else {
          setError(null);
          setRows(data ?? []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isLoading = user !== null && loadedForUserId !== user.id;

  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-1">My History</h1>
      <p className="text-foreground-muted mb-6">Every season you&apos;ve saved to your account.</p>

      {!isSupabaseConfigured ? (
        <p className="text-sm text-foreground-muted">
          History needs an account.{" "}
          <Link href="/settings" className="text-accent underline underline-offset-4">
            This isn&apos;t turned on yet
          </Link>{" "}
          — check back soon.
        </p>
      ) : !hasLoaded ? null : !user ? (
        <p className="text-sm text-foreground-muted">
          <Link href="/settings" className="text-accent underline underline-offset-4">
            Sign in
          </Link>{" "}
          to see your saved seasons.
        </p>
      ) : (
        <>
          {error && <p className="text-sm text-danger">{error}</p>}

          {!error && isLoading && <p className="text-sm text-foreground-muted">Loading…</p>}

          {!isLoading && rows !== null && rows.length === 0 && (
            <p className="text-sm text-foreground-muted">
              No saved seasons yet.{" "}
              <Link href="/play" className="text-accent underline underline-offset-4">
                Start a draft
              </Link>{" "}
              to get on the board.
            </p>
          )}

          {!isLoading && rows !== null && rows.length > 0 && (
            <ol className="grid gap-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{modeLabel(row)}</p>
                    <p className="text-xs text-foreground-muted">
                      {new Date(row.created_at).toLocaleDateString()} &middot; Rating {row.team_rating_out_of_100}
                    </p>
                  </div>
                  <Badge variant={row.unbeaten ? "accent" : "default"}>
                    {row.wins}-{row.losses}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}
