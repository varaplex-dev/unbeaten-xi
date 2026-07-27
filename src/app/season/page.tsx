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
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n";
import type { DecisionType, DecisionOptionKind } from "@/lib/engine/simulate";

/** Fills {placeholders} in a translated string. */
function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template
  );
}

// Engine decision `type`/option `kind` → the translated prompt/context/option.
const DEC_PROMPT_KEY: Record<DecisionType, TranslationKey> = {
  "defend-bowler": "sim.dec.defendPrompt",
  "impact-player": "sim.dec.impactPrompt",
  "pace-or-spin": "sim.dec.paceSpinPrompt",
};
const DEC_CONTEXT_KEY: Record<DecisionType, TranslationKey> = {
  "defend-bowler": "sim.dec.defendContext",
  "impact-player": "sim.dec.impactContext",
  "pace-or-spin": "sim.dec.paceSpinContext",
};
const DEC_OPTION_KEY: Record<DecisionOptionKind, TranslationKey> = {
  pace: "sim.dec.optPace",
  spin: "sim.dec.optSpin",
  activate: "sim.dec.optActivate",
  hold: "sim.dec.optHold",
};

export default function SeasonPage() {
  const { t } = useTranslation();
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
        <p className="text-foreground-muted mb-4">{t("sim.noSeason")}</p>
        <Link href="/play">
          <Button>{t("res.startDraft")}</Button>
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
      <PosterShell kicker={t("sim.seasonInProgress")}>
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center py-12">
          <p className="text-sm font-bold tracking-[0.35em] text-saffron uppercase mb-2">
            {t("sim.simulating")}
          </p>
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-6">
            {fill(t("sim.matchOf"), {
              n: Math.min(matchResults.length + 1, seasonMatches),
              total: seasonMatches,
            })}
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
                {fill(t(DEC_CONTEXT_KEY[pendingDecision.type]), { n: pendingDecision.matchNumber })}
              </p>
              <p className="mb-4 text-lg font-bold leading-snug">
                {fill(t(DEC_PROMPT_KEY[pendingDecision.type]), { name: pendingDecision.subjectName ?? "" })}
              </p>
              <div className="grid gap-2">
                {pendingDecision.options.map((option) => (
                  <Button
                    key={option.id}
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={() => resolveDecision(option.id)}
                  >
                    {option.kind
                      ? fill(t(DEC_OPTION_KEY[option.kind]), { name: pendingDecision.subjectName ?? "" })
                      : option.label}
                  </Button>
                ))}
              </div>
            </motion.div>
          ) : (
            <p className="text-foreground-muted">{t("sim.crunching")}</p>
          )}
        </div>
      </PosterShell>
    </main>
  );
}
