"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeroPlayerImage } from "@/components/brand/HeroPlayerImage";
import { PosterShell } from "@/components/brand/PosterShell";
import { ModeGrid } from "@/components/play/ModeGrid";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell
        kicker="11 Not Out"
        digits={[
          { value: "14", label: "Matches" },
          { value: "0", label: "Losses" },
        ]}
      >
        <p className="relative z-10 text-center text-sm font-bold tracking-[0.35em] text-saffron uppercase mb-4">
          {t("landing.seasonTag")}
        </p>

        {/* Hero badge art */}
        <div className="relative z-10 mx-auto w-full max-w-[240px] sm:max-w-xs">
          <HeroPlayerImage className="w-full rounded-3xl drop-shadow-[0_20px_40px_rgba(0,0,0,0.55)]" />
        </div>

        <div className="relative z-20 mt-5 text-center">
          <p className="text-stack-shadow text-3xl font-black italic tracking-tight text-accent sm:text-4xl">
            UNBEATEN XI
          </p>
          <p className="mt-1 text-lg font-bold italic tracking-tight text-gold sm:text-xl">
            {t("landing.tagline")}
          </p>
        </div>

        <p className="relative z-10 mx-auto mt-5 max-w-md text-center text-foreground-muted">
          {t("landing.description")}
        </p>

        <div className="relative z-10 mx-auto mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:w-auto sm:flex-row">
          <Link href="/play" className="w-full sm:w-auto">
            <Button size="lg" className="w-full">
              {t("landing.startSpinning")}
            </Button>
          </Link>
          <Link href="/daily" className="w-full sm:w-auto">
            <Button size="lg" variant="secondary" className="w-full">
              {t("landing.dailyChallenge")}
            </Button>
          </Link>
        </div>

        <div className="relative z-10 mx-auto mt-6 flex gap-4 text-sm text-foreground-muted">
          <Link href="/how-to-play" className="underline underline-offset-4 hover:text-foreground">
            {t("nav.howToPlay")}
          </Link>
          <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">
            {t("nav.settings")}
          </Link>
        </div>

        {/* Venue-style info strip, echoing the reference poster's footer block */}
        <div className="relative z-10 mt-10 border-t border-white/10 pt-4 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">{t("landing.footerKicker")}</p>
          <p className="mt-1 text-xs text-foreground-muted">{t("landing.footerTagline")}</p>
        </div>

        <div className="relative z-10 mx-auto mt-10 w-full max-w-2xl">
          <h2 className="text-stack-shadow mb-1 text-2xl font-black italic tracking-tight">
            {t("play.chooseMode")}
          </h2>
          <p className="text-foreground-muted mb-6 text-sm">{t("play.intro")}</p>
          <ModeGrid />
        </div>
      </PosterShell>
    </main>
  );
}
