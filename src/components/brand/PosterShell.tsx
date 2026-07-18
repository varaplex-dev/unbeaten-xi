import type { ReactNode } from "react";
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
  return (
    <section
      className={cn(
        "stadium-glow floodlight-rays field-texture relative flex flex-1 flex-col overflow-hidden px-6 pt-8 pb-12 sm:pt-12",
        className
      )}
    >
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-xs font-bold tracking-[0.3em] text-accent uppercase">{kicker}</p>
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
