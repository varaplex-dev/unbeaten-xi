"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Star, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { PosterShell } from "@/components/brand/PosterShell";
import { useDraftedPlayers, useGameStore } from "@/lib/store/gameStore";
import type { BowlingPhase } from "@/lib/engine/lineup";
import { computeTeamRatings } from "@/lib/engine/teamRatings";
import { checkComposition } from "@/lib/engine/draft";
import { SQUAD_SIZE, canBowl, isWicketkeeper } from "@/lib/types";
import { getPlayerById } from "@/lib/data/players";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const BOWLING_PHASE_CYCLE: BowlingPhase[] = ["powerplay", "middle", "death"];

export default function TeamSetupPage() {
  const router = useRouter();
  const seed = useGameStore((s) => s.seed);
  const mode = useGameStore((s) => s.mode);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const draftPicks = useGameStore((s) => s.draftPicks);
  const battingOrder = useGameStore((s) => s.battingOrder);
  const captainId = useGameStore((s) => s.captainId);
  const wicketkeeperId = useGameStore((s) => s.wicketkeeperId);
  const impactPlayerId = useGameStore((s) => s.impactPlayerId);
  const bowlingRoleAssignments = useGameStore((s) => s.bowlingRoleAssignments);
  const autoBuildLineup = useGameStore((s) => s.autoBuildLineup);
  const moveBattingOrderItem = useGameStore((s) => s.moveBattingOrderItem);
  const setCaptain = useGameStore((s) => s.setCaptain);
  const setWicketkeeper = useGameStore((s) => s.setWicketkeeper);
  const setBowlingRole = useGameStore((s) => s.setBowlingRole);
  const drafted = useDraftedPlayers();
  const impactPlayer = impactPlayerId
    ? (mode === "all-time-real" ? getRealPlayerById(impactPlayerId) : getPlayerById(impactPlayerId))
    : null;

  const isSquadComplete = draftPicks.length === SQUAD_SIZE;

  useEffect(() => {
    if (hasHydrated && isSquadComplete && battingOrder.length === 0) {
      autoBuildLineup();
    }
  }, [hasHydrated, isSquadComplete, battingOrder.length, autoBuildLineup]);

  const orderedXi = useMemo(() => {
    if (battingOrder.length === 0) return drafted;
    return battingOrder
      .map((id) => drafted.find((p) => p.id === id))
      .filter((p): p is (typeof drafted)[number] => Boolean(p));
  }, [battingOrder, drafted]);

  const ratings = useMemo(() => {
    if (orderedXi.length !== SQUAD_SIZE) return null;
    const captain = orderedXi.find((p) => p.id === captainId) ?? null;
    return computeTeamRatings(orderedXi, orderedXi, captain);
  }, [orderedXi, captainId]);

  const composition = useMemo(
    () => (orderedXi.length === SQUAD_SIZE ? checkComposition(orderedXi) : null),
    [orderedXi]
  );

  if (!hasHydrated) return null;

  if (!seed || !isSquadComplete) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted mb-4">No completed draft yet.</p>
        <Link href="/play">
          <Button>Start a Draft</Button>
        </Link>
      </main>
    );
  }

  function handleSimulate() {
    track("lineup_completed", { mode, captainId, wicketkeeperId, impactPlayerId });
    router.push("/season");
  }

  function cycleBowlingRole(playerId: string) {
    const current = bowlingRoleAssignments[playerId];
    const currentIndex = current ? BOWLING_PHASE_CYCLE.indexOf(current) : -1;
    const next = BOWLING_PHASE_CYCLE[(currentIndex + 1) % BOWLING_PHASE_CYCLE.length];
    setBowlingRole(playerId, next);
  }

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell
        kicker="Your XI"
        digits={ratings ? [{ value: String(ratings.overallRating), label: "Team Rating" }] : []}
      >
        <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">
          Ready For Game Day
        </h1>
        <p className="text-foreground-muted mb-6">
          We&apos;ve set a lineup automatically — reorder the batting order,
          change your captain, keeper, or bowling roles below, then simulate
          when you&apos;re ready.
        </p>

        {composition && !composition.legal && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {composition.issues.map((issue) => (
              <p key={issue.code}>{issue.message}</p>
            ))}
          </div>
        )}

        <ol className="grid gap-2 mb-4">
          {orderedXi.map((player, i) => {
            const isCaptain = player.id === captainId;
            const isKeeper = player.id === wicketkeeperId;
            const bowlRole = bowlingRoleAssignments[player.id];
            const eligibleKeeper = isWicketkeeper(player);
            const bowlingEligible = canBowl(player);
            return (
              <motion.li
                key={player.id}
                layout
                className="flex items-center gap-2 rounded-xl border border-border bg-background-elevated px-3 py-2.5"
              >
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => moveBattingOrderItem(player.id, "up")}
                    className="text-foreground-muted hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === orderedXi.length - 1}
                    onClick={() => moveBattingOrderItem(player.id, "down")}
                    className="text-foreground-muted hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <span className="w-4 shrink-0 text-center text-sm text-foreground-muted tabular-nums">
                  {i + 1}
                </span>
                <PlayerAvatar player={player} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">{player.name}</p>
                  <p className="text-xs text-foreground-muted">{player.primaryRole}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Set as captain"
                    onClick={() => setCaptain(player.id)}
                    className={cn(
                      "rounded-full p-1.5",
                      isCaptain ? "bg-gold/20 text-gold" : "text-foreground-muted hover:text-gold"
                    )}
                  >
                    <Star className="h-3.5 w-3.5" fill={isCaptain ? "currentColor" : "none"} />
                  </button>
                  {eligibleKeeper && (
                    <button
                      type="button"
                      aria-label="Set as wicketkeeper"
                      onClick={() => setWicketkeeper(player.id)}
                      className={cn(
                        "rounded-full p-1.5",
                        isKeeper ? "bg-accent/20 text-accent" : "text-foreground-muted hover:text-accent"
                      )}
                    >
                      <Shield className="h-3.5 w-3.5" fill={isKeeper ? "currentColor" : "none"} />
                    </button>
                  )}
                  {bowlingEligible && (
                    <button type="button" onClick={() => cycleBowlingRole(player.id)}>
                      <Badge>{bowlRole ?? "set role"}</Badge>
                    </button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>

        {impactPlayer && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5">
            <PlayerAvatar player={impactPlayer} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold leading-tight">{impactPlayer.name}</p>
              <p className="text-xs text-foreground-muted">Impact Player (bench)</p>
            </div>
            <Badge variant="gold">Sub</Badge>
          </div>
        )}

        <Button size="lg" className="w-full" onClick={handleSimulate}>
          Simulate the Season
        </Button>
      </PosterShell>
    </main>
  );
}
