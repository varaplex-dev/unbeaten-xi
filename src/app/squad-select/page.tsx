"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlayerCard } from "@/components/draft/PlayerCard";
import { PosterShell } from "@/components/brand/PosterShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGameStore } from "@/lib/store/gameStore";
import { getEraTeamById } from "@/lib/data/eraTeams";
import { SQUAD_SIZE } from "@/lib/types";

export default function SquadSelectPage() {
  const router = useRouter();
  const seed = useGameStore((s) => s.seed);
  const stage = useGameStore((s) => s.stage);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const eraTeamId = useGameStore((s) => s.eraTeamId);
  const draftPicks = useGameStore((s) => s.draftPicks);
  const selectSquadPlayer = useGameStore((s) => s.selectSquadPlayer);
  const deselectSquadPlayer = useGameStore((s) => s.deselectSquadPlayer);

  const eraTeam = eraTeamId ? getEraTeamById(eraTeamId) : null;
  const selectedIds = useMemo(() => new Set(draftPicks.map((p) => p.playerId)), [draftPicks]);

  useEffect(() => {
    if (hasHydrated && !seed) router.replace("/play");
  }, [hasHydrated, seed, router]);

  useEffect(() => {
    if (hasHydrated && seed && stage === "impact-player") router.replace("/draft");
  }, [hasHydrated, seed, stage, router]);

  useEffect(() => {
    if (hasHydrated && seed && stage === "team-setup") router.replace("/team-setup");
  }, [hasHydrated, seed, stage, router]);

  if (!hasHydrated || !seed) return null;

  if (!eraTeam) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted mb-4">No team spun yet.</p>
        <Link href="/play">
          <Button>Back to Modes</Button>
        </Link>
      </main>
    );
  }

  const remaining = SQUAD_SIZE - draftPicks.length;

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell
        kicker={eraTeam.isHistoric ? "Historic Squad" : "Current Squad"}
        digits={[{ value: String(draftPicks.length), label: `Of ${SQUAD_SIZE} Picked` }]}
      >
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase mb-1">
            {eraTeam.eraLabel}
          </p>
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">
            {eraTeam.name}
          </h1>
          <p className="text-foreground-muted mb-2">{eraTeam.tagline}</p>
          <p className="text-sm text-foreground-muted mb-6">
            {`Pick exactly ${SQUAD_SIZE} from this squad to form your XI — you're in full control of who makes the cut. ${
              remaining > 0 ? `${remaining} to go.` : "Squad complete."
            }`}
          </p>

          <div className="mb-4 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(draftPicks.length / SQUAD_SIZE) * 100}%` }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {eraTeam.players.map((player) => {
              const isSelected = selectedIds.has(player.id);
              return (
                <PlayerCard
                  key={player.id}
                  player={player}
                  selected={isSelected}
                  disabled={!isSelected && draftPicks.length >= SQUAD_SIZE}
                  onSelect={() => (isSelected ? deselectSquadPlayer(player.id) : selectSquadPlayer(player))}
                />
              );
            })}
          </div>

          {draftPicks.length === SQUAD_SIZE && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Badge variant="accent">Squad complete — moving to Impact Player</Badge>
            </div>
          )}
        </div>
      </PosterShell>
    </main>
  );
}
