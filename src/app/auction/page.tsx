"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Coins, Search, X } from "lucide-react";
import { motion } from "framer-motion";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { PosterShell } from "@/components/brand/PosterShell";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/lib/store/gameStore";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { roleLabelKey } from "@/lib/i18n/roles";
import { useGameDataReady } from "@/lib/data/useGameData";
import { auctionMarket, auctionSpend, AUCTION_BUDGET, type AuctionListing } from "@/lib/engine/auction";
import { SQUAD_SIZE, MAX_OVERSEAS, canBowl, isWicketkeeper, type Player, type PlayerRole } from "@/lib/types";
import { cn } from "@/lib/utils";

type RoleFilter = "all" | "bat" | "ar" | "wk" | "bowl";

const BATTER_ROLES: PlayerRole[] = ["opener", "top-order", "middle-order", "finisher"];
const AR_ROLES: PlayerRole[] = ["batting-allrounder", "bowling-allrounder"];

function roleGroup(p: Player): RoleFilter {
  if (p.primaryRole === "wicketkeeper-batter") return "wk";
  if (AR_ROLES.includes(p.primaryRole)) return "ar";
  if (BATTER_ROLES.includes(p.primaryRole)) return "bat";
  return "bowl";
}

/** A compact key stat for the market row — bat line for batters, bowl line for
 * bowlers — pulled from real career stats when present. */
function keyStat(p: Player): string | null {
  const cs = p.careerStats;
  if (!cs) return null;
  const bowlerish = roleGroup(p) === "bowl";
  if (bowlerish && cs.economyRate != null) {
    return `ECON ${cs.economyRate.toFixed(1)} · WKT ${cs.wickets}`;
  }
  if (cs.strikeRate != null) {
    return `SR ${Math.round(cs.strikeRate)} · AVG ${cs.battingAverage != null ? cs.battingAverage.toFixed(0) : "—"}`;
  }
  return null;
}

