"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useGameDataReady } from "@/lib/data/useGameData";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";

const MIN_VISIBLE_MS = 1800; // let the clip get going before it can dismiss
const MAX_VISIBLE_MS = 12000; // safety valve — never trap the user behind the splash

/** True when the app is running as an INSTALLED app — a PWA launched from the
 * home screen (display-mode standalone/fullscreen) or an iOS home-screen web
 * app (the non-standard navigator.standalone flag) — rather than a normal
 * browser tab. Installed apps get the loader's sound automatically; browser
 * tabs start muted with a toggle, because (a) browsers block unmuted autoplay
 * on a cold load anyway and (b) an unexpected blast of audio from a page you
 * just opened in a tab is hostile. */
function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.bind(window);
  const displayApp = Boolean(
    mm?.("(display-mode: standalone)")?.matches || mm?.("(display-mode: fullscreen)")?.matches
  );
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return displayApp || iosStandalone;
}

/**
 * First-load splash: plays the loader video (batter hitting the ball) while the
 * ~3MB player dataset downloads (see loadGameData), then fades out once it's
 * ready. Only appears on a genuine cold start — if the data is already cached it
 * never mounts, and because it lives in the persistent root layout it isn't
 * re-shown on internal navigation, only on a full reload.
 *
 * Sound: automatic in the installed app, opt-in via an on-screen toggle in a
 * browser tab — see isStandaloneApp().
 */
export function GameSplash() {
  const dataReady = useGameDataReady();
  const { t } = useTranslation();
  // Decided once, at first mount: skip entirely if the data was already loaded.
  const [active] = useState(() => !dataReady);
  // Installed app → the toggle is hidden and sound is on. Browser tab → show
  // the toggle and start muted. Both decided once at mount.
  const [appMode] = useState(isStandaloneApp);
  const [muted, setMuted] = useState(() => !isStandaloneApp());
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
  // playback whenever it changes. In the installed app we start unmuted; if the
  // platform still refuses to autoplay with sound, fall back to muted so the
  // clip always plays. In a browser tab we start muted, which always autoplays;
  // the user's tap on the toggle is a gesture that lets the unmuted play() go
  // through.
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
      aria-label="Loading"
      aria-hidden={hidden}
    >
      <video ref={videoRef} className="game-splash__video" src="/loader.mp4" playsInline preload="auto" />
      {!appMode && (
        <button
          type="button"
          onClick={toggleSound}
          className="game-splash__sound"
          aria-label={muted ? t("splash.unmute") : t("splash.mute")}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          <span>{muted ? t("splash.unmute") : t("splash.mute")}</span>
        </button>
      )}
    </div>
  );
}
