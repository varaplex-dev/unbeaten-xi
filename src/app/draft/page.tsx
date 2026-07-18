"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PlayerCard } from "@/components/draft/PlayerCard";
import { PosterShell } from "@/components/brand/PosterShell";
import { Button } from "@/components/ui/button";
import { generateDraftRound, generateImpactPlayerOptions, computeRosterNeeds } from "@/lib/engine/draft";
import { SQUAD_SIZE } from "@/lib/types";
import { useDraftedPlayers, useGameStore } from "@/lib/store/gameStore";
import { PLAYERS } from "@/lib/data/players";
import { REAL_PLAYERS } from "@/lib/data/realPlayers";
import { getEraTeamById } from "@/lib/data/eraTeams";
import { track } from "@/lib/analytics";

export default function DraftPage() {
  const router = useRouter();
  const seed = useGameStore((s) => s.seed);
  const mode = useGameStore((s) => s.mode);
  const stage = useGameStore((s) => s.stage);
  const eraTeamId = useGameStore((s) => s.eraTeamId);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const draftPicks = useGameStore((s) => s.draftPicks);
  const draftPlayer = useGameStore((s) => s.draftPlayer);
  const pickImpactPlayer = useGameStore((s) => s.pickImpactPlayer);
  const skipImpactPlayer = useGameStore((s) => s.skipImpactPlayer);
  const draftedPlayers = useDraftedPlayers();
  const eraTeam = eraTeamId ? getEraTeamById(eraTeamId) : null;
  // A spun Era Team's impact-player options must come from that same
  // squad, not the full cross-country pool — otherwise "pick a bonus
  // player" could hand you someone who was never on the revealed team.
  const pool = eraTeam ? eraTeam.players : mode === "all-time-real" ? REAL_PLAYERS : PLAYERS;

  useEffect(() => {
    if (hasHydrated && !seed) router.replace("/play");
  }, [hasHydrated, seed, router]);

  useEffect(() => {
    if (hasHydrated && seed && stage === "team-setup") router.replace("/team-setup");
  }, [hasHydrated, seed, stage, router]);

  useEffect(() => {
    if (hasHydrated && seed && stage === "squad-select") router.replace("/squad-select");
  }, [hasHydrated, seed, stage, router]);

  const roundNumber = draftPicks.length + 1;

  const round = useMemo(() => {
    if (!seed || stage !== "draft") return null;
    return generateDraftRound({ seed, roundNumber, draftedSoFar: draftedPlayers, pool });
  }, [seed, roundNumber, draftedPlayers, stage, pool]);

  const impactOptions = useMemo(() => {
    if (!seed || stage !== "impact-player") return null;
    return generateImpactPlayerOptions(seed, draftedPlayers, pool);
  }, [seed, stage, draftedPlayers, pool]);

  const needs = useMemo(() => computeRosterNeeds(draftedPlayers), [draftedPlayers]);

  useEffect(() => {
    if (round) track("draft_round_viewed", { roundNumber: round.roundNumber, categoryId: round.category.id });
  }, [round]);

  if (!hasHydrated || !seed) return null;

  if (stage === "impact-player" && impactOptions) {
    return (
      <main className="flex-1 flex flex-col">
        <PosterShell kicker="Impact Player">
          <div className="mx-auto w-full max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase mb-1">
              One Bonus Pick
            </p>
            <h1 className="text-stack-shadow text-3xl font-black italic tracking-tight mb-1">
              Pick Your Impact Player
            </h1>
            <p className="text-foreground-muted mb-6">
              A substitute you can bring on mid-match for a spark — usually a
              finisher or a death-overs specialist.
            </p>

            <div className="grid gap-3">
              {impactOptions.map((player) => (
                <PlayerCard key={player.id} player={player} onSelect={() => pickImpactPlayer(player)} />
              ))}
            </div>

            <Button
              variant="ghost"
              className="mt-4 w-full"
              onClick={skipImpactPlayer}
            >
              Skip — no Impact Player this season
            </Button>
          </div>
        </PosterShell>
      </main>
    );
  }

  if (!round) return null;

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell
        kicker={mode === "all-time-real" ? "All-Time XI Draft" : "Drafting"}
        digits={[
          { value: String(roundNumber), label: "Round" },
          { value: String(SQUAD_SIZE - draftPicks.length), label: "To Go" },
        ]}
      >
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full bg-accent"
              initial={false}
              animate={{ width: `${(draftPicks.length / SQUAD_SIZE) * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.section
              key={roundNumber}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase mb-1">
                Draft Category
              </p>
              <h1 className="text-stack-shadow text-3xl font-black italic tracking-tight mb-1">
                {round.category.label}
              </h1>
              <p className="text-foreground-muted mb-6">{round.category.description}</p>

              <div className="grid gap-3">
                {round.options.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    onSelect={() => draftPlayer(player, round.category.id)}
                  />
                ))}
              </div>
            </motion.section>
          </AnimatePresence>

          <footer className="mt-8 pt-6 border-t border-border text-xs text-foreground-muted space-y-1">
            <p>
              Still needed: {needs.wicketkeepersNeeded > 0 && "wicketkeeper · "}
              {needs.paceBowlersNeeded > 0 && "pace bowler · "}
              {needs.spinnersNeeded > 0 && "spinner · "}
              {needs.bowlingOptionsNeeded > 0 &&
                `${needs.bowlingOptionsNeeded} more bowling option(s) · `}
              {needs.overseasSlotsRemaining < 4 &&
                `${needs.overseasSlotsRemaining} overseas slot(s) left`}
            </p>
          </footer>
        </div>
      </PosterShell>
    </main>
  );
}
