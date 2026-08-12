import type { Metadata, Viewport } from "next";
// Geist is loaded from the `geist` package, which vendors the font files
// locally, rather than from next/font/google. The Google Fonts loader fetches
// the font at BUILD time, so a build (or CI) with no network route to
// fonts.googleapis.com fails outright — which was happening here. The local
// package has no such dependency and exposes the same `--font-geist-sans` /
// `--font-geist-mono` CSS variables globals.css already uses.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { HomeButton } from "@/components/nav/HomeButton";
import { TopNav } from "@/components/nav/TopNav";
import { LocaleDirection } from "@/components/nav/LocaleDirection";
import { GameDataPreload } from "@/lib/data/useGameData";
import { GameSplash } from "@/components/brand/GameSplash";
import "./globals.css";

export const metadata: Metadata = {
  // Falls back to localhost for local dev; set to the real domain
  // (unbeatengame.com) via NEXT_PUBLIC_SITE_URL wherever this is deployed —
  // needed so og/twitter image URLs resolve to absolute paths instead of
  // warning at build time.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "The Unbeaten XI",
  description:
    "Draft a T20 Playing XI from real players and real career stats, then try to finish an undefeated season.",
  applicationName: "The Unbeaten XI",
  // iOS home-screen web app: run full-screen, dark status bar over the content.
  appleWebApp: {
    capable: true,
    title: "Unbeaten XI",
    statusBarStyle: "black-translucent",
  },
};

// Mobile-first: theme the Android status bar / task switcher and the PWA splash
// with the app background, and let content run under notches (safe areas are
// handled in CSS). maximumScale left generous so pinch-zoom still works.
export const viewport: Viewport = {
  themeColor: "#070b10",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <div className="app-backdrop" aria-hidden />
        <div className="app-field stadium-glow" aria-hidden />
        <div className="app-field floodlight-rays" aria-hidden />
        <div className="app-field field-texture" aria-hidden />
        <LocaleDirection />
        <GameDataPreload />
        <GameSplash />
        <HomeButton />
        <TopNav />
        {children}
      </body>
    </html>
  );
}
