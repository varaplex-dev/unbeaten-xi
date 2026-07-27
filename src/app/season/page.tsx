"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PosterShell } from "@/components/brand/PosterShell";
import { useGameStore } from "@/lib/store/gameStore";
import { useGameDataReady } from "@/lib/data/useGameData";
import { matchesFor } from "@/lib/engine/competitions";

export default function SeasonPage() {
  const router = useRouter();
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const seed = useGameStore((s) => s.seed);
  const stage = useGameStore((s) => s.stage);
  const matchResults = useGameStore((s) => s.matchResults);
  const pendingDecision = useGameStore((s) => s.pendingDecision);
  const runSeasonSimulation = useGameStore((s) => s.runSeasonSimulation);
  const resolveDecision = useGameStore((s) => s.resolveDecision);
  const competition = useGameStore((s) => s.competition);
  // The sim resolves the drafted XI (and its opponents) through the lazily
  // loaded player dataset. Kicking it off before that's ready makes getXi()
  // return empty and the whole run silently no-op — so wait for dataReady,
  // which also re-fires this effect once the data lands (e.g. on a refresh
  // straight to /season).
  const dataReady = useGameDataReady();

  useEffect(() => {
    if (!hasHydrated || !seed || !dataReady) return;
    if (matchResults.length === 0 && !pendingDecision) {
      runSeasonSimulation();
    }
    // Only kick off on first mount / when there's genuinely nothing simulated yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, seed, dataReady]);

  useEffect(() => {
    if (hasHydrated && stage === "results") router.replace("/results");
  }, [hasHydrated, stage, router]);

  if (!hasHydrated) return null;

  if (!seed) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted mb-4">No active season.</p>
        <Link href="/play">
          <Button>Start a Draft</Button>
        </Link>
      </main>
    );
  }

  // Was `Math.min(matchResults.length, SQUAD_SIZE + 3) / SQUAD_SIZE` — an
  // 11-player squad size doubling as a 14-match season length, which also let
  // the bar run past 100%. Progress is simply matches played over matches to
  // play, and follows the competition.
  const seasonMatches = matchesFor(competition);
  const progress = Math.min(matchResults.length / seasonMatches, 1);

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker="Season In Progress">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center py-12">
          <p className="text-sm font-bold tracking-[0.35em] text-saffron uppercase mb-2">
            Simulating
          </p>
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-6">
            Match {Math.min(matchResults.length + 1, seasonMatches)} of {seasonMatches}
          </h1>

          <div className="mb-10 h-1.5 w-full max-w-sm rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full bg-accent"
              initial={false}
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
          </div>

          {pendingDecision ? (
            <motion.div
              key={pendingDecision.matchNumber}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-sm rounded-2xl border border-gold/30 bg-background-elevated p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gold mb-1">
                {pendingDecision.context}
              </p>
              <p className="mb-4 text-lg font-bold leading-snug">{pendingDecision.prompt}</p>
              <div className="grid gap-2">
                {pendingDecision.options.map((option) => (
                  <Button
                    key={option.id}
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={() => resolveDecision(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </motion.div>
          ) : (
            <p className="text-foreground-muted">Crunching the numbers...</p>
          )}
        </div>
      </PosterShell>
    </main>
  );
}
