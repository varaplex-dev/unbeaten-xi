// An original, stylized cricket-batter illustration for the hero section.
// Deliberately geometric/flat rather than photorealistic, and the face is
// left as an unlit silhouette — this is a generic "any player" figure, not a
// likeness of any real athlete. Colors are pulled from the app's CSS custom
// properties so it stays in sync with the theme.
export function CricketHeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 620"
      className={className}
      role="img"
      aria-label="Illustration of a cricket batter in a ready stance, bat raised"
    >
      <defs>
        <linearGradient id="jerseyGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--jersey-light)" />
          <stop offset="100%" stopColor="var(--jersey)" />
        </linearGradient>
        <linearGradient id="batGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d9a25c" />
          <stop offset="100%" stopColor="#a86a34" />
        </linearGradient>
        <radialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.55)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="helmetGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--jersey-light)" />
          <stop offset="100%" stopColor="var(--jersey)" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="205" cy="592" rx="130" ry="22" fill="url(#groundShadow)" />

      {/* Back leg pad */}
      <path
        d="M158 372 L146 486 Q144 508 168 512 L200 512 Q212 508 208 488 L196 374 Z"
        fill="var(--pad)"
      />
      <rect x="150" y="452" width="60" height="14" rx="4" fill="var(--saffron)" opacity="0.85" />

      {/* Front leg pad */}
      <path
        d="M226 380 L246 492 Q250 514 226 518 L192 518 Q178 514 184 492 L206 382 Z"
        fill="var(--pad)"
      />
      <rect x="192" y="460" width="60" height="14" rx="4" fill="var(--accent)" opacity="0.85" />

      {/* Batting shoes */}
      <path d="M140 500 L212 500 L216 520 Q216 530 202 530 L146 530 Q134 530 134 518 Z" fill="#e9e4d6" />
      <path d="M184 508 L254 508 L260 526 Q260 536 246 536 L192 536 Q180 536 180 524 Z" fill="#e9e4d6" />

      {/* Trailing (left) arm, resting toward hip */}
      <path
        d="M164 246 Q136 268 130 316 Q126 348 146 360 Q160 368 168 352 Q152 340 156 314 Q160 284 182 264 Z"
        fill="url(#jerseyGrad)"
      />
      <circle cx="147" cy="358" r="15" fill="var(--saffron)" />

      {/* Torso / jersey */}
      <path
        d="M172 220 Q210 196 250 220 L268 320 Q272 372 244 386 L178 386 Q150 372 154 320 Z"
        fill="url(#jerseyGrad)"
      />
      {/* Jersey collar + trim */}
      <path d="M190 216 Q211 234 232 216 L232 230 Q211 246 190 230 Z" fill="var(--saffron)" />
      <path d="M154 320 Q211 340 268 320 L266 336 Q211 356 156 336 Z" fill="rgba(255,255,255,0.08)" />

      {/* Chest number */}
      <text
        x="211"
        y="300"
        textAnchor="middle"
        fontFamily="var(--font-sans), sans-serif"
        fontWeight="800"
        fontSize="54"
        fill="rgba(244,246,248,0.92)"
      >
        11
      </text>

      {/* Shoulder badge */}
      <circle cx="250" cy="232" r="16" fill="var(--background-elevated)" stroke="var(--gold)" strokeWidth="2" />
      <text
        x="250"
        y="237"
        textAnchor="middle"
        fontFamily="var(--font-sans), sans-serif"
        fontWeight="700"
        fontSize="11"
        fill="var(--gold)"
      >
        NO
      </text>

      {/* Cricket bat, resting diagonally over the raised shoulder */}
      <g transform="rotate(-32 268 190)">
        <rect x="256" y="60" width="26" height="150" rx="6" fill="url(#batGrad)" />
        <rect x="260" y="204" width="18" height="140" rx="8" fill="#c98f52" />
        <rect x="264" y="330" width="10" height="60" rx="4" fill="#3a2a1a" />
      </g>

      {/* Raised (right) arm gripping the bat handle */}
      <path
        d="M254 226 Q288 214 302 238 Q314 258 296 280 Q282 292 268 276 Q282 262 274 244 Q266 230 246 240 Z"
        fill="url(#jerseyGrad)"
      />
      <circle cx="296" cy="262" r="16" fill="var(--saffron)" />

      {/* Neck */}
      <rect x="196" y="196" width="30" height="28" rx="10" fill="#c98a5c" />

      {/* Head silhouette (kept unlit / featureless by design) */}
      <ellipse cx="211" cy="176" rx="30" ry="34" fill="#8a5a3a" opacity="0.9" />

      {/* Helmet shell */}
      <path
        d="M177 168 Q177 122 211 116 Q245 122 245 168 Q245 190 232 198 L190 198 Q177 190 177 168 Z"
        fill="url(#helmetGrad)"
      />
      {/* Helmet peak */}
      <path d="M182 168 Q211 156 240 168 L236 178 Q211 168 186 178 Z" fill="var(--saffron)" />
      {/* Helmet back stem */}
      <rect x="205" y="112" width="12" height="20" rx="4" fill="var(--gold)" />
      {/* Grille */}
      <g stroke="rgba(244,246,248,0.85)" strokeWidth="2.5" strokeLinecap="round">
        <line x1="192" y1="188" x2="192" y2="210" />
        <line x1="203" y1="192" x2="203" y2="214" />
        <line x1="214" y1="194" x2="214" y2="216" />
        <line x1="225" y1="192" x2="225" y2="212" />
        <line x1="186" y1="196" x2="228" y2="196" />
        <line x1="188" y1="206" x2="226" y2="206" />
      </g>

      {/* Rim light accents */}
      <path
        d="M172 220 Q210 196 250 220"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        opacity="0.5"
      />
    </svg>
  );
}
