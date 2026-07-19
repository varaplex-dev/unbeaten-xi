"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/** True in a regular browser tab, false inside the installed/native app
 * (standalone display mode or iOS home-screen launch). Uses
 * useSyncExternalStore so the client-only value doesn't trip hydration
 * warnings or the "setState in effect" lint rule — the server snapshot is
 * false, so browser-only UI mounts after hydration rather than during SSR. */
export function useInBrowser(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () =>
      !(
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true
      ),
    () => false
  );
}
