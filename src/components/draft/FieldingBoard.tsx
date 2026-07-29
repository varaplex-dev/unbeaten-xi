"use client";

import { motion } from "framer-motion";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import {
  FIELD_FORMATIONS,
  formationPositions,
  type FormationId,
} from "@/lib/data/fieldingPositions";
import { BOWLER_SLOT } from "@/lib/store/gameStore";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n";
import type { Player } from "@/lib/types";
import { cn } from "@/lib/utils";

// Display name + blurb for each formation live in i18n; the data file keeps
// only the id + positions. Typed maps so the keys stay checkable.
const FORMATION_LABEL_KEY: Record<FormationId, TranslationKey> = {
  balanced: "field.formationBalanced",
  attacking: "field.formationAttacking",
  defensive: "field.formationDefensive",
  powerplay: "field.formationPowerplay",
  death: "field.formationDeath",
};
const FORMATION_BLURB_KEY: Record<FormationId, TranslationKey> = {
  balanced: "field.blurbBalanced",
  attacking: "field.blurbAttacking",
  defensive: "field.blurbDefensive",
  powerplay: "field.blurbPowerplay",
  death: "field.blurbDeath",
};

interface FieldingBoardProps {
  /** The non-keeper XI players (up to 10): nine field, one bowls. */
  outfieldPlayers: Player[];
  /** position id (or BOWLER_SLOT) -> player id. */
  assignments: Record<string, string>;
  formation: FormationId | null;
  pendingPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onSelectPosition: (positionId: string) => void;
  onApplyFormation: (id: FormationId) => void;
}

/** Hardcore Mode's field-setting screen. The wicketkeeper stands behind the
 * striker's stumps and the bowler at the far end (both fixed); the other nine
 * are placed by a chosen preset FORMATION (attacking / balanced / defensive /
 * powerplay / death), which the captain can then fine-tune by tapping a player
 * to pick them up and tapping a spot to drop or swap. Only the close-catching
 * spots feed the sim (fieldingWicketBonus); the rest is strategic flavor. */
