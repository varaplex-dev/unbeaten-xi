import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeroPlayerImage } from "@/components/brand/HeroPlayerImage";
import { PosterShell } from "@/components/brand/PosterShell";

export default function LandingPage() {
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
          T20 League &middot; Season One
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
            Can You Go Undefeated?
          </p>
        </div>

        <p className="relative z-10 mx-auto mt-5 max-w-md text-center text-foreground-muted">
          Spin into real teams and pick real players — then it&apos;s on you
          to build the XI: batting order, captain, bowling plan, all your
          call. The season simulation runs on real career stats, so how well
          you actually know the game decides how close you get to 14-0.
        </p>

        <div className="relative z-10 mx-auto mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:w-auto sm:flex-row">
          <Link href="/play" className="w-full sm:w-auto">
            <Button size="lg" className="w-full">
              Start Spinning
            </Button>
          </Link>
          <Link href="/daily" className="w-full sm:w-auto">
            <Button size="lg" variant="secondary" className="w-full">
              Daily Challenge
            </Button>
          </Link>
        </div>

        <div className="relative z-10 mx-auto mt-6 flex gap-4 text-sm text-foreground-muted">
          <Link href="/how-to-play" className="underline underline-offset-4 hover:text-foreground">
            How to play
          </Link>
          <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">
            Settings
          </Link>
        </div>

        {/* Venue-style info strip, echoing the reference poster's footer block */}
        <div className="relative z-10 mt-10 border-t border-white/10 pt-4 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
            Spin. Build. Simulate.
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Real Players &middot; Real Stats &middot; 14 League Matches
          </p>
        </div>
      </PosterShell>
    </main>
  );
}
