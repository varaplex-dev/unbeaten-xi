"use client";

import Link from "next/link";
import { Users, ClipboardList, BarChart3, Disc3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroPlayerImage } from "@/components/brand/HeroPlayerImage";
import { PosterShell } from "@/components/brand/PosterShell";
import { ModeGrid } from "@/components/play/ModeGrid";
import { useGameStore } from "@/lib/store/gameStore";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { matchesFor } from "@/lib/engine/competitions";

// The hero advertises the flagship league campaign, so it reads its length
// from that competition rather than restating 14 as a literal — World Cup Run
// is 9, and the number shown must never drift from the one simulated.
const SEASON_MATCHES = matchesFor("league-major");

export default function LandingPage() {
  const { t } = useTranslation();
  const bestSeason = useGameStore((s) => s.bestSeason);
  const bestLosses = bestSeason ? bestSeason.losses : 0;

  const features = [
    { icon: Users, text: t("landing.feature1") },
    { icon: ClipboardList, text: t("landing.feature2") },
    { icon: BarChart3, text: t("landing.feature3") },
  ];

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker="Unbeaten XI">
        <div className="esports-frame relative mx-auto w-full max-w-md">
          {/* Decorative kicker with flanking hairlines */}
          <div className="mt-2 flex items-center justify-center gap-3">
            <span className="gold-hairline w-10 sm:w-16" />
            <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-gold">T20 League</span>
            <span className="gold-hairline w-10 sm:w-16" />
          </div>

          {/* Hero badge — transparent PNG, blends onto the stadium */}
          <div className="relative z-10 mx-auto mt-5 w-full max-w-[230px] sm:max-w-[260px]">
            <HeroPlayerImage className="w-full drop-shadow-[0_16px_36px_rgba(0,0,0,0.6)]" />
          </div>

          {/* Title with speed lines */}
          <div className="relative z-20 mt-4 flex items-center justify-center gap-3">
            <span className="teal-hairline hidden w-8 sm:block" />
            <h1 className="text-stack-shadow text-center text-4xl font-black italic tracking-tight text-accent sm:text-5xl">
              UNBEATEN XI
            </h1>
            <span className="teal-hairline hidden w-8 sm:block" />
          </div>

          {/* Subtitle with flanking hairlines + dot */}
          <div className="mt-3 flex items-center justify-center gap-2.5">
            <span className="gold-hairline w-6 sm:w-10" />
            <span className="h-1 w-1 rounded-full bg-gold" />
            <p className="text-base font-bold italic tracking-tight text-gold sm:text-lg">{t("landing.tagline")}</p>
            <span className="h-1 w-1 rounded-full bg-gold" />
            <span className="gold-hairline w-6 sm:w-10" />
          </div>

          {/* Goal / record stat boxes, echoing the poster's top-right badges */}
          <div className="mx-auto mt-5 flex max-w-xs items-stretch justify-center gap-3">
            <div className="flex-1 rounded-xl border border-accent/40 bg-black/30 px-4 py-2 text-center">
              <p className="font-mono text-2xl font-bold tabular-nums text-accent">{SEASON_MATCHES}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-muted">
                {t("landing.matches")}
              </p>
            </div>
            <div className="flex-1 rounded-xl border border-gold/40 bg-black/30 px-4 py-2 text-center">
              <p className="font-mono text-2xl font-bold tabular-nums text-gold">{bestLosses}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-muted">
                {t("landing.losses")}
              </p>
            </div>
          </div>

          {/* Feature rows with dividers */}
          <ul className="mt-6">
            {features.map((f, i) => (
              <li
                key={i}
                className={`flex items-center gap-4 py-3 ${i > 0 ? "border-t border-white/10" : ""}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <f.icon className="h-5 w-5" />
                </span>
                <p className="text-sm leading-snug text-foreground-muted">{f.text}</p>
              </li>
            ))}
          </ul>

          {/* Primary CTA */}
          <div className="mt-6">
            <Link href="/play" className="block">
              <Button
                size="lg"
                className="cta-glow w-full gap-2 text-base font-bold uppercase tracking-wide"
              >
                <Disc3 className="h-5 w-5" />
                {t("landing.startSpinning")}
              </Button>
            </Link>
          </div>

          {/* Secondary links */}
          <div className="mt-5 flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-foreground-muted">
            <Link href="/how-to-play" className="transition-colors hover:text-accent">
              {t("nav.howToPlay")}
            </Link>
            <span className="h-3 w-px bg-white/15" />
            <Link href="/settings" className="transition-colors hover:text-accent">
              {t("nav.settings")}
            </Link>
          </div>

          {/* Footer strip */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className="gold-hairline w-8" />
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">{t("landing.footerKicker")}</p>
            <span className="gold-hairline w-8" />
          </div>
          <p className="mt-2 text-center text-[11px] text-foreground-muted">{t("landing.footerTagline")}</p>
        </div>

        {/* Mode grid */}
        <div className="relative z-10 mx-auto mt-12 w-full max-w-2xl">
          <h2 className="text-stack-shadow mb-1 text-2xl font-black italic tracking-tight">{t("play.chooseMode")}</h2>
          <p className="mb-6 text-sm text-foreground-muted">{t("play.intro")}</p>
          <ModeGrid />
        </div>
      </PosterShell>
    </main>
  );
}
