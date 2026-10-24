"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

// Device-smart "get the app" funnel. One link (unbeatengame.com/get) that routes
// each visitor to the best way to install/play: Android -> Google Play, iPhone ->
// Add to Home Screen, desktop/other -> play in browser. Kept English/static like
// the other utility pages (privacy, about, contact); localization can follow.
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.unbeatengame.app";

type Platform = "android" | "ios" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ reports as Mac; the touch check disambiguates.
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document)) return "ios";
  return "other";
}

// Never changes during a session, so subscribe is a no-op; the server snapshot
// is "other" (SSR-safe, matches first client paint → no hydration mismatch),
// then the client snapshot resolves the real platform without an effect.
const subscribe = () => () => {};

export default function GetPage() {
  const platform = useSyncExternalStore<Platform>(subscribe, detectPlatform, () => "other");

  return (
    <main className="flex-1 px-4 py-12 max-w-md mx-auto w-full flex flex-col items-center text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">T20 League</p>
      <h1 className="mt-3 text-3xl font-black italic tracking-tight text-accent">The Unbeaten Game</h1>
      <p className="mt-3 text-sm text-foreground-muted">
        Draft a Playing XI from real cricketers, set your lineup, and chase an unbeaten T20 season.
      </p>

      <div className="mt-8 w-full space-y-3">
        {platform === "android" && (
          <>
            <a
              href={PLAY_URL}
              className="block w-full rounded-xl bg-accent px-5 py-4 font-bold text-[#04120d] cta-glow"
            >
              Get it on Google Play
            </a>
            <Link
              href="/"
              className="block w-full rounded-xl border border-border bg-background-elevated px-5 py-4 font-semibold text-foreground"
            >
              Or play in your browser
            </Link>
          </>
        )}

        {platform === "ios" && (
          <>
            <Link
              href="/"
              className="block w-full rounded-xl bg-accent px-5 py-4 font-bold text-[#04120d] cta-glow"
            >
              Play now
            </Link>
            <div className="rounded-xl border border-border bg-background-elevated px-5 py-4 text-left text-sm text-foreground-muted">
              <p className="font-semibold text-foreground">Add it to your home screen</p>
              <p className="mt-1">
                In Safari, tap the <span className="text-foreground">Share</span> icon, then{" "}
                <span className="text-foreground">Add to Home Screen</span> — it installs like an app.
              </p>
            </div>
          </>
        )}

        {platform === "other" && (
          <>
            <Link
              href="/"
              className="block w-full rounded-xl bg-accent px-5 py-4 font-bold text-[#04120d] cta-glow"
            >
              Play now in your browser
            </Link>
            <a
              href={PLAY_URL}
              className="block w-full rounded-xl border border-border bg-background-elevated px-5 py-4 font-semibold text-foreground"
            >
              On Android? Get it on Google Play
            </a>
            <p className="pt-1 text-xs text-foreground-muted">
              On iPhone? Open this page on your phone and use Safari&apos;s{" "}
              <span className="text-foreground">Add to Home Screen</span>.
            </p>
          </>
        )}
      </div>

      <Link href="/" className="mt-10 text-xs text-accent underline underline-offset-4">
        unbeatengame.com
      </Link>
    </main>
  );
}
