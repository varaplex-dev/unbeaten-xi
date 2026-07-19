"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { SQUAD_SIZE, type Player } from "@/lib/types";
import { cn } from "@/lib/utils";

// Hand-placed (x%, y%) positions for the 11 XI slots, spread around the
// boundary of the field graphic below, clear of the pitch strip down the
// middle. These are purely visual — they mirror pick order (slot N fills on
// the Nth pick), not a real fielding assignment, since this game never asks
// the user to place a player at a specific fielding position.
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

interface SlotProps {
  index: number;
  x: number;
  y: number;
  player: Player | null;
  active: boolean;
  impact?: boolean;
}

function Slot({ index, x, y, player, active, impact }: SlotProps) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <AnimatePresence mode="wait" initial={false}>
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
              size={impact ? 40 : 44}
              className={cn(
                "relative ring-2",
                impact ? "ring-gold" : "ring-accent",
                "shadow-lg shadow-black/40"
              )}
            />
            <span className="relative mt-1 max-w-[64px] truncate text-center text-[10px] font-bold text-foreground">
              {player.shortName}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key={`empty-${index}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            className="flex flex-col items-center"
          >
            <motion.div
              className={cn(
                "flex items-center justify-center rounded-full border-2 border-dashed text-xs font-bold",
                impact ? "border-gold/50 text-gold/70" : "border-white/20 text-foreground-muted",
                active && (impact ? "border-gold" : "border-accent")
              )}
              style={{ width: impact ? 40 : 44, height: impact ? 40 : 44 }}
              animate={active ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
              transition={active ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined}
            >
              {impact ? "IMP" : index + 1}
            </motion.div>
            <span className="mt-1 h-[14px] text-[10px] text-foreground-muted">
              {active ? (impact ? "Up next" : "Next") : ""}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SquadFieldProps {
  /** Length SQUAD_SIZE, index = pick order (0-based). null = not picked yet. */
  slots: (Player | null)[];
  /** Index of the slot the next pick will fill, or null once the XI is full. */
  activeIndex: number | null;
  impactPlayer?: Player | null;
  /** True while the Impact Player round is in progress (XI full, no pick yet). */
  impactActive?: boolean;
}

/** A stylized cricket ground that fills in as the squad is drafted — each of
 * the 11 XI slots (plus a 12th Impact Player slot at the centre) lights up
 * and drops the picked player's avatar into place the moment they're
 * selected, with the next open slot pulsing to show where the following
 * pick will land. */
export function SquadField({ slots, activeIndex, impactPlayer, impactActive }: SquadFieldProps) {
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
          <Slot key={i} index={i} x={pos.x} y={pos.y} player={slots[i] ?? null} active={activeIndex === i} />
        ))}
      </div>

      {showImpact && (
        <div className="mx-auto mt-3 flex w-full max-w-sm items-center justify-center gap-3 rounded-xl border border-dashed border-gold/30 bg-gold/5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/80">Impact Player</span>
          <div className="relative h-11 w-11">
            <Slot index={SQUAD_SIZE} x={50} y={50} player={impactPlayer ?? null} active={Boolean(impactActive)} impact />
          </div>
        </div>
      )}
    </div>
  );
}
