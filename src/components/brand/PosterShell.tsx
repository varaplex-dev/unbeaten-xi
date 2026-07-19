"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ScoreDigit } from "@/components/brand/ScoreDigit";
import { cn } from "@/lib/utils";

interface PosterShellProps {
  kicker: string;
  digits?: { value: string; label: string }[];
  children: ReactNode;
  className?: string;
}

/** Shared stadium-glow poster background + top bar used across every screen. */
export function PosterShell({ kicker, digits, children, className }: PosterShellProps) {
  // Two sets of floating controls overlap this top bar: the HomeButton
  // (top-left, every page except "/") and the TopNav globe+menu (top-right,
  // every page). Pad the kicker clear of the home button, and reserve room
  // on the right so any score digits don't slide under the globe+menu.
  const pathname = usePathname();
  const hasHomeButton = pathname !== "/";

  return (
    <section
      className={cn(
        "stadium-glow floodlight-rays field-texture relative flex flex-1 flex-col overflow-hidden px-6 pt-8 pb-12 sm:pt-12",
        className
      )}
    >
      <div className="relative z-10 flex items-center justify-between pr-28">
        <p className={cn("text-xs font-bold tracking-[0.3em] text-accent uppercase", hasHomeButton && "pl-14")}>
          {kicker}
        </p>
        {digits && digits.length > 0 && (
          <div className="flex gap-3">
            {digits.map((d) => (
              <ScoreDigit key={d.label} value={d.value} label={d.label} />
            ))}
          </div>
        )}
      </div>
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </section>
  );
}
