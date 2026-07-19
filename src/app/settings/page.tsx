"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameStore } from "@/lib/store/gameStore";
import { useAuthStore } from "@/lib/store/authStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";

function AccountCard() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const magicLinkSentTo = useAuthStore((s) => s.magicLinkSentTo);
  const authError = useAuthStore((s) => s.authError);
  const requestMagicLink = useAuthStore((s) => s.requestMagicLink);
  const signInWithOAuth = useAuthStore((s) => s.signInWithOAuth);
  const signOut = useAuthStore((s) => s.signOut);
  const [email, setEmail] = useState("");

  if (!isSupabaseConfigured) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent>
        {user ? (
          <div>
            <p className="text-sm text-foreground-muted mb-4">
              Signed in as <span className="text-foreground font-semibold">{profile?.username ?? user.email}</span>.
              Your season results save to your account and count toward the leaderboard.
            </p>
            <Button variant="secondary" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        ) : magicLinkSentTo ? (
          <p className="text-sm text-foreground-muted">
            Check <span className="text-foreground font-semibold">{magicLinkSentTo}</span> for a sign-in link.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" className="flex-1" onClick={() => signInWithOAuth("google")}>
                Continue with Google
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => signInWithOAuth("facebook")}>
                Continue with Facebook
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-foreground-muted">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) requestMagicLink(email.trim());
              }}
            >
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" variant="secondary" className="shrink-0">
                Email Me a Sign-In Link
              </Button>
            </form>
          </div>
        )}
        {authError && <p className="mt-3 text-sm text-danger">{authError}</p>}
      </CardContent>
    </Card>
  );
}

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
        The Unbeaten XI saves your progress locally in this browser — nothing
        is sent anywhere unless you&apos;re signed in.
      </p>

      <div className="grid gap-4">
        <AccountCard />

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
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>The Unbeaten XI</p>
            <p>A Varaplex Studios game.</p>
            <Link href="/about" className="inline-block text-accent underline underline-offset-4">
              Read More
            </Link>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/how-to-play" className="text-accent underline underline-offset-4">
            How to Play
          </Link>
          <Link href="/about" className="text-accent underline underline-offset-4">
            About
          </Link>
          <Link href="/privacy" className="text-accent underline underline-offset-4">
            Privacy
          </Link>
          {isSupabaseConfigured && (
            <>
              <Link href="/leaderboard" className="text-accent underline underline-offset-4">
                Leaderboard
              </Link>
              <Link href="/history" className="text-accent underline underline-offset-4">
                My History
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
