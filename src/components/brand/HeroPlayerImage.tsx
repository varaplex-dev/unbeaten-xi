import Image from "next/image";
import { CricketHeroIllustration } from "@/components/brand/CricketHeroIllustration";

// Real hero artwork lives in /public/hero-player.png. Set this back to null
// to fall back to the original SVG illustration.
const HERO_IMAGE_SRC: string | null = "/hero-player.png";

export function HeroPlayerImage({ className }: { className?: string }) {
  if (HERO_IMAGE_SRC) {
    return (
      <Image
        src={HERO_IMAGE_SRC}
        alt="Your captain, ready for game day"
        width={512}
        height={512}
        className={className}
        priority
      />
    );
  }
  return <CricketHeroIllustration className={className} />;
}
