"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";

/** A persistent way back to mode-select from anywhere mid-game (squad
 * select, team setup, season, results, etc.) — those pages have no other
 * nav chrome, so without this the only way back was the browser's back
 * button. Hidden on the home page itself since there's nowhere to go. */
export function HomeButton() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <Link
      href="/"
      aria-label="Home"
      title="Home"
      className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background-elevated/90 text-foreground-muted shadow-lg backdrop-blur transition-colors hover:border-accent/50 hover:text-accent"
    >
      <Home className="h-5 w-5" />
    </Link>
  );
}
