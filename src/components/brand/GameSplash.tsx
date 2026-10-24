"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useGameDataReady } from "@/lib/data/useGameData";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";

const MIN_VISIBLE_MS = 1800; // let the clip get going before it can dismiss
const MAX_VISIBLE_MS = 12000; // safety valve — never trap the user behind the splash

/**
 * First-load splash: plays the loader video (batter hitting the ball) while the
 * ~3MB player dataset downloads (see loadGameData), then fades out once it's
 * ready. Only appears on a genuine cold start — if the data is already cached it
 * never mounts, and because it lives in the persistent root layout it isn't
 * re-shown on internal navigation, only on a full reload.
 *
 * Sound: ALWAYS starts muted (web and installed app alike) with an on-screen
 * toggle — a splash that blasts audio on load is hostile; the user opts in.
 */
export function GameSplash() {
  const dataReady = useGameDataReady();
  const { t } = useTranslation();
  // Decided once, at first mount: skip entirely if the data was already loaded.
  const [active] = useState(() => !dataReady);
  // Always start muted; the sound toggle is always available so the user can
  // enable audio with a tap (which also satisfies the browser's gesture gate).
  const [muted, setMuted] = useState(true);
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

  // Keep the <video> element's muted flag in sync with our state and (re)start
  // playback whenever it changes. We start muted, which always autoplays
  // silently; the user's tap on the toggle is a gesture that lets a subsequent
  // unmuted play() go through.
  useEffect(() => {
    if (!active) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.volume = 1;
    v.play().catch(() => {
      if (!v.muted) {
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      }
    });
  }, [active, muted]);

  const toggleSound = useCallback(() => {
    const v = videoRef.current;
    if (!v) {
      setMuted((m) => !m);
      return;
    }
    // Apply mute/unmute and (re)start playback SYNCHRONOUSLY, inside this click
    // gesture — a play() deferred to an effect runs after the gesture ends, and
    // the browser can then refuse unmuted playback, silently snapping the sound
    // back off. Driving the element directly here keeps the unmute honoured.
    const next = !v.muted;
    v.muted = next;
    v.volume = 1;
    void v.play().catch(() => {});
    setMuted(next);
  }, []);

  // Dismiss once the data is in AND the clip has had a moment (or the safety
  // timeout fired). Derived, so nothing sets state during render.
  const hidden = active && ((dataReady && minElapsed) || maxFired);

  // Unmount after the cross-dissolve finishes (matches the 850ms CSS
  // transition) so nothing lingers over the app.
  useEffect(() => {
    if (!hidden) return;
    const tmr = setTimeout(() => setGone(true), 900);
    return () => clearTimeout(tmr);
  }, [hidden]);

  if (!active || gone) return null;

  return (
    <div
      className={cn("game-splash", hidden && "game-splash--hidden")}
      role="status"
      aria-label={t("splash.loading")}
      aria-hidden={hidden}
    >
      <video ref={videoRef} className="game-splash__video" src="/loader.mp4" playsInline preload="auto" />
      <button
        type="button"
        onClick={toggleSound}
        className="game-splash__sound"
        aria-label={muted ? t("splash.unmute") : t("splash.mute")}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        <span>{muted ? t("splash.unmute") : t("splash.mute")}</span>
      </button>
    </div>
  );
}
