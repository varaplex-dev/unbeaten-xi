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
import { roleLabelKey } from "@/lib/i18n/roles";
import type { BowlingPhase } from "@/lib/engine/lineup";
import { computeTeamRatings } from "@/lib/engine/teamRatings";
import { checkComposition } from "@/lib/engine/draft";
import { SQUAD_SIZE, canBowl, isWicketkeeper } from "@/lib/types";
import { getPlayerById } from "@/lib/data/players";
import { getRealPoolPlayerById } from "@/lib/data/gameData";
import { useGameDataReady } from "@/lib/data/useGameData";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

const BOWLING_PHASE_CYCLE: BowlingPhase[] = ["powerplay", "middle", "death"];

export default function TeamSetupPage() {
  const router = useRouter();
  const dataReady = useGameDataReady();
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
  const fieldingFormation = useGameStore((s) => s.fieldingFormation);
  const applyFieldingFormation = useGameStore((s) => s.applyFieldingFormation);
  const fieldingBatterHand = useGameStore((s) => s.fieldingBatterHand);
  const setFieldingBatterHand = useGameStore((s) => s.setFieldingBatterHand);
  const { t } = useTranslation();
  // eraTeamId itself is cleared after every spin-draft pick (it only holds
  // the team revealed for the round in progress), so "was this game built
  // via spin-drafting" is detected from usedEraTeamIds instead — non-empty
  // once at least one pick has been made that way.
  const isSpinDraft = usedEraTeamIds.length > 0;
  const drafted = useDraftedPlayers();
  const impactPlayer = impactPlayerId
    ? (mode === "all-time-real"
        ? getRealPoolPlayerById(impactPlayerId)
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
    // Wait until the full XI has actually resolved. On a cold reload straight
    // onto this page the lazy dataset is still streaming in, so `drafted` is
    // briefly empty even though draftPicks is complete — seeding the order
    // from an empty list would set [], leave battingOrder.length at 0, and
    // (because `drafted` gets a new identity every render) re-fire forever.
    if (drafted.length !== SQUAD_SIZE) return;
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
      orderedXi.length === SQUAD_SIZE
        ? checkComposition(orderedXi, { skipOverseasLimit: isSpinDraft, softRoleRequirements: isSpinDraft })
        : null,
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

  if (mode === "all-time-real" && !dataReady) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted">{t("lb.loading")}</p>
      </main>
    );
  }

  if (!seed || !isSquadComplete) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted mb-4">{t("ts.noDraft")}</p>
        <Link href="/play">
          <Button>{t("ts.startDraft")}</Button>
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
        kicker={t("ts.kicker")}
        digits={ratings ? [{ value: String(ratings.overallRating), label: t("ts.teamRating") }] : []}
      >
        <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">
          {t("ts.ready")}
        </h1>
        <p className="text-foreground-muted mb-6">
          {isSpinDraft ? t("ts.subtitleSpin") : t("ts.subtitleAuto")}
        </p>

        {composition && composition.issues.some((i) => i.severity === "error") && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {composition.issues
              .filter((i) => i.severity === "error")
              .map((issue) => (
                <p key={issue.code}>{issue.message}</p>
              ))}
          </div>
        )}

        {/* Spin-draft role shortfalls are advisory — you can't control what you
            spin into, so these are a "heads up", not a blocker. */}
        {composition && composition.issues.some((i) => i.severity === "warning") && (
          <div className="mb-4 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm">
            <p className="mb-1 font-semibold text-gold">{t("ts.unbalanced")}</p>
            {composition.issues
              .filter((i) => i.severity === "warning")
              .map((issue) => (
                <p key={issue.code} className="text-foreground-muted">
                  {issue.message}
                </p>
              ))}
          </div>
        )}

        {(needsExplicitCaptain || needsExplicitKeeper) && (
          <div className="mb-4 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm">
            <p className="mb-1 flex items-center gap-2 font-semibold text-gold">
              <Star className="h-4 w-4" fill="currentColor" /> {t("ts.chooseLeaders")}
            </p>
            <p className="text-foreground-muted">
              {needsExplicitCaptain && (
                <>
                  {(() => {
                    const [before, after] = t("ts.captainHint").split("{icon}");
                    return (
                      <>
                        {before}
                        <Star className="inline h-3.5 w-3.5 -mt-0.5 text-gold" />
                        {after}
                      </>
                    );
                  })()}
                </>
              )}{" "}
              {needsExplicitKeeper && (
                <>
                  {(() => {
                    const [before, after] = t("ts.keeperHint").split("{icon}");
                    return (
                      <>
                        {before}
                        <Shield className="inline h-3.5 w-3.5 -mt-0.5 text-accent" />
                        {after}
                      </>
                    );
                  })()}
                </>
              )}
            </p>
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
                    aria-label={t("ts.moveUp")}
                    disabled={i === 0}
                    onClick={() => moveBattingOrderItem(player.id, "up")}
                    className="text-foreground-muted hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("ts.moveDown")}
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
                  <p className="text-xs text-foreground-muted">{t(roleLabelKey(player.primaryRole))}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("ts.setCaptain")}
                    title={t("ts.setCaptain")}
                    onClick={() => setCaptain(player.id)}
                    className={cn(
                      "rounded-full p-1.5 ring-1 transition-colors",
                      isCaptain
                        ? "bg-gold/20 text-gold ring-gold/50"
                        : needsExplicitCaptain
                          ? "animate-pulse text-gold ring-gold/40"
                          : "text-foreground-muted ring-transparent hover:text-gold"
                    )}
                  >
                    <Star className="h-3.5 w-3.5" fill={isCaptain ? "currentColor" : "none"} />
                  </button>
                  {eligibleKeeper && (
                    <button
                      type="button"
                      aria-label={t("ts.setKeeper")}
                      title={t("ts.setKeeper")}
                      onClick={() => setWicketkeeper(player.id)}
                      className={cn(
                        "rounded-full p-1.5 ring-1 transition-colors",
                        isKeeper
                          ? "bg-accent/20 text-accent ring-accent/50"
                          : needsExplicitKeeper
                            ? "animate-pulse text-accent ring-accent/40"
                            : "text-foreground-muted ring-transparent hover:text-accent"
                      )}
                    >
                      <Shield className="h-3.5 w-3.5" fill={isKeeper ? "currentColor" : "none"} />
                    </button>
                  )}
                  {bowlingEligible && (
                    <button type="button" onClick={() => cycleBowlingRole(player.id)}>
                      <Badge>{bowlRole ?? t("ts.setRole")}</Badge>
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
              <p className="text-xs text-foreground-muted">{t("ts.impactBench")}</p>
            </div>
            <Badge variant="gold">{t("ts.sub")}</Badge>
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
              formation={fieldingFormation}
              pendingPlayerId={pendingFieldingPlayerId}
              batterHand={fieldingBatterHand}
              onSelectPlayer={selectPlayerForFielding}
              onSelectPosition={assignFieldingPosition}
              onApplyFormation={applyFieldingFormation}
              onSetBatterHand={setFieldingBatterHand}
            />
          </div>
        )}

        {!canSimulate && (
          <p className="mb-3 text-center text-sm text-danger">
            {needsExplicitCaptain && needsExplicitKeeper
              ? t("ts.needBoth")
              : needsExplicitCaptain
                ? t("ts.needCaptain")
                : t("ts.needKeeper")}
          </p>
        )}
        <Button size="lg" className="w-full" onClick={handleSimulate} disabled={!canSimulate}>
          {t("ts.simulate")}
        </Button>
      </PosterShell>
    </main>
  );
}
