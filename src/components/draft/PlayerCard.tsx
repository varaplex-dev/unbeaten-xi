"use client";

import type { Player } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";

const RARITY_STYLES: Record<Player["rarityTier"], string> = {
  common: "border-border",
  uncommon: "border-accent/30",
  rare: "border-accent/60",
  legendary: "border-gold/70 shadow-gold/10 shadow-lg",
};

const ROLE_LABELS: Record<Player["primaryRole"], string> = {
  opener: "Opener",
  "top-order": "Top Order",
  "middle-order": "Middle Order",
  finisher: "Finisher",
  "wicketkeeper-batter": "Wicketkeeper",
  "batting-allrounder": "Batting All-Rounder",
  "bowling-allrounder": "Bowling All-Rounder",
  "fast-bowler": "Fast Bowler",
  "swing-bowler": "Swing Bowler",
  "death-bowler": "Death Bowler",
  "leg-spinner": "Leg Spinner",
  "off-spinner": "Off Spinner",
  "left-arm-spinner": "Left-Arm Spinner",
};

interface PlayerCardProps {
  player: Player;
  onSelect?: (player: Player) => void;
  selected?: boolean;
  disabled?: boolean;
  /** Hardcore Mode: hide the performance-number grid so the pick rides on
   * the user's own knowledge of the player, not a stat readout. Identity
   * info (name, country, role) still shows — only the numbers are hidden. */
  hideStats?: boolean;
}

function formatStat(value: number | null | undefined, decimals = 1): string {
  // `== null` covers both: a stat that doesn't apply (null) and one the
  // generated data omitted rather than shipping as null (undefined). Before,
  // an absent stat would have rendered as a crash rather than a dash.
  return value == null ? "—" : value.toFixed(decimals);
}

export function PlayerCard({ player, onSelect, selected, disabled, hideStats }: PlayerCardProps) {
  const stats = player.careerStats;
  const { t } = useTranslation();

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect?.(player)}
      className={cn(
        "w-full text-left rounded-2xl border bg-background-elevated p-4 transition-all",
        "hover:border-accent/60 hover:-translate-y-0.5 active:translate-y-0",
        "disabled:opacity-40 disabled:pointer-events-none",
        RARITY_STYLES[player.rarityTier],
        selected && "ring-2 ring-accent"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} />
          <div>
            <p className="font-bold text-lg leading-tight">{player.name}</p>
            <p className="text-xs text-foreground-muted mt-0.5">
              {player.country} &middot; {player.currentTeam}
            </p>
          </div>
        </div>
        {stats ? (
          <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-foreground-muted">
            {stats.format}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-sm font-bold tabular-nums">
            {player.overallRating}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="accent">{ROLE_LABELS[player.primaryRole]}</Badge>
        <Badge>{player.nationalityType === "overseas" ? "Overseas" : "Indian"}</Badge>
        <Badge>{player.battingHand === "left" ? "LHB" : "RHB"}</Badge>
        {player.rarityTier === "legendary" && <Badge variant="gold">Elite</Badge>}
        {player.tags.includes("legend") && <Badge variant="gold">Legend</Badge>}
      </div>

      {hideStats ? (
        <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wide text-gold/70">
          {t("hardcore.statsHidden")}
        </p>
      ) : stats ? (
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground-muted">Avg</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatStat(stats.battingAverage)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground-muted">SR</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatStat(stats.strikeRate)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground-muted">Econ</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatStat(stats.economyRate, 2)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground-muted">Wkts</dt>
            <dd className="text-sm font-semibold tabular-nums">{stats.wickets || "—"}</dd>
          </div>
        </dl>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground-muted">Bat</dt>
            <dd className="text-sm font-semibold tabular-nums">{player.t20BattingRating}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground-muted">Bowl</dt>
            <dd className="text-sm font-semibold tabular-nums">{player.t20BowlingRating}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-foreground-muted">Field</dt>
            <dd className="text-sm font-semibold tabular-nums">{player.fieldingRating}</dd>
          </div>
        </dl>
      )}
    </button>
  );
}
