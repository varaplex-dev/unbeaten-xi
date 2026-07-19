import { en } from "./dictionaries/en";
import { hi } from "./dictionaries/hi";
import { ta } from "./dictionaries/ta";
import { kn } from "./dictionaries/kn";
import { te } from "./dictionaries/te";
import { mr } from "./dictionaries/mr";
import { bn } from "./dictionaries/bn";
import type { Dictionary, TranslationKey } from "./dictionaries/en";
import type { LocaleCode } from "./locales";

export type { Dictionary, TranslationKey };
export { LOCALES, DEFAULT_LOCALE } from "./locales";
export type { LocaleCode } from "./locales";

// Only the UI chrome covered so far (nav, landing, play, settings) is
// translated — deeper gameplay screens (squad-select, team-setup, results,
// match commentary) still render in English regardless of locale. Extending
// coverage just means adding keys to dictionaries/en.ts and the same key to
// every other locale file; TypeScript enforces every locale stays complete
// since each is typed against Dictionary.
const DICTIONARIES: Record<LocaleCode, Dictionary> = { en, hi, ta, kn, te, mr, bn };

export function getDictionary(locale: LocaleCode): Dictionary {
  return DICTIONARIES[locale] ?? en;
}
