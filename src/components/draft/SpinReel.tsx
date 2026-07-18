"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ERA_TEAMS } from "@/lib/data/eraTeams";
import { createRng, pickRandom } from "@/lib/engine/rng";
import type { EraTeam } from "@/lib/types";

const ITEM_HEIGHT = 52;
const REEL_LENGTH = 16;
const DURATION = 1.7;
// A gentle ease-out — fast start, long deceleration into the landing item —
// so the reel reads as "spinning down" rather than a linear slide.
const EASE: [number, number, number, number] = [0.1, 0.7, 0.2, 1];

function buildReelSequence(seedKey: string, pool: string[], finalValue: string): string[] {
  const rng = createRng(seedKey);
  const decoys = Array.from({ length: REEL_LENGTH - 1 }, () => pickRandom(rng, pool));
  return [...decoys, finalValue];
}

function ReelColumn({
  label,
  items,
  onAnimationComplete,
}: {
  label: string;
  items: string[];
  onAnimationComplete?: () => void;
}) {
  const finalY = -(items.length - 1) * ITEM_HEIGHT;
  return (
    <div>
      <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
        {label}
      </p>
      <div
        className="relative overflow-hidden rounded-xl border border-accent/30 bg-background-elevated"
        style={{ height: ITEM_HEIGHT }}
      >
        <motion.div
          initial={{ y: 0 }}
          animate={{ y: finalY }}
          transition={{ duration: DURATION, ease: EASE }}
          onAnimationComplete={onAnimationComplete}
        >
          {items.map((item, i) => (
            <div
              key={i}
              style={{ height: ITEM_HEIGHT }}
              className="flex items-center justify-center px-2 text-center text-sm font-bold leading-tight"
            >
              {item}
            </div>
          ))}
        </motion.div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-background-elevated to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-background-elevated to-transparent" />
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-accent/40" />
      </div>
    </div>
  );
}

interface SpinReelProps {
  target: EraTeam;
  onComplete: () => void;
}

/** A two-column slot-reel: team names on the left, era labels on the right.
 * Both reels scroll through decoy values (seeded off the target's own id, so
 * a given landing is always preceded by the same "spin") and settle on the
 * real target — computed ahead of time by the caller via pickNextEraTeam so
 * this component only has to animate toward an already-decided answer. */
export function SpinReel({ target, onComplete }: SpinReelProps) {
  const teamNames = useMemo(() => Array.from(new Set(ERA_TEAMS.map((t) => t.name))), []);
  const eraLabels = useMemo(() => Array.from(new Set(ERA_TEAMS.map((t) => t.eraLabel))), []);

  const teamSequence = useMemo(
    () => buildReelSequence(`${target.id}::reel-team`, teamNames, target.name),
    [target, teamNames]
  );
  const eraSequence = useMemo(
    () => buildReelSequence(`${target.id}::reel-era`, eraLabels, target.eraLabel),
    [target, eraLabels]
  );

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Spinning…</p>
      <div className="grid w-full max-w-md grid-cols-2 gap-3 px-6">
        <ReelColumn label="Team" items={teamSequence} />
        <ReelColumn label="Era" items={eraSequence} onAnimationComplete={onComplete} />
      </div>
    </div>
  );
}
