"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PosterShell } from "@/components/brand/PosterShell";
import { useGameStore } from "@/lib/store/gameStore";
import { getPlayerById } from "@/lib/data/players";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { track } from "@/lib/analytics";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background-elevated px-3 py-3 text-center">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
        {label}
      </p>
    </div>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const seed = useGameStore((s) => s.seed);
  const mode = useGameStore((s) => s.mode);
  const stats = useGameStore((s) => s.seasonStats);
  const matches = useGameStore((s) => s.matchResults);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const lookupPlayer = mode === "all-time-real" ? getRealPlayerById : getPlayerById;
  const [copied, setCopied] = useState(false);

  const shareText = useMemo(() => {
    if (!stats) return "";
    const record = `${stats.wins}-${stats.losses}`;
    return stats.losses === 0
      ? `MY XI WENT ${record} — UNBEATEN ALL SEASON.\nCan you go 14-0? Draft your XI in 14-0: Build the Unbeaten XI.`
      : `MY XI FINISHED ${record}.\nCan you go 14-0? Draft your XI in 14-0: Build the Unbeaten XI.`;
  }, [stats]);

  if (!hasHydrated) return null;

  if (!seed || !stats) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted mb-4">No season result yet.</p>
        <Link href="/play">
          <Button>Start a Draft</Button>
        </Link>
      </main>
    );
  }

  const mvp = lookupPlayer(stats.mvpPlayerId);
  const runScorer = lookupPlayer(stats.leadingRunScorer.playerId);
  const wicketTaker = lookupPlayer(stats.leadingWicketTaker.playerId);
  const bestPick = lookupPlayer(stats.bestPickPlayerId);
  const weakestPick = lookupPlayer(stats.weakestPickPlayerId);
  const unbeaten = stats.losses === 0;

  async function handleShare() {
    if (stats) track("result_shared", { mode, wins: stats.wins, losses: stats.losses, unbeaten });
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: shareText, title: "14-0: Build the Unbeaten XI" });
        return;
      } catch {
        // user cancelled the share sheet; fall through to clipboard copy
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handlePlayAgain() {
    startNewGame({ mode });
    router.push("/draft");
  }

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker={unbeaten ? "Unbeaten Season" : "Season Complete"}>
        <div className="text-center">
          <p className="text-sm font-bold tracking-[0.35em] text-saffron uppercase mb-1">
            Final Record
          </p>
          <h1 className="text-stack-shadow text-7xl font-black italic tracking-tight sm:text-8xl">
            {stats.wins}-{stats.losses}
          </h1>
          <p
            className={`text-stack-shadow -mt-1 text-2xl font-black italic tracking-tight sm:text-3xl ${
              unbeaten ? "text-accent" : "text-foreground"
            }`}
          >
            {unbeaten ? "UNBEATEN XI" : "SEASON COMPLETE"}
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            Better than {stats.percentile}% of simulated managers
          </p>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-2">
          <StatTile label="Team Rating" value={String(stats.teamRatingOutOf100)} />
          <StatTile label="Net Run Rate" value={stats.netRunRate.toFixed(2)} />
          <StatTile label="Highest Score" value={String(stats.highestScore)} />
          <StatTile label="Best Chase" value={stats.bestChase !== null ? String(stats.bestChase) : "—"} />
          <StatTile
            label="Lowest Defended"
            value={stats.lowestDefendedScore !== null ? String(stats.lowestDefendedScore) : "—"}
          />
          <StatTile label="Runs For" value={String(stats.totalRunsFor)} />
        </div>

        <div className="mt-6 grid gap-2">
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">Orange Cap &middot; Leading Run Scorer</span>
              <span className="font-semibold">
                {runScorer?.name ?? "—"} <span className="text-foreground-muted">({stats.leadingRunScorer.runs})</span>
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">Purple Cap &middot; Leading Wicket Taker</span>
              <span className="font-semibold">
                {wicketTaker?.name ?? "—"}{" "}
                <span className="text-foreground-muted">({stats.leadingWicketTaker.wickets})</span>
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">Most Valuable Player</span>
              <span className="font-semibold">{mvp?.name ?? "—"}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">Best Draft Pick</span>
              <span className="font-semibold">{bestPick?.name ?? "—"}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground-muted">Weakest Selection</span>
              <span className="font-semibold">{weakestPick?.name ?? "—"}</span>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={handleShare} className="w-full sm:w-auto">
            {copied ? "Copied!" : "Share Result"}
          </Button>
          <Button size="lg" variant="secondary" onClick={handlePlayAgain} className="w-full sm:w-auto">
            Play Again
          </Button>
        </div>

        <h2 className="mt-10 mb-3 text-lg font-bold tracking-tight">Match Log</h2>
        <div className="grid gap-2">
          {matches.map((m) => (
            <div
              key={m.matchNumber}
              className="rounded-xl border border-border bg-background-elevated px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground-muted">
                  Match {m.matchNumber} &middot; vs {m.opponent}
                </span>
                <Badge variant={m.result === "win" ? "accent" : "danger"}>
                  {m.result === "win" ? "W" : "L"} &middot; {m.margin}
                </Badge>
              </div>
              <p className="mt-1 text-sm">{m.summary}</p>
              {m.decision && (
                <p className="mt-1 text-xs text-gold">{m.decision.resultLabel}</p>
              )}
              <p className="mt-1 text-xs text-foreground-muted">
                {m.pitch} &middot; {m.city}
              </p>
            </div>
          ))}
        </div>
      </PosterShell>
    </main>
  );
}
