"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Globe, Menu, X, BookOpen, Mail, Smartphone, LogIn, Check } from "lucide-react";
import { useLocaleStore } from "@/lib/store/localeStore";
import { useAuthStore } from "@/lib/store/authStore";
import { useGuestStore } from "@/lib/store/guestStore";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { LOCALES } from "@/lib/i18n/locales";
import { FlagIcon } from "@/components/brand/FlagIcon";
import { useInBrowser } from "@/lib/hooks/useInBrowser";
import { cn } from "@/lib/utils";

type Panel = "menu" | "language" | null;

/** Global top-right controls: a globe that opens the language picker (each
 * language prefixed with its country flag) and a hamburger that opens the
 * menu (How to Play, Contact Us, Get the App [browser-only], Sign In). One
 * panel open at a time; closes on outside-click, Escape, or item select. */
export function TopNav() {
  const [panel, setPanel] = useState<Panel>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const guestId = useGuestStore((s) => s.guestId);
  const ensureGuestId = useGuestStore((s) => s.ensureGuestId);
  useEffect(() => {
    if (!user) ensureGuestId();
  }, [user, ensureGuestId]);

  // "Get the App" only makes sense in a regular browser tab, not inside the
  // installed/native app itself.
  const inBrowser = useInBrowser();
  const [showAppNote, setShowAppNote] = useState(false);

  useEffect(() => {
    if (!panel) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPanel(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPanel(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const iconBtn =
    "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background-elevated/90 text-foreground-muted shadow-lg backdrop-blur transition-colors hover:border-accent/50 hover:text-accent";

  return (
    <div ref={rootRef} className="fixed right-4 top-4 z-50 flex items-center gap-2">
      <button
        type="button"
        aria-label={t("nav.language")}
        aria-expanded={panel === "language"}
        onClick={() => setPanel((p) => (p === "language" ? null : "language"))}
        className={cn(iconBtn, panel === "language" && "border-accent/60 text-accent")}
      >
        <Globe className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label={t("nav.menu")}
        aria-expanded={panel === "menu"}
        onClick={() => setPanel((p) => (p === "menu" ? null : "menu"))}
        className={cn(iconBtn, panel === "menu" && "border-accent/60 text-accent")}
      >
        {panel === "menu" ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {panel === "language" && (
        <div className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-background-elevated/95 shadow-xl backdrop-blur">
          <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted">
            {t("nav.language")}
          </p>
          <ul className="pb-2">
            {LOCALES.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => {
                    setLocale(l.code);
                    setPanel(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-white/5",
                    l.code === locale ? "text-accent" : "text-foreground"
                  )}
                >
                  <FlagIcon locale={l.code} />
                  <span className="flex-1 text-left">{l.native}</span>
                  {l.code === locale && <Check className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {panel === "menu" && (
        <div className="absolute right-0 top-13 mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-background-elevated/95 shadow-xl backdrop-blur">
          <nav className="flex flex-col py-2">
            <Link
              href="/how-to-play"
              onClick={() => setPanel(null)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-white/5"
            >
              <BookOpen className="h-4 w-4 text-foreground-muted" />
              {t("nav.howToPlay")}
            </Link>
            <Link
              href="/contact"
              onClick={() => setPanel(null)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-white/5"
            >
              <Mail className="h-4 w-4 text-foreground-muted" />
              {t("nav.contact")}
            </Link>
            <Link
              href="/settings"
              onClick={() => setPanel(null)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-white/5"
            >
              <LogIn className="h-4 w-4 text-foreground-muted" />
              <span className="flex flex-col">
                <span>{user ? (profile?.username ?? t("nav.account")) : t("nav.signIn")}</span>
                {!user && guestId && (
                  <span className="font-mono text-[10px] text-foreground-muted">{guestId}</span>
                )}
              </span>
            </Link>

            {inBrowser && (
              <div className="mt-1 border-t border-border px-4 pb-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAppNote(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-[#04120d] transition-opacity hover:opacity-90"
                >
                  <Smartphone className="h-4 w-4" />
                  {t("landing.getTheApp")}
                </button>
                {showAppNote && (
                  <p className="mt-2 text-center text-xs text-foreground-muted">{t("landing.getTheAppSoon")}</p>
                )}
              </div>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
