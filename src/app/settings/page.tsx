"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameStore } from "@/lib/store/gameStore";

export default function SettingsPage() {
  const router = useRouter();
  const resetGame = useGameStore((s) => s.resetGame);
  const hasActiveGame = useGameStore((s) => Boolean(s.seed));
  const [confirmingReset, setConfirmingReset] = useState(false);

  function handleResetConfirmed() {
    resetGame();
    setConfirmingReset(false);
    router.push("/");
  }

  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-1">Settings</h1>
      <p className="text-foreground-muted mb-8">
        14-0 saves your progress locally in this browser — nothing is sent
        anywhere unless you&apos;re signed in.
      </p>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Active Game</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground-muted mb-4">
              {hasActiveGame
                ? "Clear your current draft, lineup, and season progress. This can't be undone."
                : "No active game right now."}
            </p>
            {hasActiveGame && !confirmingReset && (
              <Button variant="secondary" onClick={() => setConfirmingReset(true)}>
                Reset Current Game
              </Button>
            )}
            {confirmingReset && (
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-danger text-white hover:bg-danger/90"
                  onClick={handleResetConfirmed}
                >
                  Yes, Clear It
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-1">
            <p>14-0: Build the Unbeaten XI</p>
            <p>A production of 11 Not Out.</p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/how-to-play" className="text-accent underline underline-offset-4">
            How to Play
          </Link>
          <Link href="/privacy" className="text-accent underline underline-offset-4">
            Privacy
          </Link>
        </div>
      </div>
    </main>
  );
}
