export const LOCALES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ur", label: "Urdu", native: "اردو" },
  { code: "ps", label: "Pashto", native: "پښتو" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "mr", label: "Marathi", native: "मराठी" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: LocaleCode = "en";

// Right-to-left scripts — the document's `dir` is switched to "rtl" for
// these so Urdu/Pashto text (Arabic script) lays out correctly. See
// LocaleDirection.tsx.
const RTL_LOCALES = new Set<LocaleCode>(["ur", "ps"]);
export function isRtlLocale(code: LocaleCode): boolean {
  return RTL_LOCALES.has(code);
}
