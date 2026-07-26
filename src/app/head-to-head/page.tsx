"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Swords, Loader2, Trophy, Send, ArrowLeftRight, Check, ChevronUp, ChevronDown, Star, Shield } from "lucide-react";
import { PosterShell } from "@/components/brand/PosterShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerCard } from "@/components/draft/PlayerCard";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { SpinReel } from "@/components/draft/SpinReel";
import { useAuthStore } from "@/lib/store/authStore";
import { useGuestStore } from "@/lib/store/guestStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n";
import { useH2HMatch, type ChatMessage } from "@/lib/h2h/useH2HMatch";
import {
  H2H_ROSTER_SIZE,
  resolvePlayer,
  takenPlayerIds,
  isDraftComplete,
  rosterBreakdown,
  totalPicks,
  picksFor,
  fetchLadder,
  type H2HMatchRow,
  type Side,
  type LadderEntry,
} from "@/lib/h2h/matchClient";
import { getEraTeamById, pickNextEraTeam } from "@/lib/data/gameData";
import { useGameDataReady } from "@/lib/data/useGameData";
import { matchesFor } from "@/lib/engine/competitions";
import type { H2HLineup } from "@/lib/engine/headToHead";
import { isWicketkeeper, type EraTeam, type Player } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Fills {placeholders} in a translated string. */
function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template
  );
}

// The comparison metric keys (from headToHead.ts) mapped to their i18n keys,
// so the roster breakdown renders in the active language.
const METRIC_LABEL_KEYS: Record<string, TranslationKey> = {
  expectedRuns: "h2h.metric.expectedRuns",
  strikeRate: "h2h.metric.strikeRate",
  reliability: "h2h.metric.reliability",
  wicketThreat: "h2h.metric.wicketThreat",
  economy: "h2h.metric.economy",
};

function RosterColumn({ title, picks, active }: { title: string; picks: string[]; active: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex-1 rounded-xl border p-3", active ? "border-accent/60 bg-accent/5" : "border-border")}>
      <p className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide">
        <span className={active ? "text-accent" : "text-foreground-muted"}>{title}</span>
        <span className="tabular-nums text-foreground-muted">
          {picks.length}/{H2H_ROSTER_SIZE}
        </span>
      </p>
      <ul className="space-y-1.5">
        {picks.map((id) => {
          const p = resolvePlayer(id);
          if (!p) return null;
          return (
            <li key={id} className="flex items-center gap-2">
              <PlayerAvatar player={p} size={22} />
              <span className="truncate text-xs">{p.shortName}</span>
            </li>
          );
        })}
        {picks.length === 0 && <li className="text-xs text-foreground-muted">{t("h2h.noPicks")}</li>}
      </ul>
    </div>
  );
}

