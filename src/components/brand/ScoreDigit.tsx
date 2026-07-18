export function ScoreDigit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-2xl font-bold tabular-nums text-foreground shadow-inner shadow-black/50 sm:text-3xl">
        {value}
      </div>
      <span className="text-[10px] font-semibold tracking-[0.2em] text-foreground-muted uppercase">
        {label}
      </span>
    </div>
  );
}
