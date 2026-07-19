import Image from "next/image";

export function HeroPlayerImage({ className }: { className?: string }) {
  return (
    <Image
      src="/logos/logo-unbeaten.png"
      alt="The Unbeaten XI emblem"
      width={512}
      height={512}
      className={className}
      priority
    />
  );
}
