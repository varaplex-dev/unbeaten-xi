"use client";

import { useEffect, useRef, useState } from "react";
import { useGameDataReady } from "@/lib/data/useGameData";
import { cn } from "@/lib/utils";

const MIN_VISIBLE_MS = 1800; // let the clip get going before it can dismiss
const MAX_VISIBLE_MS = 12000; // safety valve — never trap the user behind the splash

/**
 * First-load splash: plays the loader video (batter hitting the ball) while the
 * ~3MB player dataset downloads (see loadGameData), then fades out once it's
 * ready. Only appears on a genuine cold start — if the data is already cached it
 * never mounts, and because it lives in the persistent root layout it isn't
 * re-shown on internal navigation, only on a full reload.
 */
export function GameSplash() {
  const dataReady = useGameDataReady();
  // Decided once, at first mount: skip entirely if the data was already loaded.
  const [active] = useState(() => !dataReady);
  const [minElapsed, setMinElapsed] = useState(false);
  const [maxFired, setMaxFired] = useState(false);
  const [gone, setGone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!active) return;
    const minT = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const maxT = setTimeout(() => setMaxFired(true), MAX_VISIBLE_MS);
    return () => {
      clearTimeout(minT);
      clearTimeout(maxT);
    };
  }, [active]);

  // Try to play WITH sound first. Browsers block unmuted autoplay unless the
  // origin already has media engagement / a prior user gesture, so on a true
  // cold load this usually falls back to muted playback — the clip still plays,
  // just silent until the browser trusts the origin (often a later reload).
  useEffect(() => {
    if (!active) return;
    const v = videoRef.current;
    if (!v) return;
    v.volume = 1;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [active]);

  // Dismiss once the data is in AND the clip has had a moment (or the safety
  // timeout fired). Derived, so nothing sets state during render.
  const hidden = active && ((dataReady && minElapsed) || maxFired);

  // Unmount after the fade-out transition so nothing lingers over the app.
  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => setGone(true), 700);
    return () => clearTimeout(t);
  }, [hidden]);

  if (!active || gone) return null;

  return (
    <div
      className={cn("game-splash", hidden && "game-splash--hidden")}
      role="status"
      aria-label="Loading"
      aria-hidden={hidden}
    >
      <video ref={videoRef} className="game-splash__video" src="/loader.mp4" playsInline preload="auto" />
    </div>
  );
}
