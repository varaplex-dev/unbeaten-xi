"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlayerCard } from "@/components/draft/PlayerCard";
import { PosterShell } from "@/components/brand/PosterShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDraftedPlayers, useGameStore } from "@/lib/store/gameStore";
import { getEraTeamById } from "@/lib/data/eraTeams";
import { SQUAD_SIZE } from "@/lib/types";

export default function SquadSelectPage() {
  const router = useRouter();
  const seed = useGameStore((s) => s.seed);
  const stage = useGameStore((s) => s.stage);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const eraTeamId = useGameStore((s) => s.eraTeamId);
  const usedEraTeamIds = useGameStore((s) => s.usedEraTeamIds);
  const draftPicks = useGameStore((s) => s.draftPicks);
  const impactPlayerId = useGameStore((s) => s.impactPlayerId);
  const spinNextTeam = useGameStore((s) => s.spinNextTeam);
  const selectSquadPlayer = useGameStore((s) => s.selectSquadPlayer);
  const pickImpactPlayer = useGameStore((s) => s.pickImpactPlayer);
  const skipImpactPlayer = useGameStore((s) => s.skipImpactPlayer);

  const eraTeam = eraTeamId ? getEraTeamById(eraTeamId) : null;
  const draftedPlayers = useDraftedPlayers();
  const draftedIds = useMemo(() => new Set(draftPicks.map((p) => p.playerId)), [draftPicks]);
  const squadComplete = draftPicks.length >= SQUAD_SIZE;
  const impactResolved = impactPlayerId !== null;

  useEffect(() => {
    if (hasHydrated && !seed) router.replace("/play");
  }, [hasHydrated, seed, router]);

  useEffect(() => {
    if (hasHydrated && seed && stage === "team-setup") router.replace("/team-setup");
  }, [hasHydrated, seed, stage, router]);

  if (!hasHydrated || !seed) return null;

  if (usedEraTeamIds.length === 0 && draftPicks.length === 0 && !eraTeamId) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted mb-4">No spin started yet.</p>
        <Link href="/play">
          <Button>Back to Modes</Button>
        </Link>
      </main>
    );
  }

  const roundLabel = squadComplete ? "Impact Player" : `Pick ${draftPicks.length + 1} of ${SQUAD_SIZE}`;

  function handlePick(player: Parameters<typeof selectSquadPlayer>[0]) {
    if (squadComplete) {
      pickImpactPlayer(player);
    } else {
      selectSquadPlayer(player);
    }
  }

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell
        kicker="Spin & Pick"
        digits={[{ value: String(draftPicks.length), label: `Of ${SQUAD_SIZE} Picked` }]}
      >
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase mb-1">{roundLabel}</p>
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">
            {squadComplete ? "One Bonus Pick" : "Every Pick, A Different Team"}
          </h1>
          <p className="text-foreground-muted mb-6">
            {squadComplete
              ? "Spin one more time for a shot at an Impact Player — or skip it and lock in your XI."
              : "Spin the wheel, land on a real team, pick exactly one player from it — then spin again for a fresh team. No two picks come from the same squad."}
          </p>

          <div className="mb-4 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(draftPicks.length / SQUAD_SIZE) * 100}%` }}
            />
          </div>

          {draftedPlayers.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-1.5">
              {draftedPlayers.map((player, i) => (
                <Badge key={player.id} variant="accent">
                  {i + 1}. {player.shortName}
                </Badge>
              ))}
            </div>
          )}

          {!eraTeam ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
              <p className="text-foreground-muted">
                {squadComplete
                  ? "Spin for a team to draw your Impact Player from."
                  : `Spin for the team your ${draftPicks.length === 0 ? "first" : "next"} pick comes from.`}
              </p>
              <Button size="lg" onClick={spinNextTeam}>
                Spin the Wheel
              </Button>
              {squadComplete && (
                <Button variant="ghost" onClick={skipImpactPlayer}>
                  Skip — no Impact Player this season
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
                <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">{eraTeam.eraLabel}</p>
                <p className="text-lg font-bold leading-tight">{eraTeam.name}</p>
                <p className="text-xs text-foreground-muted mt-0.5">{eraTeam.tagline}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {eraTeam.players.map((player) => {
                  const alreadyDrafted = draftedIds.has(player.id) || player.id === impactPlayerId;
                  return (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      disabled={alreadyDrafted}
                      onSelect={() => handlePick(player)}
                    />
                  );
                })}
              </div>
            </>
          )}

          {squadComplete && impactResolved && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Badge variant="accent">Squad complete — moving to team setup</Badge>
            </div>
          )}
        </div>
      </PosterShell>
    </main>
  );
}
