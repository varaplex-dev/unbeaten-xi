"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Swords, Loader2, Trophy, Send, ArrowLeftRight, Check } from "lucide-react";
import { PosterShell } from "@/components/brand/PosterShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerCard } from "@/components/draft/PlayerCard";
import { PlayerAvatar } from "@/components/draft/PlayerAvatar";
import { SpinReel } from "@/components/draft/SpinReel";
import { useAuthStore } from "@/lib/store/authStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";
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
import { getEraTeamById, pickNextEraTeam } from "@/lib/data/eraTeams";
import type { EraTeam, Player } from "@/lib/types";
import { cn } from "@/lib/utils";

function RosterColumn({ title, picks, active }: { title: string; picks: string[]; active: boolean }) {
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
        {picks.length === 0 && <li className="text-xs text-foreground-muted">No picks yet.</li>}
      </ul>
    </div>
  );
}

function ResultView({ match, side }: { match: H2HMatchRow; side: Side }) {
  const breakdown = useMemo(() => rosterBreakdown(match), [match]);
  if (!match.result) return null;
  const won = match.result.winner === side;
  const myScore = side === "host" ? match.result.hostScore : match.result.guestScore;
  const oppScore = side === "host" ? match.result.guestScore : match.result.hostScore;

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-5 text-center">
        <p className={cn("text-3xl font-black italic tracking-tight", won ? "text-accent" : "text-danger")}>
          {won ? "You Win!" : "You Lose"}
        </p>
        <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
          {myScore} <span className="text-foreground-muted">vs</span> {oppScore}
        </p>
        <p className="text-xs text-foreground-muted">by {match.result.margin} runs</p>
      </div>

      {breakdown && (
        <div className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-foreground-muted">
            Roster Breakdown — You vs Opponent
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
                    {m.label}
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
            Categories won: <span className="font-bold text-accent">{side === "host" ? breakdown.aCategories : breakdown.bCategories}</span>{" "}
            — <span className="font-bold text-saffron">{side === "host" ? breakdown.bCategories : breakdown.aCategories}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function Ladder({ rows }: { rows: LadderEntry[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mx-auto mt-8 w-full max-w-md">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-black italic tracking-tight">
        <Trophy className="h-4 w-4 text-gold" /> Head-to-Head Ladder
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
      <p className="mt-1 text-center text-[10px] text-foreground-muted">
        Win 3 · dominant win +1 · narrow loss +1. Top finishers seed the playoff bracket.
      </p>
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
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-background-elevated/60">
      <div className="max-h-40 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <p className="py-2 text-center text-xs text-foreground-muted">Say hi to your opponent.</p>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((m, i) => {
              const mine = m.userId === myUserId;
              return (
                <li key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
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
          placeholder="Message…"
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
        <h1 className="text-2xl font-black italic tracking-tight">Trade & Ready Up</h1>
        <p className="text-sm text-foreground-muted">
          Propose a one-for-one swap, or lock in. Both players ready = the match is simulated.
        </p>
      </div>

      {incomingOffer && offer && (
        <div className="mb-4 rounded-2xl border border-gold/40 bg-gold/5 p-4 text-center">
          <p className="text-sm">
            Opponent offers <span className="font-bold text-accent">{nameOf(offer.give)}</span> for your{" "}
            <span className="font-bold text-saffron">{nameOf(offer.want)}</span>.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" onClick={() => onAnswer(true)}>
              Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAnswer(false)}>
              Reject
            </Button>
          </div>
        </div>
      )}
      {myOfferPending && offer && (
        <p className="mb-4 rounded-xl border border-border bg-background-elevated/60 px-4 py-2 text-center text-sm text-foreground-muted">
          Offer sent — {nameOf(offer.give)} for {nameOf(offer.want)}. Waiting for a response…
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-accent">You give</p>
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
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-saffron">You want</p>
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
          Propose Trade
        </Button>
        <Button className="flex-1 gap-2" disabled={iAmReady} onClick={onReady}>
          {iAmReady ? <Check className="h-4 w-4" /> : null}
          {iAmReady ? "Ready — waiting" : "Ready to Simulate"}
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-foreground-muted">
        You: {iAmReady ? "ready" : "not ready"} · Opponent: {theyReady ? "ready" : "not ready"}
      </p>
    </div>
  );
}

export default function HeadToHeadPage() {
  const hasLoaded = useAuthStore((s) => s.hasLoaded);
  const user = useAuthStore((s) => s.user);
  const { match, phase, error, side, messages, find, pick, offerTrade, answerTrade, ready, sendChat, leave } =
    useH2HMatch(user?.id ?? null);
  const [ladder, setLadder] = useState<LadderEntry[]>([]);

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
    setSpin({ pick: picksPlayed, target: pickNextEraTeam(`${match.seed}::${picksPlayed}`, []), revealedId: null });
  }, [match, picksPlayed]);

  const spinTarget = activeSpin.target;
  const revealedTeam = activeSpin.revealedId ? getEraTeamById(activeSpin.revealedId) : null;
  const taken = match ? takenPlayerIds(match) : new Set<string>();

  // ---- Gates ---------------------------------------------------------------
  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <Gate title="Online play isn't set up yet" body="Head-to-Head needs the online backend configured. Check back soon." />
      </Shell>
    );
  }
  if (!hasLoaded) return <Shell>{null}</Shell>;
  if (!user) {
    return (
      <Shell>
        <Gate
          title="Sign in to play online"
          body="Head-to-Head matches you against another player and ranks you on the online ladder — that needs an account."
          action={
            <Link href="/settings">
              <Button size="lg">Sign In</Button>
            </Link>
          }
        />
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
            Play Again
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
          <p className="text-lg font-bold">Searching for an opponent…</p>
          <p className="text-sm text-foreground-muted">You&apos;ll be matched as soon as another player joins the queue.</p>
          <Button variant="ghost" onClick={leave}>
            Cancel
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
            <RosterColumn title="You" picks={myPicks} active={myTurn} />
            <RosterColumn title="Opponent" picks={oppPicks} active={!myTurn} />
          </div>

          {!myTurn && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
              <p className="text-sm text-foreground-muted">Waiting for your opponent to pick…</p>
            </div>
          )}

          {myTurn && spinTarget && (
            <SpinReel
              target={spinTarget}
              onComplete={() => setSpin({ pick: picksPlayed, target: null, revealedId: spinTarget.id })}
            />
          )}

          {myTurn && !spinTarget && !revealedTeam && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="text-foreground-muted">Your turn — spin for a team, then pick a player.</p>
              <Button size="lg" onClick={handleSpin}>
                Spin
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
              <Badge variant="accent">Draft complete — moving to trades…</Badge>
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
        <p className="text-sm text-foreground-muted">
          Get matched against another player. Take turns spinning and drafting an XI — no duplicate players — then your
          rosters clash and the winner banks ladder points.
        </p>
        {phase === "error" && <p className="text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full" onClick={find} disabled={phase === "searching"}>
          {phase === "searching" ? "Searching…" : "Find Opponent"}
        </Button>
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