export function FieldingBoard({
  outfieldPlayers,
  assignments,
  formation,
  pendingPlayerId,
  onSelectPlayer,
  onSelectPosition,
  onApplyFormation,
}: FieldingBoardProps) {
  const { t } = useTranslation();
  const byId = (id: string | undefined) => (id ? outfieldPlayers.find((p) => p.id === id) ?? null : null);
  const positions = formation ? formationPositions(formation) : [];
  const bowler = byId(assignments[BOWLER_SLOT]);
  const activeBlurb = formation ? t(FORMATION_BLURB_KEY[formation]) : undefined;
  // A picked-up player who isn't currently on the field or bowling.
  const pending = pendingPlayerId ? byId(pendingPlayerId) : null;

  const handleSpot = (positionId: string, occupantId: string | undefined) => {
    if (pendingPlayerId) onSelectPosition(positionId);
    else if (occupantId) onSelectPlayer(occupantId);
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Formation presets */}
      <div className="mb-3 flex flex-wrap justify-center gap-1.5">
        {FIELD_FORMATIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onApplyFormation(f.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
              formation === f.id
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-background-elevated text-foreground-muted hover:text-foreground"
            )}
          >
            {t(FORMATION_LABEL_KEY[f.id])}
          </button>
        ))}
      </div>

      <div className="relative mx-auto aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border bg-[radial-gradient(ellipse_at_50%_45%,#0f2a22_0%,#0b0f14_72%)]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <ellipse cx="50" cy="50" rx="47" ry="47" fill="none" stroke="rgba(34,230,168,0.35)" strokeWidth="0.6" strokeDasharray="2 2" />
          <ellipse cx="50" cy="50" rx="30" ry="30" fill="none" stroke="rgba(34,230,168,0.18)" strokeWidth="0.4" />
          <rect x="44" y="30" width="12" height="42" rx="1.5" fill="rgba(232,179,76,0.16)" stroke="rgba(232,179,76,0.4)" strokeWidth="0.4" />
          <line x1="45.5" y1="34" x2="54.5" y2="34" stroke="rgba(232,179,76,0.55)" strokeWidth="0.5" />
          <line x1="45.5" y1="68" x2="54.5" y2="68" stroke="rgba(232,179,76,0.55)" strokeWidth="0.5" />
        </svg>

        {/* Wicketkeeper — fixed behind the striker's stumps, not movable. */}
        <FixedMarker x={50} y={78} label="WK" tone="keeper" />

        {/* Bowler — fixed at the far end; the one non-keeper who bowls. */}
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: "50%", top: "24%" }}>
          <button
            type="button"
            onClick={() => handleSpot(BOWLER_SLOT, assignments[BOWLER_SLOT])}
            className="flex flex-col items-center"
          >
            {bowler ? (
              <>
                <PlayerAvatar
                  player={bowler}
                  size={34}
                  className={cn("ring-2 shadow-lg shadow-black/40", pendingPlayerId === bowler.id ? "ring-gold" : "ring-saffron/80")}
                />
                <span className="mt-0.5 max-w-[64px] truncate text-center text-[9px] font-bold text-foreground">
                  {bowler.shortName}
                </span>
                <span className="text-[8px] font-semibold uppercase tracking-wide text-saffron/80">{t("field.bowler")}</span>
              </>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-saffron/40 text-[9px] font-bold text-saffron/70">
                {t("field.bowl")}
              </div>
            )}
          </button>
        </div>

        {/* The nine fielding positions of the active formation. */}
        {positions.map((pos) => {
          const player = byId(assignments[pos.id]);
          const isCatching = pos.zone === "catching";
          const dropTarget = Boolean(pendingPlayerId);
          return (
            <div key={pos.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
              <button type="button" onClick={() => handleSpot(pos.id, assignments[pos.id])} className="flex flex-col items-center">
                {player ? (
                  <>
                    <PlayerAvatar
                      player={player}
                      size={32}
                      className={cn(
                        "ring-2 shadow-lg shadow-black/40",
                        pendingPlayerId === player.id ? "ring-gold" : isCatching ? "ring-gold/80" : "ring-accent"
                      )}
                    />
                    <span className="mt-0.5 max-w-[58px] truncate text-center text-[9px] font-bold text-foreground">
                      {player.shortName}
                    </span>
                    <span className="text-[8px] text-foreground-muted">{pos.short}</span>
                  </>
                ) : (
                  <motion.div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 text-[8px] font-bold",
                      isCatching ? "text-gold/70" : "text-foreground-muted",
                      dropTarget ? "border-solid border-accent text-accent" : "border-dashed border-white/20"
                    )}
                    animate={dropTarget ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 }}
                    transition={dropTarget ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
                  >
                    {pos.short.slice(0, 6)}
                  </motion.div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {formation ? (
        <p className="mx-auto mt-2 max-w-sm text-center text-xs text-foreground-muted">
          {pending
            ? (() => {
                // Split around {name} so the player's name stays bold and the
                // sentence order is whatever the locale needs (works for RTL).
                const [before, after] = t("field.moving").split("{name}");
                return (
                  <>
                    {before}
                    <span className="font-semibold text-gold">{pending.shortName}</span>
                    {after}
                  </>
                );
              })()
            : activeBlurb}
        </p>
      ) : (
        <p className="mx-auto mt-2 max-w-sm text-center text-xs text-foreground-muted">
          {t("field.pickFormation")}
        </p>
      )}
    </div>
  );
}

function FixedMarker({ x, y, label, tone }: { x: number; y: number; label: string; tone: "keeper" }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed text-[9px] font-bold",
          tone === "keeper" && "border-gold/40 text-gold/70"
        )}
      >
        {label}
      </div>
    </div>
  );
}
