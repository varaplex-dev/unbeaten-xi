"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import {
  findOrCreateMatch,
  fetchMatch,
  tryPairWaitingRooms,
  heartbeatRoom,
  submitResultIfReady,
  commitPick,
  abandonMatch,
  proposeTrade,
  respondTrade,
  setReady,
  setLineup,
  sideForUser,
  type H2HMatchRow,
} from "@/lib/h2h/matchClient";
import type { H2HLineup } from "@/lib/engine/headToHead";

export type H2HPhase = "idle" | "searching" | "in-match" | "error";

export interface ChatMessage {
  userId: string;
  /** Sender's display name (profile username / guest id), so the other player
   * can tell who's talking. */
  name: string;
  text: string;
  ts: number;
}

/** Broadcast so the waiting player can watch the active player's turn: the
 * team they spun onto and, once the reel lands, the revealed team. Tagged with
 * the pick index it belongs to so a stale signal is ignored. Ephemeral (like
 * chat) — the actual pick still lands in the match row. */
export interface SpinSignal {
  pick: number;
  targetId: string | null;
  revealedId: string | null;
}

/** Owns one online Head-to-Head match: matchmaking, the realtime
 * subscription that keeps both clients' view of the match row in sync, an
 * ephemeral broadcast chat, and the pick/trade/ready/leave actions. The heavy
 * game logic lives in matchClient.ts and headToHead.ts — this hook is the
 * live wiring. */
export function useH2HMatch(userId: string | null, displayName: string) {
  const [match, setMatch] = useState<H2HMatchRow | null>(null);
  const [phase, setPhase] = useState<H2HPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [oppSpin, setOppSpin] = useState<SpinSignal | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const find = useCallback(async () => {
    if (!userId) return;
    setError(null);
    setPhase("searching");
    setMessages([]);
    setOppSpin(null);
    try {
      const m = await findOrCreateMatch(userId);
      setMatch(m);
      setPhase("in-match");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Matchmaking failed");
      setPhase("error");
    }
  }, [userId]);

  // Live-sync the match row (guest joining, opponent picks/trades, completion)
  // and receive chat broadcasts over the same channel.
  const matchId = match?.id ?? null;
  useEffect(() => {
    const client = supabase;
    if (!matchId || !client) return;
    const channel = client
      .channel(`h2h:${matchId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "h2h_matches", filter: `id=eq.${matchId}` },
        (payload) => setMatch(payload.new as H2HMatchRow)
      )
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        setMessages((prev) => [...prev, payload as ChatMessage]);
      })
      .on("broadcast", { event: "spin" }, ({ payload }) => {
        setOppSpin(payload as SpinSignal);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      client.removeChannel(channel);
    };
  }, [matchId]);

  // Polling fallback over the realtime subscription. Realtime can be disabled
  // in the project, or drop a message, which would strand a player — the host
  // never sees a guest join, an opponent's pick never arrives, or a both-ready
  // match never gets simulated. A cheap re-fetch every few seconds makes the
  // whole flow work even with realtime off, just less instantly.
  const pollStatus = match?.status ?? null;
  useEffect(() => {
    if (!supabase || !matchId || !userId) return;
    if (pollStatus === "completed" || pollStatus === "abandoned") return;
    const tick = async () => {
      const current = await fetchMatch(matchId);
      if (!current) return;
      // Still hosting an empty room? Keep it alive in the queue, then try to
      // pair with another waiting room so two players who both created rooms
      // at once still connect.
      if (current.status === "waiting") {
        await heartbeatRoom(matchId);
        const paired = await tryPairWaitingRooms(current, userId);
        if (paired) {
          setMatch(paired);
          return;
        }
      }
      // Both readied but this client hasn't reported yet (or its report
      // hasn't been paired) — submit again. The RPC is idempotent, so a
      // repeat after the match already finalized is harmless.
      if (current.status === "trading" && current.host_ready && current.guest_ready) {
        const done = await submitResultIfReady(current, userId);
        setMatch(done ?? current);
        return;
      }
      setMatch(current);
    };
    const timer = setInterval(tick, 3000);
    return () => clearInterval(timer);
  }, [matchId, pollStatus, userId]);

  const side = match && userId ? sideForUser(match, userId) : null;

  const pick = useCallback(
    async (playerId: string) => {
      if (!match || !side || match.turn !== side) return;
      const updated = await commitPick(match, side, playerId);
      if (updated) setMatch(updated);
    },
    [match, side]
  );

  // Commit a pick for whoever's turn it currently is — used by the WAITING
  // player to auto-pick on behalf of an opponent who has stalled/disconnected,
  // so the draft can't freeze. The commit is atomically guarded on
  // `turn = <active side>`, so if the active player wasn't actually gone only
  // one pick lands; "best available" only ever helps the stalled team.
  const pickForActive = useCallback(
    async (playerId: string) => {
      if (!match || match.status !== "drafting") return;
      const updated = await commitPick(match, match.turn, playerId);
      if (updated) setMatch(updated);
    },
    [match]
  );

  const offerTrade = useCallback(
    async (give: string, want: string) => {
      if (!match || !side) return;
      const updated = await proposeTrade(match, side, give, want);
      if (updated) setMatch(updated);
    },
    [match, side]
  );

  const answerTrade = useCallback(
    async (accept: boolean) => {
      if (!match || !side) return;
      const updated = await respondTrade(match, side, accept);
      if (updated) setMatch(updated);
    },
    [match, side]
  );

  const ready = useCallback(async () => {
    if (!match || !side || !userId) return;
    const updated = await setReady(match, side, userId);
    if (updated) setMatch(updated);
  }, [match, side, userId]);

  const saveLineup = useCallback(
    async (lineup: H2HLineup) => {
      if (!match || !side) return;
      const updated = await setLineup(match, side, lineup);
      if (updated) setMatch(updated);
    },
    [match, side]
  );

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !userId || !channelRef.current) return;
      const msg: ChatMessage = {
        userId,
        name: displayName || "Player",
        text: trimmed.slice(0, 300),
        ts: Date.now(),
      };
      channelRef.current.send({ type: "broadcast", event: "chat", payload: msg });
      setMessages((prev) => [...prev, msg]); // self:false, so echo locally
    },
    [userId, displayName]
  );

  const sendSpin = useCallback((signal: SpinSignal) => {
    channelRef.current?.send({ type: "broadcast", event: "spin", payload: signal });
  }, []);

  const leave = useCallback(async () => {
    if (match && match.status !== "completed") await abandonMatch(match.id);
    setMatch(null);
    setMessages([]);
    setPhase("idle");
  }, [match]);

  return {
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
  };
}
