"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameStore } from "@/lib/store/gameStore";
import { useAuthStore } from "@/lib/store/authStore";
import { useLocaleStore } from "@/lib/store/localeStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { LOCALES } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

function AccountCard() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const magicLinkSentTo = useAuthStore((s) => s.magicLinkSentTo);
  const authError = useAuthStore((s) => s.authError);
  const requestMagicLink = useAuthStore((s) => s.requestMagicLink);
  const signInWithOAuth = useAuthStore((s) => s.signInWithOAuth);
  const signOut = useAuthStore((s) => s.signOut);
  const [email, setEmail] = useState("");
  const { t } = useTranslation();

  if (!isSupabaseConfigured) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.account")}</CardTitle>
      </CardHeader>
      <CardContent>
        {user ? (
          <div>
            <p className="text-sm text-foreground-muted mb-4">
              {t("settings.signedInAs")}{" "}
              <span className="text-foreground font-semibold">{profile?.username ?? user.email}</span>.{" "}
              {t("settings.signedInDesc")}
            </p>
            <Button variant="secondary" onClick={() => signOut()}>
              {t("settings.signOut")}
            </Button>
          </div>
        ) : magicLinkSentTo ? (
          <p className="text-sm text-foreground-muted">{t("settings.checkEmail")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" className="flex-1" onClick={() => signInWithOAuth("google")}>
                {t("settings.continueWithGoogle")}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => signInWithOAuth("facebook")}>
                {t("settings.continueWithFacebook")}
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-foreground-muted">
              <span className="h-px flex-1 bg-border" />
              {t("settings.or")}
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
                {t("settings.emailSignIn")}
              </Button>
            </form>
          </div>
        )}
        {authError && <p className="mt-3 text-sm text-danger">{authError}</p>}
      </CardContent>
    </Card>
  );
}

function LanguageCard() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.language")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground-muted mb-4">{t("settings.languageDesc")}</p>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                l.code === locale
                  ? "bg-accent text-[#04120d]"
                  : "bg-background-elevated text-foreground-muted border border-border hover:text-foreground"
              )}
            >
              {l.native}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const resetGame = useGameStore((s) => s.resetGame);
  const hasActiveGame = useGameStore((s) => Boolean(s.seed));
  const [confirmingReset, setConfirmingReset] = useState(false);
  const { t } = useTranslation();

  function handleResetConfirmed() {
    resetGame();
    setConfirmingReset(false);
    router.push("/");
  }

  return (
    <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-black tracking-tight mb-1">{t("settings.title")}</h1>
      <p className="text-foreground-muted mb-8">{t("settings.description")}</p>

      <div className="grid gap-4">
        <AccountCard />
        <LanguageCard />

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.activeGame")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground-muted mb-4">
              {hasActiveGame ? t("settings.activeGameDesc") : t("settings.noActiveGame")}
            </p>
            {hasActiveGame && !confirmingReset && (
              <Button variant="secondary" onClick={() => setConfirmingReset(true)}>
                {t("settings.resetGame")}
              </Button>
            )}
            {confirmingReset && (
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-danger text-white hover:bg-danger/90"
                  onClick={handleResetConfirmed}
                >
                  {t("settings.confirmReset")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
                  {t("settings.cancel")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.about")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground-muted space-y-2">
            <p>The Unbeaten XI</p>
            <p>{t("settings.aboutTagline")}</p>
            <Link href="/about" className="inline-block text-accent underline underline-offset-4">
              {t("settings.readMore")}
            </Link>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/how-to-play" className="text-accent underline underline-offset-4">
            {t("nav.howToPlay")}
          </Link>
          <Link href="/about" className="text-accent underline underline-offset-4">
            {t("nav.about")}
          </Link>
          <Link href="/privacy" className="text-accent underline underline-offset-4">
            {t("nav.privacy")}
          </Link>
          {isSupabaseConfigured && (
            <>
              <Link href="/leaderboard" className="text-accent underline underline-offset-4">
                {t("nav.leaderboard")}
              </Link>
              <Link href="/history" className="text-accent underline underline-offset-4">
                {t("nav.myHistory")}
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
