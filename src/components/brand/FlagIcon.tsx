import type { LocaleCode } from "@/lib/i18n/locales";

// Small inline SVG flags for the language selector. Emoji flags (🇺🇸/🇮🇳)
// aren't an option — Windows Chrome has no flag-emoji font and renders them
// as bare letter pairs — so these are drawn as simple, recognizable SVGs.
// Rendered in a rounded 20×14 frame.

function UsFlag() {
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 shrink-0 rounded-[2px]" aria-hidden>
      <rect width="20" height="14" fill="#b22234" />
      {[1, 3, 5, 7, 9, 11, 13].map((y) => (
        <rect key={y} y={y} width="20" height="1" fill="#fff" />
      ))}
      <rect width="9" height="8" fill="#3c3b6e" />
      {[1.5, 4, 6.5].map((cy) =>
        [1.5, 3.5, 5.5, 7.5].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.5" fill="#fff" />)
      )}
    </svg>
  );
}

function IndiaFlag() {
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 shrink-0 rounded-[2px]" aria-hidden>
      <rect width="20" height="14" fill="#fff" />
      <rect width="20" height="4.667" fill="#ff9933" />
      <rect y="9.333" width="20" height="4.667" fill="#138808" />
      <circle cx="10" cy="7" r="1.9" fill="none" stroke="#000080" strokeWidth="0.5" />
      <circle cx="10" cy="7" r="0.4" fill="#000080" />
    </svg>
  );
}

// Every supported Indian language maps to the India flag; English uses the
// US flag per the design.
export function FlagIcon({ locale }: { locale: LocaleCode }) {
  return locale === "en" ? <UsFlag /> : <IndiaFlag />;
}
