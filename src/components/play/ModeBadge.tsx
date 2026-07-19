import Image from "next/image";
import { cn } from "@/lib/utils";

interface ModeBadgeProps {
  emoji: string;
  /** A real badge image (see public/logos/) — used in place of the emoji
   * glyph when one exists for this mode. Already art-directed with its own
   * shield/border/glow, so it renders standalone rather than inside the
   * emoji badge's chrome. */
  image?: string;
  tone?: "accent" | "gold";
  className?: string;
}

/** Game-mode emblem: a gold/teal-rimmed badge with a soft glow behind an
 * emoji glyph, matching the poster's shield-and-glow aesthetic instead of a
 * flat lucide icon in a soft chip. "accent" tone marks the live/playable
 * mode; "gold" is the roadmap/coming-soon tone. */
export function ModeBadge({ emoji, image, tone = "gold", className }: ModeBadgeProps) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={112}
        height={112}
        className={cn("h-14 w-14 shrink-0 rounded-2xl object-cover shadow-lg shadow-black/40", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 bg-gradient-to-b from-background-elevated to-background",
        tone === "accent" ? "border-accent" : "border-gold",
        className
      )}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-2xl opacity-50 blur-md",
          tone === "accent" ? "bg-accent/40" : "bg-gold/30"
        )}
        aria-hidden
      />
      <span className="relative text-2xl leading-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.65)]">{emoji}</span>
    </div>
  );
}
