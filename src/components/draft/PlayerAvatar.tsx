import Image from "next/image";
import type { Player } from "@/lib/types";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

interface PlayerAvatarProps {
  player: Player;
  size?: number;
  className?: string;
}

/**
 * Shows player.imageUrl once real artwork is wired in for a player; falls
 * back to an initials badge so the UI never depends on images existing.
 */
export function PlayerAvatar({ player, size = 44, className }: PlayerAvatarProps) {
  if (player.imageUrl) {
    return (
      <Image
        src={player.imageUrl}
        alt={player.name}
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-jersey text-sm font-bold text-foreground",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials(player.name)}
    </div>
  );
}
