import type { LocaleCode } from "@/lib/i18n/locales";

// Small inline SVG flags for the language selector. Emoji flags aren't an
// option — Windows Chrome has no flag-emoji font and renders them as bare
// letter pairs — so these are drawn as simple, recognizable SVGs in a
// rounded 20×14 frame.

const frame = "h-3.5 w-5 shrink-0 rounded-[2px]";

function UsFlag() {
  return (
    <svg viewBox="0 0 20 14" className={frame} aria-hidden>
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
    <svg viewBox="0 0 20 14" className={frame} aria-hidden>
      <rect width="20" height="14" fill="#fff" />
      <rect width="20" height="4.667" fill="#ff9933" />
      <rect y="9.333" width="20" height="4.667" fill="#138808" />
      <circle cx="10" cy="7" r="1.9" fill="none" stroke="#000080" strokeWidth="0.5" />
      <circle cx="10" cy="7" r="0.4" fill="#000080" />
    </svg>
  );
}

function PakistanFlag() {
  return (
    <svg viewBox="0 0 20 14" className={frame} aria-hidden>
      <rect width="20" height="14" fill="#01411c" />
      <rect width="5" height="14" fill="#fff" />
      {/* crescent: white disc with an offset green disc carved out */}
      <circle cx="12" cy="7" r="3.1" fill="#fff" />
      <circle cx="13.1" cy="6.4" r="2.6" fill="#01411c" />
      {/* star */}
      <path d="M14.9 4.6 L15.35 5.65 L16.45 5.75 L15.6 6.5 L15.85 7.6 L14.9 7 L13.95 7.6 L14.2 6.5 L13.35 5.75 L14.45 5.65 Z" fill="#fff" />
    </svg>
  );
}

function AfghanistanFlag() {
  // Pre-2021 black–red–green vertical tricolor with a light central
  // emblem — the flag long associated with Afghan sport (the cricket team).
  return (
    <svg viewBox="0 0 20 14" className={frame} aria-hidden>
      <rect width="6.667" height="14" fill="#000" />
      <rect x="6.667" width="6.667" height="14" fill="#be0000" />
      <rect x="13.333" width="6.667" height="14" fill="#007a36" />
      <circle cx="10" cy="7" r="2.1" fill="none" stroke="#fff" strokeWidth="0.5" />
      <circle cx="10" cy="7" r="0.9" fill="#fff" />
    </svg>
  );
}

function BangladeshFlag() {
  return (
    <svg viewBox="0 0 20 14" className={frame} aria-hidden>
      <rect width="20" height="14" fill="#006a4e" />
      <circle cx="9" cy="7" r="4" fill="#f42a41" />
    </svg>
  );
}

// Each language maps to its national flag; Indian-language locales share the
// India flag, everything else keys off the country the language belongs to.
export function FlagIcon({ locale }: { locale: LocaleCode }) {
  switch (locale) {
    case "en":
      return <UsFlag />;
    case "ur":
      return <PakistanFlag />;
    case "ps":
      return <AfghanistanFlag />;
    case "bn":
      return <BangladeshFlag />;
    default:
      return <IndiaFlag />;
  }
}
