"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { ERA_TEAMS } from "@/lib/data/eraTeams";
import { createRng, pickRandom } from "@/lib/engine/rng";
import type { EraTeam } from "@/lib/types";

const ITEM_HEIGHT = 52;
const REEL_LENGTH = 26;
// The team column settles a beat before the era column — a small stagger
// reads as more natural than both reels stopping in perfect lockstep.
const TEAM_DURATION = 3.1;
const ERA_DURATION = 3.9;
// A smooth, long-tailed ease-out (close to "easeOutExpo") — quick to get
// moving, then a slow, gentle glide into the landing item rather than an
// abrupt stop.
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function buildReelSequence(seedKey: string, pool: string[], finalValue: string): string[] {
  const rng = createRng(seedKey);
  const decoys = Array.from({ length: REEL_LENGTH - 1 }, () => pickRandom(rng, pool));
  return [...decoys, finalValue];
}

function ReelColumn({
  label,
  items,
  duration,
  onAnimationComplete,
}: {
  label: string;
  items: string[];
  duration: number;
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
          transition={{ duration, ease: EASE }}
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

  // onAnimationComplete relies on requestAnimationFrame, which browsers can
  // throttle or pause entirely for a backgrounded tab (e.g. a user switches
  // apps mid-spin on their phone) — a plain setTimeout still fires in that
  // case, so this guarantees the pick resolves even if the visual settle
  // got cut short. completedRef guards against firing the commit twice if
  // the real animation callback does still land.
  const completedRef = useRef(false);
  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    completedRef.current = false;
    const timer = setTimeout(handleComplete, ERA_DURATION * 1000 + 500);
    return () => clearTimeout(timer);
  }, [target, handleComplete]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Spinning…</p>
      <div className="grid w-full max-w-md grid-cols-2 gap-3 px-6">
        <ReelColumn label="Team" items={teamSequence} duration={TEAM_DURATION} />
        <ReelColumn label="Era" items={eraSequence} duration={ERA_DURATION} onAnimationComplete={handleComplete} />
      </div>
    </div>
  );
}
