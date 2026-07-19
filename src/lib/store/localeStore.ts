import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOCALE, type LocaleCode } from "@/lib/i18n/locales";

interface LocaleState {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
}

// Deliberately its own tiny store rather than a field on gameStore — the
// chosen language is a device/browser preference, not part of any one
// game's state, so it shouldn't be touched by resetGame()/startNewGame()'s
// full-state spreads.
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
    }),
    { name: "unbeaten-xi-locale" }
  )
);
