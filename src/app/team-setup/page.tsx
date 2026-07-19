"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Star, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { FieldingBoard } from "@/components/draft/FieldingBoard";
import { PosterShell } from "@/components/brand/PosterShell";
import { useDraftedPlayers, useGameStore } from "@/lib/store/gameStore";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { BowlingPhase } from "@/lib/engine/lineup";
import { computeTeamRatings } from "@/lib/engine/teamRatings";
import { checkComposition } from "@/lib/engine/draft";
import { SQUAD_SIZE, canBowl, isWicketkeeper } from "@/lib/types";
import { getPlayerById } from "@/lib/data/players";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { getLegendPlayerById } from "@/lib/data/legendPlayers";
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
  const setBattingOrder = useGameStore((s) => s.setBattingOrder);
  const usedEraTeamIds = useGameStore((s) => s.usedEraTeamIds);
  const hardcoreMode = useGameStore((s) => s.hardcoreMode);
  const fieldingAssignments = useGameStore((s) => s.fieldingAssignments);
  const pendingFieldingPlayerId = useGameStore((s) => s.pendingFieldingPlayerId);
  const selectPlayerForFielding = useGameStore((s) => s.selectPlayerForFielding);
  const assignFieldingPosition = useGameStore((s) => s.assignFieldingPosition);
  const { t } = useTranslation();
  // eraTeamId itself is cleared after every spin-draft pick (it only holds
  // the team revealed for the round in progress), so "was this game built
  // via spin-drafting" is detected from usedEraTeamIds instead — non-empty
  // once at least one pick has been made that way.
  const isSpinDraft = usedEraTeamIds.length > 0;
  const drafted = useDraftedPlayers();
  const impactPlayer = impactPlayerId
    ? (mode === "all-time-real"
        ? (getRealPlayerById(impactPlayerId) ?? getLegendPlayerById(impactPlayerId))
        : getPlayerById(impactPlayerId))
    : null;

  const isSquadComplete = draftPicks.length === SQUAD_SIZE;

  // An Era Team squad was hand-picked player-by-player, so the lineup
  // shouldn't be pre-filled the way the category-based draft's is — the
  // user places every player into a position themselves (captain, keeper,
  // batting order) via the controls below. Only the initial ORDER needs a
  // starting value (pick order) so the reorder buttons have something to
  // operate on; captain/keeper/bowling roles stay unset until chosen.
  useEffect(() => {
    if (!hasHydrated || !isSquadComplete || battingOrder.length !== 0) return;
    if (isSpinDraft) {
      setBattingOrder(drafted.map((p) => p.id));
    } else {
      autoBuildLineup();
    }
  }, [hasHydrated, isSquadComplete, battingOrder.length, autoBuildLineup, isSpinDraft, drafted, setBattingOrder]);

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
    () =>
      orderedXi.length === SQUAD_SIZE ? checkComposition(orderedXi, { skipOverseasLimit: isSpinDraft }) : null,
    [orderedXi, isSpinDraft]
  );

  // Spin-drafted squads require the user to actively assign captain/keeper
  // rather than inheriting an auto-picked default — the category-based
  // draft's auto-lineup already asks nothing of the user here, so this only
  // gates the flow that used to be silently pre-filled.
  const needsExplicitCaptain = isSpinDraft && !captainId;
  const squadHasEligibleKeeper = orderedXi.some(isWicketkeeper);
  const needsExplicitKeeper = isSpinDraft && squadHasEligibleKeeper && !wicketkeeperId;
  const canSimulate = !needsExplicitCaptain && !needsExplicitKeeper;

  // The keeper stands behind the stumps, not out on the field — everyone
  // else in the XI is fair game for a Hardcore Mode position. If no keeper
  // is set yet, nobody's excluded rather than guessing.
  const outfieldPlayers = orderedXi.filter((p) => p.id !== wicketkeeperId);

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
          {isSpinDraft
            ? "Set your batting order, captain, and keeper below — nothing's chosen for you."
            : "We've set a lineup automatically — reorder the batting order, change your captain, keeper, or bowling roles below, then simulate when you're ready."}
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

        {hardcoreMode && (
          <div className="mb-6">
            <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-gold uppercase">{t("hardcore.label")}</p>
            <h2 className="mb-1 text-xl font-black italic tracking-tight">{t("hardcore.setFieldingTitle")}</h2>
            <p className="mb-4 text-sm text-foreground-muted">{t("hardcore.setFieldingDesc")}</p>
            <FieldingBoard
              outfieldPlayers={outfieldPlayers}
              assignments={fieldingAssignments}
              pendingPlayerId={pendingFieldingPlayerId}
              onSelectPlayer={selectPlayerForFielding}
              onSelectPosition={assignFieldingPosition}
            />
          </div>
        )}

        {!canSimulate && (
          <p className="mb-3 text-center text-sm text-danger">
            {needsExplicitCaptain && "Pick a captain "}
            {needsExplicitCaptain && needsExplicitKeeper && "and "}
            {needsExplicitKeeper && "pick a wicketkeeper "}
            before you simulate.
          </p>
        )}
        <Button size="lg" className="w-full" onClick={handleSimulate} disabled={!canSimulate}>
          Simulate the Season
        </Button>
      </PosterShell>
    </main>
  );
}
