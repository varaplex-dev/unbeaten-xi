"use client";

import { motion } from "framer-motion";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { FIELDING_POSITIONS } from "@/lib/data/fieldingPositions";
import type { Player } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FieldingBoardProps {
  /** The 10 non-keeper XI players — the keeper always stands behind the
   * stumps and isn't part of this board. */
  outfieldPlayers: Player[];
  /** position id -> player id. */
  assignments: Record<string, string>;
  pendingPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onSelectPosition: (positionId: string) => void;
}

/** Real cricket fielding positions (per networldsports.co.uk's guide) —
 * Hardcore Mode's extra layer of depth on top of the batting-order
 * placement every game already has. Same select-a-player-then-tap-a-spot
 * interaction as the batting field, just with real position names instead
 * of order numbers. Only the two close-catching spots (slip, gully) feed
 * back into the simulation (see fielding.ts) — the rest is pure strategic
 * flavor, since there's no real "fielding rating" in the underlying data
 * to justify claiming more than that. */
export function FieldingBoard({
  outfieldPlayers,
  assignments,
  pendingPlayerId,
  onSelectPlayer,
  onSelectPosition,
}: FieldingBoardProps) {
  const assignedPlayerIds = new Set(Object.values(assignments));
  const unassigned = outfieldPlayers.filter((p) => !assignedPlayerIds.has(p.id));
  const pendingPlayer = pendingPlayerId ? outfieldPlayers.find((p) => p.id === pendingPlayerId) : null;

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

        {/* Keeper — fixed, decorative, not assignable */}
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: "50%", top: "78%" }}>
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-gold/40 text-[9px] font-bold text-gold/70">
              WK
            </div>
          </div>
        </div>

        {FIELDING_POSITIONS.map((pos) => {
          const playerId = assignments[pos.id];
          const player = playerId ? outfieldPlayers.find((p) => p.id === playerId) : null;
          const clickable = Boolean(pendingPlayerId) && !player;
          const isCatching = pos.zone === "catching";
          return (
            <div
              key={pos.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {player ? (
                <div className="flex flex-col items-center">
                  <PlayerAvatar
                    player={player}
                    size={36}
                    className={cn("ring-2 shadow-lg shadow-black/40", isCatching ? "ring-gold" : "ring-accent")}
                  />
                  <span className="mt-1 max-w-[60px] truncate text-center text-[9px] font-bold text-foreground">
                    {player.shortName}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onSelectPosition(pos.id)}
                  className={cn("flex flex-col items-center", clickable ? "cursor-pointer" : "cursor-default")}
                >
                  <motion.div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 text-[8px] font-bold",
                      isCatching ? "text-gold/70" : "text-foreground-muted",
                      clickable ? "border-solid border-accent text-accent" : "border-dashed border-white/20"
                    )}
                    animate={clickable ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 }}
                    transition={clickable ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
                  >
                    {pos.short.length > 6 ? pos.short.slice(0, 5) : pos.short}
                  </motion.div>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {pendingPlayer && (
        <p className="mx-auto mt-3 max-w-sm text-center text-xs text-accent">
          Placing <span className="font-semibold">{pendingPlayer.shortName}</span> — tap a position on the field.
        </p>
      )}

      {unassigned.length > 0 && (
        <div className="mx-auto mt-3 flex max-w-sm flex-wrap justify-center gap-1.5">
          {unassigned.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelectPlayer(player.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                pendingPlayerId === player.id
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-background-elevated text-foreground-muted hover:text-foreground"
              )}
            >
              {player.shortName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
