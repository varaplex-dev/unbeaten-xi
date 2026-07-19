import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { HomeButton } from "@/components/nav/HomeButton";
import { TopNav } from "@/components/nav/TopNav";
import { LocaleDirection } from "@/components/nav/LocaleDirection";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Falls back to localhost for local dev; set to the real domain
  // (unbeatengame.com) via NEXT_PUBLIC_SITE_URL wherever this is deployed —
  // needed so og/twitter image URLs resolve to absolute paths instead of
  // warning at build time.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "The Unbeaten XI",
  description:
    "Draft a T20 Playing XI and try to finish a 14-match league season undefeated.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <div className="app-backdrop" aria-hidden />
        <LocaleDirection />
        <HomeButton />
        <TopNav />
        {children}
      </body>
    </html>
  );
}