function ResultView({ match, side }: { match: H2HMatchRow; side: Side }) {
  const { t } = useTranslation();
  const breakdown = useMemo(() => rosterBreakdown(match), [match]);
  if (match.disputed) {
    return (
      <div className="mx-auto w-full max-w-md text-center">
        <p className="text-2xl font-black italic tracking-tight text-danger">{t("h2h.disputedTitle")}</p>
        <p className="mt-2 text-sm text-foreground-muted">{t("h2h.disputedBody")}</p>
      </div>
    );
  }
  if (!match.result) return null;
  const won = match.result.winner === side;
  // result scores are each side's SEASON WINS; losses are the rest of the
  // fixed-length season, so a record renders without re-simulating.
  const seasonLength = matchesFor("league-major");
  const myWins = side === "host" ? match.result.hostScore : match.result.guestScore;
  const oppWins = side === "host" ? match.result.guestScore : match.result.hostScore;

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-5 text-center">
        <p className={cn("text-3xl font-black italic tracking-tight", won ? "text-accent" : "text-danger")}>
          {won ? t("h2h.youWin") : t("h2h.youLose")}
        </p>
        <div className="mt-2 flex items-center justify-center gap-4 font-mono text-lg tabular-nums">
          <span className="text-right">
            <span className="block text-[10px] uppercase tracking-wide text-foreground-muted">{t("h2h.you")}</span>
            {myWins}–{seasonLength - myWins}
          </span>
          <span className="text-foreground-muted">{t("h2h.vs")}</span>
          <span className="text-left">
            <span className="block text-[10px] uppercase tracking-wide text-foreground-muted">{t("h2h.opponent")}</span>
            {oppWins}–{seasonLength - oppWins}
          </span>
        </div>
        <p className="mt-1 text-xs text-foreground-muted">
          {match.result.margin > 0
            ? fill(t("h2h.seasonMargin"), { n: match.result.margin })
            : t("h2h.decidedByNrr")}
        </p>
      </div>

      {breakdown && (
        <div className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-foreground-muted">
            {t("h2h.breakdownTitle")}
          </p>
          <ul className="space-y-2">
            {breakdown.metrics.map((m) => {
              // "a" is always host; translate to the viewer's own side.
              const mine = side === "host" ? m.a : m.b;
              const theirs = side === "host" ? m.b : m.a;
              const iLead = (m.advantage === "a" && side === "host") || (m.advantage === "b" && side === "guest");
              const even = m.advantage === "even";
              return (
                <li key={m.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                  <span
                    className={cn("text-right font-mono tabular-nums", iLead ? "text-accent font-bold" : "text-foreground-muted")}
                  >
                    {mine}
                  </span>
                  <span className="px-2 text-center text-[10px] uppercase tracking-wide text-foreground-muted">
                    {t(METRIC_LABEL_KEYS[m.key] ?? "h2h.metric.expectedRuns")}
                  </span>
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      !iLead && !even ? "text-saffron font-bold" : "text-foreground-muted"
                    )}
                  >
                    {theirs}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-center text-xs text-foreground-muted">
            {t("h2h.categoriesWon")}:{" "}
            <span className="font-bold text-accent">{side === "host" ? breakdown.aCategories : breakdown.bCategories}</span>{" "}
            — <span className="font-bold text-saffron">{side === "host" ? breakdown.bCategories : breakdown.aCategories}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function Ladder({ rows }: { rows: LadderEntry[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <div className="mx-auto mt-8 w-full max-w-md">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-black italic tracking-tight">
        <Trophy className="h-4 w-4 text-gold" /> {t("h2h.ladderTitle")}
      </h2>
      <ol className="overflow-hidden rounded-xl border border-border">
        {rows.map((r, i) => (
          <li
            key={r.user_id}
            className="flex items-center gap-3 border-b border-border bg-background-elevated/60 px-3 py-2 text-sm last:border-b-0"
          >
            <span className="w-5 text-center font-bold tabular-nums text-foreground-muted">{i + 1}</span>
            <span className="flex-1 truncate">{r.username}</span>
            <span className="text-xs text-foreground-muted tabular-nums">
              {r.wins}W-{r.losses}L
            </span>
            <span className="w-10 text-right font-bold tabular-nums text-accent">{r.points}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-center text-[10px] text-foreground-muted">{t("h2h.ladderRules")}</p>
    </div>
  );
}

function ChatBox({
  messages,
  myUserId,
  onSend,
}: {
  messages: ChatMessage[];
  myUserId: string;
  onSend: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-background-elevated/60">
      <div className="max-h-40 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <p className="py-2 text-center text-xs text-foreground-muted">{t("h2h.sayHi")}</p>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((m, i) => {
              const mine = m.userId === myUserId;
              return (
                <li key={i} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                    {mine ? t("h2h.you") : m.name || t("h2h.opponent")}
                  </span>
                  <span
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-1.5 text-sm",
                      mine ? "bg-accent/20 text-foreground" : "bg-white/5 text-foreground"
                    )}
                  >
                    {m.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(text);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={t("h2h.message")}
          className="flex-1 rounded-full bg-background px-3 py-2 text-sm outline-none placeholder:text-foreground-muted focus:ring-1 focus:ring-accent/50"
        />
        <button
          type="submit"
          aria-label="Send"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[#04120d]"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

/** Team-setup for Head-to-Head: arrange the batting order and name a captain
 * and keeper. Each change saves to this side's lineup, which the season sim
 * reads at finalize — the batting order and captain genuinely shape the run.
 * Re-seeds from the current roster so a post-trade swap slots straight in. */
function LineupPanel({
  match,
  side,
  onSaveLineup,
}: {
  match: H2HMatchRow;
  side: Side;
  onSaveLineup: (lineup: H2HLineup) => void;
}) {
  const { t } = useTranslation();
  const myPicks = picksFor(match, side);
  const stored = side === "host" ? match.host_lineup : match.guest_lineup;
  const validId = (id: string | null | undefined) => (id && myPicks.includes(id) ? id : null);

  // Seed from the stored lineup (or pick order) at mount. The parent keys this
  // component on the roster, so a post-trade swap remounts and re-seeds without
  // an effect clobbering the player's in-progress edits.
  const [order, setOrder] = useState<string[]>(() => {
    const base = (stored?.battingOrder ?? []).filter((id) => myPicks.includes(id));
    return [...base, ...myPicks.filter((id) => !base.includes(id))];
  });
  const [captainId, setCaptainId] = useState<string | null>(() => validId(stored?.captainId));
  const [keeperId, setKeeperId] = useState<string | null>(() => validId(stored?.keeperId));

  const save = (o: string[], c: string | null, k: string | null) =>
    onSaveLineup({ battingOrder: o, captainId: c, keeperId: k });

  const move = (id: string, dir: "up" | "down") => {
    const i = order.indexOf(id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    save(next, captainId, keeperId);
  };
  const chooseCaptain = (id: string) => {
    const next = captainId === id ? null : id;
    setCaptainId(next);
    save(order, next, keeperId);
  };
  const chooseKeeper = (id: string) => {
    const next = keeperId === id ? null : id;
    setKeeperId(next);
    save(order, captainId, next);
  };

  return (
    <div className="mx-auto mb-5 w-full max-w-2xl">
      <div className="mb-2 text-center">
        <h2 className="text-xl font-black italic tracking-tight">{t("h2h.setupTitle")}</h2>
        <p className="text-sm text-foreground-muted">{t("h2h.setupIntro")}</p>
      </div>
      <ol className="grid gap-1.5">
        {order.map((id, i) => {
          const p = resolvePlayer(id);
          if (!p) return null;
          const isCaptain = id === captainId;
          const isKeeper = id === keeperId;
          return (
            <li
              key={id}
              className="flex items-center gap-2 rounded-xl border border-border bg-background-elevated px-2.5 py-2"
            >
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(id, "up")}
                  className="text-foreground-muted hover:text-foreground disabled:opacity-20"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === order.length - 1}
                  onClick={() => move(id, "down")}
                  className="text-foreground-muted hover:text-foreground disabled:opacity-20"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <span className="w-4 shrink-0 text-center text-xs text-foreground-muted tabular-nums">{i + 1}</span>
              <PlayerAvatar player={p} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{p.name}</p>
                <p className="text-[10px] text-foreground-muted">{p.primaryRole}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Set captain"
                  title={t("h2h.captain")}
                  onClick={() => chooseCaptain(id)}
                  className={cn(
                    "rounded-full p-1.5 ring-1 transition-colors",
                    isCaptain ? "bg-gold/20 text-gold ring-gold/50" : "text-foreground-muted ring-transparent hover:text-gold"
                  )}
                >
                  <Star className="h-3.5 w-3.5" fill={isCaptain ? "currentColor" : "none"} />
                </button>
                {isWicketkeeper(p) && (
                  <button
                    type="button"
                    aria-label="Set wicketkeeper"
                    title={t("h2h.keeper")}
                    onClick={() => chooseKeeper(id)}
                    className={cn(
                      "rounded-full p-1.5 ring-1 transition-colors",
                      isKeeper ? "bg-accent/20 text-accent ring-accent/50" : "text-foreground-muted ring-transparent hover:text-accent"
                    )}
                  >
                    <Shield className="h-3.5 w-3.5" fill={isKeeper ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TradePhase({
  match,
  side,
  onOffer,
  onAnswer,
  onReady,
}: {
  match: H2HMatchRow;
  side: Side;
  onOffer: (give: string, want: string) => void;
  onAnswer: (accept: boolean) => void;
  onReady: () => void;
}) {
  const { t } = useTranslation();
  const myPicks = picksFor(match, side);
  const theirPicks = picksFor(match, side === "host" ? "guest" : "host");
  const [give, setGive] = useState<string | null>(null);
  const [want, setWant] = useState<string | null>(null);
  const iAmReady = side === "host" ? match.host_ready : match.guest_ready;
  const theyReady = side === "host" ? match.guest_ready : match.host_ready;
  const offer = match.trade_offer;
  const incomingOffer = offer && offer.by !== side;
  const myOfferPending = offer && offer.by === side;

  const nameOf = (id: string) => resolvePlayer(id)?.shortName ?? id;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-black italic tracking-tight">{t("h2h.tradeTitle")}</h1>
        <p className="text-sm text-foreground-muted">{t("h2h.tradeIntro")}</p>
      </div>

      {incomingOffer && offer && (
        <div className="mb-4 rounded-2xl border border-gold/40 bg-gold/5 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">{t("h2h.incomingTrade")}</p>
          <p className="mt-1 text-sm">
            {t("h2h.youGet")} <span className="font-bold text-accent">{nameOf(offer.give)}</span> · {t("h2h.youGive")}{" "}
            <span className="font-bold text-saffron">{nameOf(offer.want)}</span>
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" onClick={() => onAnswer(true)}>
              {t("h2h.accept")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAnswer(false)}>
              {t("h2h.reject")}
            </Button>
          </div>
        </div>
      )}
      {myOfferPending && offer && (
        <p className="mb-4 rounded-xl border border-border bg-background-elevated/60 px-4 py-2 text-center text-sm text-foreground-muted">
          {t("h2h.offerPending")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-accent">{t("h2h.youGive")}</p>
          <ul className="space-y-1">
            {myPicks.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setGive(give === id ? null : id)}
                  className={cn(
                    "w-full truncate rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                    give === id ? "border-accent bg-accent/15" : "border-border hover:border-accent/40"
                  )}
                >
                  {nameOf(id)}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-saffron">{t("h2h.youWant")}</p>
          <ul className="space-y-1">
            {theirPicks.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setWant(want === id ? null : id)}
                  className={cn(
                    "w-full truncate rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                    want === id ? "border-saffron bg-saffron/15" : "border-border hover:border-saffron/40"
                  )}
                >
                  {nameOf(id)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          className="flex-1 gap-2"
          disabled={!give || !want || Boolean(offer)}
          onClick={() => give && want && (onOffer(give, want), setGive(null), setWant(null))}
        >
          <ArrowLeftRight className="h-4 w-4" />
          {t("h2h.proposeTrade")}
        </Button>
        <Button className="flex-1 gap-2" disabled={iAmReady} onClick={onReady}>
          {iAmReady ? <Check className="h-4 w-4" /> : null}
          {iAmReady ? t("h2h.readyWaiting") : t("h2h.readyToSim")}
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-foreground-muted">
        {t("h2h.you")}: {iAmReady ? t("h2h.ready") : t("h2h.notReady")} · {t("h2h.opponent")}:{" "}
        {theyReady ? t("h2h.ready") : t("h2h.notReady")}
      </p>
    </div>
  );
}

export default function HeadToHeadPage() {
  const hasLoaded = useAuthStore((s) => s.hasLoaded);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const signInAsGuest = useAuthStore((s) => s.signInAsGuest);
  const authError = useAuthStore((s) => s.authError);
  const ensureGuestId = useGuestStore((s) => s.ensureGuestId);
  const [guestPending, setGuestPending] = useState(false);
  // Supabase anonymous users carry is_anonymous; a signed-in email/OAuth user
  // does not. Only guests see the "create an account" nudge.
  const isGuest = Boolean((user as { is_anonymous?: boolean } | null)?.is_anonymous);
  // Name shown next to this player's chat messages — profile username (guests
  // are renamed to their guest id at sign-in, so this covers both).
  const displayName = profile?.username ?? "Player";
  const {
    match,
    phase,
    error,
    side,
    messages,
    oppSpin,
    find,
    pick,
    pickForActive,
    offerTrade,
    answerTrade,
    ready,
    saveLineup,
    sendChat,
    sendSpin,
    leave,
  } = useH2HMatch(user?.id ?? null, displayName);
  const { t } = useTranslation();
  const dataReady = useGameDataReady();
  const [ladder, setLadder] = useState<LadderEntry[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const autoPickedRef = useRef(-1);
  const takeoverRef = useRef(-1);

  // Local spin state for the active player's turn, tagged with the pick index
  // it belongs to. Deriving "is this reveal still current" from the live pick
  // count (rather than resetting via an effect) means a committed pick — or
  // an opponent's move arriving over realtime — auto-clears the stale reveal.
  const [spin, setSpin] = useState<{ pick: number; target: EraTeam | null; revealedId: string | null }>({
    pick: -1,
    target: null,
    revealedId: null,
  });
  const picksPlayed = match ? totalPicks(match) : 0;
  const activeSpin = spin.pick === picksPlayed ? spin : { pick: picksPlayed, target: null, revealedId: null };

  useEffect(() => {
    if (phase === "idle") fetchLadder().then(setLadder);
  }, [phase]);

  const myTurn = Boolean(match && side && match.turn === side && match.status === "drafting");

  const handleSpin = useCallback(() => {
    if (!match) return;
    // Deterministic team for this pick index — teams may repeat between the
    // two players (that's the point; already-taken players are what's
    // blocked), so no exclusion list is passed.
    const target = pickNextEraTeam(`${match.seed}::${picksPlayed}`, []);
    if (!target) return; // data not loaded yet (gated in the UI)
    setSpin({ pick: picksPlayed, target, revealedId: null });
    // Let the opponent watch this turn happen.
    sendSpin({ pick: picksPlayed, targetId: target.id, revealedId: null });
  }, [match, picksPlayed, sendSpin]);

  const spinTarget = activeSpin.target;
  const revealedTeam = activeSpin.revealedId ? getEraTeamById(activeSpin.revealedId) : null;
  const taken = useMemo(() => (match ? takenPlayerIds(match) : new Set<string>()), [match]);

  // ---- Turn timer + CPU auto-pick -----------------------------------------
  // Each turn gets PICK_SECONDS; the deadline is derived from the row's
  // updated_at (set when the turn passed), so both clients count down in sync.
  // When it expires the active player's client auto-picks the best available
  // player, keeping the game moving if someone stalls.
  const PICK_SECONDS = 30;
  // Extra grace after the deadline before the WAITING player steps in — covers
  // the active player's tab being closed (their own timer can't fire then).
  const TAKEOVER_SECONDS = PICK_SECONDS + 10;
  const isDrafting = match?.status === "drafting";
  const turnStart = match ? new Date(match.updated_at).getTime() : 0;
  const turnDeadline = isDrafting ? turnStart + PICK_SECONDS * 1000 : null;
  const secondsLeft = turnDeadline ? Math.max(0, Math.ceil((turnDeadline - nowTick) / 1000)) : null;

  // Tick every second throughout the draft (both turns) so the active player's
  // countdown AND the waiting player's takeover clock both advance.
  useEffect(() => {
    if (!isDrafting) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isDrafting]);

  // The best still-available player from this pick's deterministic team, plus
  // the team itself. Both clients compute the same team from the seed, so a
  // takeover picks exactly the player the active client would have.
  const bestAvailableFor = useCallback(
    (revealed: EraTeam | null): { team: EraTeam; player: Player } | null => {
      if (!match) return null;
      const team = revealed ?? pickNextEraTeam(`${match.seed}::${picksPlayed}`, []);
      if (!team) return null;
      const player = team.players
        .filter((p) => !taken.has(p.id))
        .sort((a, b) => b.overallRating - a.overallRating)[0];
      return player ? { team, player } : null;
    },
    [match, taken, picksPlayed]
  );

  // Your turn: auto-pick when your own timer runs out.
  useEffect(() => {
    if (!myTurn || secondsLeft === null || secondsLeft > 0) return;
    if (autoPickedRef.current === picksPlayed) return;
    autoPickedRef.current = picksPlayed; // once per turn
    const choice = bestAvailableFor(revealedTeam ?? null);
    if (choice) {
      sendSpin({ pick: picksPlayed, targetId: choice.team.id, revealedId: choice.team.id });
      pick(choice.player.id);
    }
  }, [myTurn, secondsLeft, picksPlayed, revealedTeam, bestAvailableFor, sendSpin, pick]);

  // Opponent's turn: if they blow past the deadline + grace (e.g. closed their
  // tab), step in and pick for them so the draft can't freeze.
  useEffect(() => {
    if (myTurn || !isDrafting || !turnDeadline) return;
    if (nowTick < turnStart + TAKEOVER_SECONDS * 1000) return;
    if (takeoverRef.current === picksPlayed) return;
    takeoverRef.current = picksPlayed; // once per turn
    const choice = bestAvailableFor(null);
    if (choice) pickForActive(choice.player.id);
  }, [myTurn, isDrafting, turnDeadline, turnStart, nowTick, picksPlayed, TAKEOVER_SECONDS, bestAvailableFor, pickForActive]);

  // What the opponent is doing this turn, from their spin broadcast.
  const oppActive = oppSpin && oppSpin.pick === picksPlayed ? oppSpin : null;
  const oppSpinTeam = oppActive?.targetId ? getEraTeamById(oppActive.targetId) : null;
  const oppRevealedTeam = oppActive?.revealedId ? getEraTeamById(oppActive.revealedId) : null;

  // ---- Gates ---------------------------------------------------------------
  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <Gate title={t("h2h.notSetup")} body={t("h2h.notSetupBody")} />
      </Shell>
    );
  }
  if (!hasLoaded) return <Shell>{null}</Shell>;
  if (!user) {
    return (
      <Shell>
        <Gate
          title={t("h2h.signInTitle")}
          body={t("h2h.signInBody")}
          action={
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                disabled={guestPending}
                onClick={async () => {
                  setGuestPending(true);
                  await signInAsGuest(ensureGuestId());
                  setGuestPending(false);
                }}
              >
                {guestPending ? t("h2h.guestStarting") : t("h2h.playAsGuest")}
              </Button>
              <Link href="/settings" className="text-sm text-foreground-muted underline underline-offset-4">
                {t("h2h.orSignIn")}
              </Link>
              {authError && <p className="text-sm text-danger">{authError}</p>}
            </div>
          }
        />
      </Shell>
    );
  }

  // The draft/trade/result screens render real players — hold them until the
  // lazily-loaded pool is in (the ladder/idle screens don't need it).
  if (match && match.status !== "waiting" && !dataReady) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-foreground-muted">{t("lb.loading")}</p>
        </div>
      </Shell>
    );
  }

  // ---- Completed -----------------------------------------------------------
  if (match && match.status === "completed" && side) {
    return (
      <Shell>
        <ResultView match={match} side={side} />
        <div className="mx-auto mt-6 flex w-full max-w-md justify-center">
          <Button size="lg" onClick={leave}>
            {t("h2h.playAgain")}
          </Button>
        </div>
      </Shell>
    );
  }

  // ---- Searching for opponent ---------------------------------------------
  if (match && match.status === "waiting") {
    return (
      <Shell>
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-lg font-bold">{t("h2h.searchingTitle")}</p>
          <p className="text-sm text-foreground-muted">{t("h2h.searchingBody")}</p>
          <Button variant="ghost" onClick={leave}>
            {t("settings.cancel")}
          </Button>
        </div>
      </Shell>
    );
  }

  // ---- In-match draft ------------------------------------------------------
  if (match && match.status === "drafting" && side) {
    const myPicks = side === "host" ? match.host_picks : match.guest_picks;
    const oppPicks = side === "host" ? match.guest_picks : match.host_picks;

    return (
      <Shell>
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-4 flex gap-3">
            <RosterColumn title={t("h2h.you")} picks={myPicks} active={myTurn} />
            <RosterColumn title={t("h2h.opponent")} picks={oppPicks} active={!myTurn} />
          </div>

          {/* Opponent's turn — watch them spin and choose, live. */}
          {!myTurn && (
            <div className="rounded-2xl border border-dashed border-border p-4">
              <p className="mb-3 text-center text-sm font-semibold text-saffron">
                {oppRevealedTeam ? t("h2h.oppChoosing") : t("h2h.oppSpinning")}
              </p>
              {oppRevealedTeam ? (
                <div>
                  <div className="mb-3 rounded-xl border border-saffron/30 bg-saffron/5 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-saffron">
                      {oppRevealedTeam.eraLabel}
                    </p>
                    <p className="text-lg font-bold leading-tight">{oppRevealedTeam.name}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {oppRevealedTeam.players.map((p: Player) => (
                      <PlayerCard key={p.id} player={p} disabled onSelect={() => {}} />
                    ))}
                  </div>
                </div>
              ) : oppSpinTeam ? (
                <SpinReel target={oppSpinTeam} onComplete={() => {}} />
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
                  <p className="text-sm text-foreground-muted">{t("h2h.waitingPick")}</p>
                </div>
              )}
            </div>
          )}

          {/* Your turn — pick countdown before the CPU auto-picks. */}
          {myTurn && secondsLeft !== null && (
            <p
              className={cn(
                "mb-3 text-center text-sm font-bold tabular-nums",
                secondsLeft <= 5 ? "text-danger" : "text-foreground-muted"
              )}
            >
              {fill(t("h2h.pickTimer"), { n: secondsLeft })}
            </p>
          )}

          {myTurn && spinTarget && (
            <SpinReel
              target={spinTarget}
              onComplete={() => {
                setSpin({ pick: picksPlayed, target: null, revealedId: spinTarget.id });
                sendSpin({ pick: picksPlayed, targetId: spinTarget.id, revealedId: spinTarget.id });
              }}
            />
          )}

          {myTurn && !spinTarget && !revealedTeam && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="text-foreground-muted">{t("h2h.yourTurnSpin")}</p>
              <Button size="lg" onClick={handleSpin}>
                {t("play.spin")}
              </Button>
            </div>
          )}

          {myTurn && revealedTeam && (
            <div>
              <div className="mb-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{revealedTeam.eraLabel}</p>
                <p className="text-lg font-bold leading-tight">{revealedTeam.name}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {revealedTeam.players.map((p: Player) => (
                  <PlayerCard key={p.id} player={p} disabled={taken.has(p.id)} onSelect={() => pick(p.id)} />
                ))}
              </div>
            </div>
          )}

          {isDraftComplete(match) && (
            <div className="mt-4 flex justify-center">
              <Badge variant="accent">{t("h2h.draftComplete")}</Badge>
            </div>
          )}

          <ChatBox messages={messages} myUserId={user.id} onSend={sendChat} />
        </div>
      </Shell>
    );
  }

  // ---- Trading + ready-up --------------------------------------------------
  if (match && match.status === "trading" && side) {
    return (
      <Shell>
        <LineupPanel
          key={picksFor(match, side).join(",")}
          match={match}
          side={side}
          onSaveLineup={saveLineup}
        />
        <TradePhase match={match} side={side} onOffer={offerTrade} onAnswer={answerTrade} onReady={ready} />
        <div className="mx-auto w-full max-w-2xl">
          <ChatBox messages={messages} myUserId={user.id} onSend={sendChat} />
        </div>
      </Shell>
    );
  }

  // ---- Idle / matchmaking entry -------------------------------------------
  return (
    <Shell>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-8 text-center">
        <Swords className="h-10 w-10 text-accent" />
        <h1 className="text-3xl font-black italic tracking-tight">Head-to-Head</h1>
        <p className="text-sm text-foreground-muted">{t("h2h.intro")}</p>
        {phase === "error" && <p className="text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full" onClick={find} disabled={phase === "searching"}>
          {phase === "searching" ? t("h2h.searching") : t("h2h.findOpponent")}
        </Button>
        {isGuest && (
          <div className="mt-2 w-full rounded-xl border border-gold/40 bg-gold/5 p-4 text-left">
            <p className="text-sm font-bold text-gold">{t("h2h.guestUpsellTitle")}</p>
            <p className="mt-1 text-xs text-foreground-muted">{t("h2h.guestUpsellBody")}</p>
            <Link href="/settings" className="mt-3 inline-block">
              <Button size="sm" variant="secondary">
                {t("h2h.createAccount")}
              </Button>
            </Link>
          </div>
        )}
      </div>
      <Ladder rows={ladder} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 flex flex-col">
      <PosterShell kicker="Head-to-Head">{children}</PosterShell>
    </main>
  );
}

function Gate({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center">
      <Swords className="h-10 w-10 text-foreground-muted" />
      <h1 className="text-2xl font-black italic tracking-tight">{title}</h1>
      <p className="text-sm text-foreground-muted">{body}</p>
      {action}
    </div>
  );
}
