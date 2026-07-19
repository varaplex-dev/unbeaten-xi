"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GuestState {
  /** A stable anonymous id for players who haven't created an account.
   * Persists in this browser until they sign up, so their local progress
   * and (future) unsynced results stay tied to one identity. Null until
   * first generated — call ensureGuestId() from a mounted client component
   * so it isn't created during SSR (which would mismatch on hydration). */
  guestId: string | null;
  ensureGuestId: () => string;
}

function makeGuestId(): string {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `guest-${rand}`;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set, get) => ({
      guestId: null,
      ensureGuestId: () => {
        const existing = get().guestId;
        if (existing) return existing;
        const id = makeGuestId();
        set({ guestId: id });
        return id;
      },
    }),
    { name: "unbeaten-xi-guest" }
  )
);