export default function AuctionPage() {
  const router = useRouter();
  const dataReady = useGameDataReady();
  const { t } = useTranslation();
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const stage = useGameStore((s) => s.stage);
  const purchases = useGameStore((s) => s.auctionPurchases);
  const buy = useGameStore((s) => s.buyAuctionPlayer);
  const sell = useGameStore((s) => s.sellAuctionPlayer);
  const complete = useGameStore((s) => s.completeAuction);

  const [filter, setFilter] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");

  const market = useMemo<AuctionListing[]>(() => (dataReady ? auctionMarket() : []), [dataReady]);
  const byId = useMemo(() => new Map(market.map((l) => [l.player.id, l])), [market]);

  const owned = useMemo(
    () => purchases.map((id) => byId.get(id)).filter((l): l is AuctionListing => Boolean(l)),
    [purchases, byId]
  );
  const spent = useMemo(() => auctionSpend(purchases), [purchases]);
  const remaining = Math.round((AUCTION_BUDGET - spent) * 10) / 10;
  const rosterFull = purchases.length >= SQUAD_SIZE;
  const ownedNames = useMemo(() => new Set(owned.map((l) => l.player.name)), [owned]);

  // Live composition guidance — advisory, like the spin draft.
  const ownedPlayers = owned.map((l) => l.player);
  const keeperCount = ownedPlayers.filter(isWicketkeeper).length;
  const bowlingCount = ownedPlayers.filter(canBowl).length;
  const overseasCount = ownedPlayers.filter((p) => p.nationalityType === "overseas").length;
  const overseasFull = overseasCount >= MAX_OVERSEAS;

  const filters: { id: RoleFilter; label: string }[] = [
    { id: "all", label: t("auction.filterAll") },
    { id: "bat", label: t("auction.filterBat") },
    { id: "ar", label: t("auction.filterAr") },
    { id: "wk", label: t("auction.filterWk") },
    { id: "bowl", label: t("auction.filterBowl") },
  ];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return market.filter((l) => {
      if (ownedNames.has(l.player.name)) return false;
      if (filter !== "all" && roleGroup(l.player) !== filter) return false;
      if (q && !l.player.name.toLowerCase().includes(q) && !l.player.country.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [market, filter, query, ownedNames]);

  // Not in an auction (direct visit / stale) → back to mode select.
  useEffect(() => {
    if (hasHydrated && stage !== "auction") router.replace("/play");
  }, [hasHydrated, stage, router]);

  if (!hasHydrated || !dataReady) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-foreground-muted">{t("lb.loading")}</p>
      </main>
    );
  }

  function handleComplete() {
    complete();
    router.push("/team-setup");
  }

  return (
    <main className="flex-1 flex flex-col">
      <PosterShell
        kicker={t("auction.title")}
        digits={[{ value: remaining.toFixed(1), label: t("auction.remaining") }]}
      >
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-stack-shadow text-4xl font-black italic tracking-tight mb-1">{t("auction.title")}</h1>
          <p className="text-foreground-muted mb-5">{t("auction.intro")}</p>

          {/* Purse bar */}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Coins className="h-4 w-4 text-gold" />
              {t("auction.spent")} {spent.toFixed(1)} / {AUCTION_BUDGET}
            </span>
            <span className="font-semibold text-foreground-muted">
              {purchases.length}/{SQUAD_SIZE}
            </span>
          </div>
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className={cn("h-full transition-all duration-300", remaining < 0 ? "bg-red-500" : "bg-gold")}
              style={{ width: `${Math.min(100, (spent / AUCTION_BUDGET) * 100)}%` }}
            />
          </div>

          {/* Composition guidance */}
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
            <CompBadge ok={keeperCount >= 1} label={t("auction.keeper")} value={keeperCount >= 1 ? "✓" : "0"} />
            <CompBadge ok={bowlingCount >= 5} label={t("auction.bowling")} value={`${bowlingCount}/5`} />
            <CompBadge ok={!overseasFull} label={t("auction.overseas")} value={`${overseasCount}/${MAX_OVERSEAS}`} />
          </div>

          {/* Roster */}
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-saffron">{t("auction.roster")}</h2>
          <div className="mb-6 grid gap-1.5">
            {owned.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-sm text-foreground-muted">
                {t("auction.emptyRoster")}
              </p>
            ) : (
              owned.map((l) => (
                <div
                  key={l.player.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background-elevated px-3 py-2"
                >
                  <PlayerAvatar player={l.player} size={34} className="ring-1 ring-accent/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold leading-tight">{l.player.name}</p>
                    <p className="truncate text-[11px] text-foreground-muted">
                      {t(roleLabelKey(l.player.primaryRole))} · {l.player.country}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-gold">
                    <Coins className="h-3.5 w-3.5" />
                    {l.price.toFixed(1)}
                  </span>
                  <button
                    type="button"
                    onClick={() => sell(l.player.id)}
                    aria-label={t("auction.sell")}
                    className="rounded-full p-1 text-foreground-muted transition-colors hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <Button className="mb-8 w-full" size="lg" disabled={!rosterFull} onClick={handleComplete}>
            {rosterFull
              ? t("auction.confirm")
              : t("auction.needMore").replace("{n}", String(SQUAD_SIZE - purchases.length))}
          </Button>

          {/* Market */}
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-accent">{t("auction.market")}</h2>
          <div className="mb-3 flex items-center gap-2 rounded-full border border-border bg-background-elevated px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-foreground-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("auction.search")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-foreground-muted"
            />
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
                  filter === f.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-background-elevated text-foreground-muted hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid gap-1.5 pb-10">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-foreground-muted">{t("auction.noMatch")}</p>
            ) : (
              visible.slice(0, 120).map((l) => {
                const affordable = spent + l.price <= AUCTION_BUDGET + 1e-9;
                const blockedByOverseas = l.player.nationalityType === "overseas" && overseasFull;
                const canBuy = !rosterFull && affordable && !blockedByOverseas;
                const stat = keyStat(l.player);
                return (
                  <motion.div
                    key={l.player.id}
                    layout
                    className="flex items-center gap-3 rounded-xl border border-border bg-background-elevated/60 px-3 py-2"
                  >
                    <PlayerAvatar player={l.player} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold leading-tight">{l.player.name}</p>
                      <p className="truncate text-[11px] text-foreground-muted">
                        {t(roleLabelKey(l.player.primaryRole))} · {l.player.country}
                        {stat ? ` · ${stat}` : ""}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-foreground-muted"
                      title={t("auction.rating")}
                    >
                      {t("auction.rating")} {l.player.overallRating}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-black tabular-nums text-gold">
                      <Coins className="h-3.5 w-3.5" />
                      {l.price.toFixed(1)}
                    </span>
                    <Button
                      size="sm"
                      variant={canBuy ? "primary" : "ghost"}
                      disabled={!canBuy}
                      onClick={() => buy(l.player.id)}
                      className="shrink-0"
                    >
                      {blockedByOverseas && !rosterFull
                        ? t("auction.overseasFull")
                        : !affordable && !rosterFull
                          ? t("auction.tooDear")
                          : t("auction.buy")}
                    </Button>
                  </motion.div>
                );
              })
            )}
          </div>

          <div className="pb-10 text-center">
            <Link href="/play" className="text-sm text-foreground-muted underline-offset-4 hover:underline">
              {t("auction.leave")}
            </Link>
          </div>
        </div>
      </PosterShell>
    </main>
  );
}

function CompBadge({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold",
        ok ? "border-accent/40 bg-accent/10 text-accent" : "border-gold/40 bg-gold/10 text-gold"
      )}
    >
      {label} <span className="tabular-nums">{value}</span>
    </span>
  );
}
