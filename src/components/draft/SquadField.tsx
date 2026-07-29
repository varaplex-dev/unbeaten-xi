"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n";
import { SQUAD_SIZE, type Player } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Soft, non-restrictive role hints for each batting-order slot, modeled on
 * a realistic XI balance (2 openers, 3 middle-order batters, 1 wicketkeeper-
 * batter, 2 all-rounders, 3 specialist bowlers — 11 in total). This is a
 * strategy nudge, not an eligibility rule: any player can go in any slot,
 * and only the actual composition check (team-setup's checkComposition —
 * a keeper, 4+ bowling options, a pace bowler, a spinner) is enforced.
 * Where you place a strong batter still changes the simulation for real
 * (see expectedRunsFromBatting's position weighting), so the label is
 * there to help you think about it, not to lock you into it. */
function slotRoleLabel(index: number): TranslationKey {
  if (index < 2) return "field.slotOpener";
  if (index < 5) return "field.slotMiddleOrder";
  if (index < 6) return "field.slotWkBatter";
  if (index < 8) return "field.slotAllRounder";
  return "field.bowler";
}

// The batting-order slot group that best fits a player's primary role — a
// helpful nudge for regular play (Hardcore Mode passes suggest=false so the
// player gets no hint). Mirrors slotRoleLabel's 2/3/1/2/3 structure.
function preferredSlotGroup(role: Player["primaryRole"]): number[] {
  switch (role) {
    case "opener":
    case "top-order":
      return [0, 1];
    case "middle-order":
    case "finisher":
      return [2, 3, 4];
    case "wicketkeeper-batter":
      return [5];
    case "batting-allrounder":
    case "bowling-allrounder":
      return [6, 7];
    default:
      // fast/swing/death bowlers and all spinners
      return [8, 9, 10];
  }
}

/** The first still-open slot in the pending player's preferred group, or
 * null if that group is full (or suggestions are off). */
function suggestedSlotIndex(pendingPlayer: Player | null, slots: (Player | null)[]): number | null {
  if (!pendingPlayer) return null;
  const open = preferredSlotGroup(pendingPlayer.primaryRole).find((i) => !slots[i]);
  return open ?? null;
}

interface RowProps {
  index: number;
  player: Player | null;
  clickable: boolean;
  suggested: boolean;
  onClick?: () => void;
}

/** One batting-order position (1–11). Filled shows the player; empty is a
 * tappable "bat here" target while placing. */
function LineupRow({ index, player, clickable, suggested, onClick }: RowProps) {
  const { t } = useTranslation();
  const rank = index + 1;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors",
        player
          ? "border-border bg-background-elevated"
          : clickable
            ? cn(
                "cursor-pointer",
                suggested ? "border-gold bg-gold/10" : "border-accent/60 bg-accent/5"
              )
            : "border-dashed border-white/10 bg-transparent"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums",
          player ? "bg-accent/15 text-accent" : "bg-white/5 text-foreground-muted"
        )}
      >
        {rank}
      </span>

      <AnimatePresence initial={false} mode="wait">
        {player ? (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 24 }}
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <PlayerAvatar player={player} size={34} className="ring-1 ring-accent/40" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight">{player.name}</p>
              <p className="text-[10px] uppercase tracking-wide text-foreground-muted">{t(slotRoleLabel(index))}</p>
            </div>
          </motion.div>
        ) : clickable ? (
          <motion.button
            key={`place-${index}`}
            type="button"
            onClick={onClick}
            className="flex min-w-0 flex-1 items-center justify-between text-left"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className={cn("text-sm font-bold", suggested ? "text-gold" : "text-accent")}>
              {suggested ? `★ ${t("field.batHereSuggested")}` : t("field.tapToBatHere")}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-foreground-muted">{t(slotRoleLabel(index))}</span>
          </motion.button>
        ) : (
          <div key={`empty-${index}`} className="flex min-w-0 flex-1 items-center justify-between">
            <span className="text-sm text-foreground-muted/70">—</span>
            <span className="text-[10px] uppercase tracking-wide text-foreground-muted/60">{t(slotRoleLabel(index))}</span>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SquadFieldProps {
  /** Length SQUAD_SIZE, index = batting-order slot (0 = position 1). */
  slots: (Player | null)[];
  /** True while a picked player is waiting to be placed — empty slots
   * become tappable and pulse to invite the placement. */
  placing: boolean;
  /** The player currently waiting to be placed — used to suggest a slot. */
  pendingPlayer?: Player | null;
  /** Whether to highlight a suggested slot for the pending player. Off in
   * Hardcore Mode, which is user-reliant. */
  suggest?: boolean;
  onSlotClick?: (index: number) => void;
  impactPlayer?: Player | null;
  impactActive?: boolean;
}

/** The drafted XI as a BATTING ORDER (1–11) — deliberately a lineup, not a
 * field. Picking a player doesn't lock in their spot: you then tap an open
 * batting position to place them, and that choice is real —
 * expectedRunsFromBatting weights the top of the order more heavily, so
 * stacking your best hitters up top versus burying one at #11 genuinely
 * changes the season sim, not just the display order. The 12th slot (Impact
 * Player) is a single bench spot, picked directly, no placement. */
export function SquadField({
  slots,
  placing,
  pendingPlayer,
  suggest,
  onSlotClick,
  impactPlayer,
  impactActive,
}: SquadFieldProps) {
  const { t } = useTranslation();
  const showImpact = impactPlayer !== undefined || impactActive !== undefined;
  const suggestedIndex = placing && suggest ? suggestedSlotIndex(pendingPlayer ?? null, slots) : null;
  const filled = slots.filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-saffron">{t("field.battingOrder")}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground-muted">{filled}/{SQUAD_SIZE}</span>
      </div>

      <div className="grid gap-1.5">
        {slots.map((player, i) => (
          <LineupRow
            key={i}
            index={i}
            player={player ?? null}
            clickable={placing && !player}
            suggested={i === suggestedIndex}
            onClick={() => onSlotClick?.(i)}
          />
        ))}
      </div>

      {showImpact && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-gold/30 bg-gold/5 px-3 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[10px] font-black text-gold">
            IMP
          </span>
          {impactPlayer ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <PlayerAvatar player={impactPlayer} size={34} className="ring-1 ring-gold/50" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold leading-tight">{impactPlayer.name}</p>
                <p className="text-[10px] uppercase tracking-wide text-gold/80">{t("field.impactPlayer")}</p>
              </div>
            </div>
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-gold/80">{t("field.impactPlayerBench")}</span>
          )}
        </div>
      )}
    </div>
  );
}
