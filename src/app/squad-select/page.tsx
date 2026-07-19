"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlayerCard } from "@/components/draft/PlayerCard";
import { SpinReel } from "@/components/draft/SpinReel";
import { SquadField } from "@/components/draft/SquadField";
import { PosterShell } from "@/components/brand/PosterShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGameStore } from "@/lib/store/gameStore";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { getEraTeamById, pickNextEraTeam } from "@/lib/data/eraTeams";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { getLegendPlayerById } from "@/lib/data/legendPlayers";
import { SQUAD_SIZE, type EraTeam, type Player } from "@/lib/types";

function resolvePlayer(id: string): Player | null {
  return getRealPlayerById(id) ?? getLegendPlayerById(id) ?? null;
}

export default function SquadSelectPage() {
  const router = useRouter();
  const seed = useGameStore((s) => s.seed);
  const mode = useGameStore((s) => s.mode);
  const stage = useGameStore((s) => s.stage);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const eraTeamId = useGameStore((s) => s.eraTeamId);
  const usedEraTeamIds = useGameStore((s) => s.usedEraTeamIds);
  const draftPicks = useGameStore((s) => s.draftPicks);
  const squadSlots = useGameStore((s) => s.squadSlots);
  const pendingPlayerId = useGameStore((s) => s.pendingPlayerId);
  const impactPlayerId = useGameStore((s) => s.impactPlayerId);
  const spinNextTeam = useGameStore((s) => s.spinNextTeam);
  const selectSquadPlayer = useGameStore((s) => s.selectSquadPlayer);
  const placeSquadPlayer = useGameStore((s) => s.placeSquadPlayer);
  const pickImpactPlayer = useGameStore((s) => s.pickImpactPlayer);
  const skipImpactPlayer = useGameStore((s) => s.skipImpactPlayer);
  const hardcoreMode = useGameStore((s) => s.hardcoreMode);
  const { t } = useTranslation();

  const [spinTarget, setSpinTarget] = useState<EraTeam | null>(null);

  const eraTeam = eraTeamId ? getEraTeamById(eraTeamId) : null;
  const filledCount = useMemo(() => squadSlots.filter((id) => id !== null).length, [squadSlots]);
  const draftedIds = useMemo(
    () => new Set([...squadSlots.filter((id): id is string => id !== null), ...(pendingPlayerId ? [pendingPlayerId] : [])]),
    [squadSlots, pendingPlayerId]
  );
  const squadComplete = draftPicks.length >= SQUAD_SIZE;
  const impactResolved = impactPlayerId !== null;
  const impactPlayer: Player | null = impactPlayerId ? resolvePlayer(impactPlayerId) : null;
  // The same real player can appear under different ids across pools (a
  // legend entry vs a franchise-season entry), so dedupe by name too —
  // otherwise a player drafted from, say, Sri Lanka could be re-picked from
  // a club side. Includes the pending pick and the Impact Player.
  const draftedNames = useMemo(() => {
    const ids = [
      ...squadSlots.filter((id): id is string => id !== null),
      ...(pendingPlayerId ? [pendingPlayerId] : []),
      ...(impactPlayerId ? [impactPlayerId] : []),
    ];
    return new Set(ids.map((id) => resolvePlayer(id)?.name).filter((n): n is string => Boolean(n)));
  }, [squadSlots, pendingPlayerId, impactPlayerId]);
  const pendingPlayer: Player | null = pendingPlayerId ? resolvePlayer(pendingPlayerId) : null;
  const fieldSlots: (Player | null)[] = useMemo(
    () => squadSlots.map((id) => (id ? resolvePlayer(id) : null)),
    [squadSlots]
  );

  useEffect(() => {
    if (hasHydrated && !seed) router.replace("/play");
  }, [hasHydrated, seed, router]);

  useEffect(() => {
    if (hasHydrated && seed && stage === "team-setup") router.replace("/team-setup");
  }, [hasHydrated, seed, stage, router]);

  if (!hasHydrated || !seed) return null;

  // A spin-drafted game always sets mode to "all-time-real" before this page
  // is reachable — anything else means the user landed here without ever
  // spinning (e.g. a stale category-draft session), not mid-flow.
  if (mode !== "all-time-real") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted mb-4">No spin started yet.</p>
        <Link href="/play">
          <Button>Back to Modes</Button>
        </Link>
      </main>
    );
  }

  const roundLabel = squadComplete ? "Impact Player" : `Pick ${filledCount + 1} of ${SQUAD_SIZE}`;

  function handleSpinClick() {
    if (!seed) return;
    // Compute the landing team up front (pure, no store write) so the reel
    // has a real answer to animate toward; the store only commits it once
    // the animation finishes, via handleSpinComplete below.
    setSpinTarget(pickNextEraTeam(seed, usedEraTeamIds));
  }

  function handleSpinComplete() {
    setSpinTarget(null);
    spinNextTeam();
  }

  function handlePick(player: Parameters<typeof selectSquadPlayer>[0]) {
    if (squadComplete) {
      pickImpactPlayer(player);
    } else {
      selectSquadPlayer(player);
    }
  }

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker="Spin & Pick" digits={[{ value: String(filledCount), label: `Of ${SQUAD_SIZE} Picked` }]}>
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase mb-1">{roundLabel}</p>
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">
            {squadComplete ? "One Bonus Pick" : "Every Pick, A Different Team"}
          </h1>
          <p className="text-foreground-muted mb-6">
            {squadComplete
              ? "Spin one more time for a shot at an Impact Player — or skip it and lock in your XI."
              : "Spin the wheel, land on a real team, pick a player from it — then place them in your batting order. Where you put them matters."}
          </p>

          <div className="mb-6 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(filledCount / SQUAD_SIZE) * 100}%` }}
            />
          </div>

          {hardcoreMode && (
            <div className="mb-6 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3">
              <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">{t("hardcore.label")}</p>
              <p className="mt-1 text-sm text-foreground-muted">{t("hardcore.noStatsBanner")}</p>
            </div>
          )}

          {spinTarget ? (
            <SpinReel target={spinTarget} onComplete={handleSpinComplete} />
          ) : pendingPlayer ? (
            <div className="mb-6 flex flex-col items-center gap-1 rounded-2xl border border-accent/40 bg-accent/5 py-10 text-center">
              <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Placing</p>
              <p className="text-2xl font-black italic tracking-tight">{pendingPlayer.name}</p>
              <p className="mt-1 max-w-xs text-sm text-foreground-muted">
                Tap an open slot on the field below to set their spot in the batting order.
              </p>
            </div>
          ) : !eraTeam ? (
            <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
              <p className="text-foreground-muted">
                {squadComplete
                  ? "Spin for a team to draw your Impact Player from."
                  : `Spin for the team your ${filledCount === 0 ? "first" : "next"} pick comes from.`}
              </p>
              <Button size="lg" onClick={handleSpinClick}>
                Spin
              </Button>
              {squadComplete && (
                <Button variant="ghost" onClick={skipImpactPlayer}>
                  Skip — no Impact Player this season
                </Button>
              )}
            </div>
          ) : (
            <div className="mb-6">
              <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
                <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">{eraTeam.eraLabel}</p>
                <p className="text-lg font-bold leading-tight">{eraTeam.name}</p>
                <p className="text-xs text-foreground-muted mt-0.5">{eraTeam.tagline}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Show the roster strongest-first (by overall rating), the
                    way 82-0 lists a team's players best-to-worst. */}
                {[...eraTeam.players]
                  .sort((a, b) => b.overallRating - a.overallRating)
                  .map((player) => {
                    const alreadyDrafted =
                      draftedIds.has(player.id) || draftedNames.has(player.name) || player.id === impactPlayerId;
                    return (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        disabled={alreadyDrafted}
                        hideStats={hardcoreMode}
                        onSelect={() => handlePick(player)}
                      />
                    );
                  })}
              </div>
            </div>
          )}

          <SquadField
            slots={fieldSlots}
            placing={pendingPlayerId !== null}
            pendingPlayer={pendingPlayer}
            suggest={!hardcoreMode}
            onSlotClick={(index) => placeSquadPlayer(index)}
            impactPlayer={impactPlayer}
            impactActive={squadComplete && !impactResolved}
          />

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
