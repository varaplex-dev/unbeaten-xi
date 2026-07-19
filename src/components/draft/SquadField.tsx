"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { SQUAD_SIZE, type Player } from "@/lib/types";
import { cn } from "@/lib/utils";

// Hand-placed (x%, y%) positions for the 11 XI slots, spread around the
// boundary of the field graphic below, clear of the pitch strip down the
// middle. Purely visual placement on the ground — the number is the
// player's actual batting-order position (see slotRoleLabel below), which
// the user chooses freely; nothing here is a real fielding assignment.
const SLOT_POSITIONS: { x: number; y: number }[] = [
  { x: 50, y: 91 },
  { x: 21, y: 81 },
  { x: 79, y: 81 },
  { x: 10, y: 58 },
  { x: 90, y: 58 },
  { x: 17, y: 36 },
  { x: 83, y: 36 },
  { x: 50, y: 76 },
  { x: 28, y: 17 },
  { x: 72, y: 17 },
  { x: 50, y: 8 },
];

/** Soft, non-restrictive labels for the batting-order slot — a hint for
 * strategy, not an eligibility rule. Any player can go in any slot; where
 * you actually place a strong batter changes the simulation (see
 * expectedRunsFromBatting's position weighting), so this is a nudge toward
 * thinking about it, not a lock. */
function slotRoleLabel(index: number): string {
  if (index < 2) return "Opener";
  if (index < 5) return "Top Order";
  if (index < 7) return "Middle";
  if (index < 9) return "Lower Order";
  return "Tail";
}

interface SlotProps {
  index: number;
  x: number;
  y: number;
  player: Player | null;
  clickable: boolean;
  impact?: boolean;
  onClick?: () => void;
}

function Slot({ index, x, y, player, clickable, impact, onClick }: SlotProps) {
  const size = impact ? 40 : 44;
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      {/* mode="wait" would gate the new (filled) child on the old (empty)
          child's exit animation finishing — if that animation ever stalls
          (e.g. a backgrounded tab throttling requestAnimationFrame), the
          slot would be stuck showing "Place here" forever even though the
          pick landed correctly in the store. Default (sync) mode mounts
          the new child immediately regardless. */}
      <AnimatePresence initial={false}>
        {player ? (
          <motion.div
            key={player.id}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 340, damping: 22 }}
            className="relative flex flex-col items-center"
          >
            <motion.div
              className="absolute inset-0 rounded-full"
              initial={{ boxShadow: "0 0 0 14px rgba(34,230,168,0.55)" }}
              animate={{ boxShadow: "0 0 0 0px rgba(34,230,168,0)" }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
            <PlayerAvatar
              player={player}
              size={size}
              className={cn("relative ring-2", impact ? "ring-gold" : "ring-accent", "shadow-lg shadow-black/40")}
            />
            <span className="relative mt-1 max-w-[64px] truncate text-center text-[10px] font-bold text-foreground">
              {player.shortName}
            </span>
          </motion.div>
        ) : (
          <motion.button
            type="button"
            key={`empty-${index}`}
            disabled={!clickable}
            onClick={onClick}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            className={cn("flex flex-col items-center", clickable ? "cursor-pointer" : "cursor-default")}
          >
            <motion.div
              className={cn(
                "flex items-center justify-center rounded-full border-2 text-xs font-bold",
                impact ? "border-gold/50 text-gold/70" : "border-white/20 text-foreground-muted",
                clickable && (impact ? "border-solid border-gold" : "border-solid border-accent text-accent")
              )}
              style={{ width: size, height: size, borderStyle: clickable ? "solid" : "dashed" }}
              animate={clickable ? { opacity: [0.55, 1, 0.55], scale: [1, 1.08, 1] } : { opacity: 1 }}
              transition={clickable ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
            >
              {impact ? "IMP" : index + 1}
            </motion.div>
            <span
              className={cn(
                "mt-1 h-[14px] max-w-[64px] truncate text-center text-[10px]",
                clickable ? "font-semibold text-accent" : "text-foreground-muted"
              )}
            >
              {clickable ? "Place here" : impact ? "" : slotRoleLabel(index)}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SquadFieldProps {
  /** Length SQUAD_SIZE, index = batting-order slot (0 = position 1). */
  slots: (Player | null)[];
  /** True while a picked player is waiting to be placed — empty slots
   * become clickable and pulse to invite the placement tap. */
  placing: boolean;
  onSlotClick?: (index: number) => void;
  impactPlayer?: Player | null;
  impactActive?: boolean;
}

/** A stylized cricket ground that fills in as the squad is drafted. Picking
 * a player doesn't lock in their spot — the user then taps an open slot on
 * the field to place them, and that choice is real: expectedRunsFromBatting
 * weights the top of the order more heavily, so stacking your best hitters
 * up top versus burying one at #11 genuinely changes the season sim, not
 * just the display order. The 12th slot (Impact Player, in the bench strip
 * below) skips placement — it's a single bench spot, picked directly. */
export function SquadField({ slots, placing, onSlotClick, impactPlayer, impactActive }: SquadFieldProps) {
  const showImpact = impactPlayer !== undefined || impactActive !== undefined;
  return (
    <div>
      <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-[radial-gradient(ellipse_at_50%_45%,#0f2a22_0%,#0b0f14_72%)]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <ellipse cx="50" cy="50" rx="47" ry="47" fill="none" stroke="rgba(34,230,168,0.35)" strokeWidth="0.6" strokeDasharray="2 2" />
          <ellipse cx="50" cy="50" rx="32" ry="32" fill="none" stroke="rgba(34,230,168,0.18)" strokeWidth="0.4" />
          <rect x="44" y="30" width="12" height="40" rx="1.5" fill="rgba(232,179,76,0.16)" stroke="rgba(232,179,76,0.4)" strokeWidth="0.4" />
          <line x1="45.5" y1="34" x2="54.5" y2="34" stroke="rgba(232,179,76,0.55)" strokeWidth="0.5" />
          <line x1="45.5" y1="66" x2="54.5" y2="66" stroke="rgba(232,179,76,0.55)" strokeWidth="0.5" />
        </svg>

        {SLOT_POSITIONS.map((pos, i) => (
          <Slot
            key={i}
            index={i}
            x={pos.x}
            y={pos.y}
            player={slots[i] ?? null}
            clickable={placing && !slots[i]}
            onClick={() => onSlotClick?.(i)}
          />
        ))}
      </div>

      {showImpact && (
        <div className="mx-auto mt-3 flex w-full max-w-sm items-center justify-center gap-3 rounded-xl border border-dashed border-gold/30 bg-gold/5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/80">Impact Player</span>
          <div className="relative h-11 w-11">
            <Slot index={SQUAD_SIZE} x={50} y={50} player={impactPlayer ?? null} clickable={false} impact />
          </div>
        </div>
      )}
    </div>
  );
}
