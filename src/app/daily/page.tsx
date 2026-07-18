"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import { todaySeedString } from "@/lib/engine/rng";

export default function DailyChallengePage() {
  const router = useRouter();
  const seed = useGameStore((s) => s.seed);
  const isDaily = useGameStore((s) => s.isDaily);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const startDailyChallenge = useGameStore((s) => s.startDailyChallenge);

  useEffect(() => {
    if (!hasHydrated) return;
    const isTodaysDaily = isDaily && seed === todaySeedString();
    if (!isTodaysDaily) startDailyChallenge();
    router.replace("/draft");
  }, [hasHydrated, isDaily, seed, startDailyChallenge, router]);

  return null;
}
