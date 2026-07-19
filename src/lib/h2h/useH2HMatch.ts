"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import {
  findOrCreateMatch,
  commitPick,
  recordMyResult,
  abandonMatch,
  proposeTrade,
  respondTrade,
  setReady,
  sideForUser,
  type H2HMatchRow,
} from "@/lib/h2h/matchClient";

export type H2HPhase = "idle" | "searching" | "in-match" | "error";

export interface ChatMessage {
  userId: string;
  text: string;
  ts: number;
}

/** Owns one online Head-to-Head match: matchmaking, the realtime
 * subscription that keeps both clients' view of the match row in sync, an
 * ephemeral broadcast chat, and the pick/trade/ready/leave actions. The heavy
 * game logic lives in matchClient.ts and headToHead.ts — this hook is the
 * live wiring. */
export function useH2HMatch(userId: string | null) {
  const [match, setMatch] = useState<H2HMatchRow | null>(null);
  const [phase, setPhase] = useState<H2HPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const recordedRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const find = useCallback(async () => {
    if (!userId) return;
    setError(null);
    setPhase("searching");
    setMessages([]);
    recordedRef.current = false;
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
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      client.removeChannel(channel);
    };
  }, [matchId]);

  // Once complete, each client records its own result row exactly once.
  useEffect(() => {
    if (!match || !userId) return;
    if (match.status === "completed" && match.result && !recordedRef.current) {
      recordedRef.current = true;
      void recordMyResult(match, userId);
    }
  }, [match, userId]);

  const side = match && userId ? sideForUser(match, userId) : null;

  const pick = useCallback(
    async (playerId: string) => {
      if (!match || !side || match.turn !== side) return;
      const updated = await commitPick(match, side, playerId);
      if (updated) setMatch(updated);
    },
    [match, side]
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
    if (!match || !side) return;
    const updated = await setReady(match, side);
    if (updated) setMatch(updated);
  }, [match, side]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !userId || !channelRef.current) return;
      const msg: ChatMessage = { userId, text: trimmed.slice(0, 300), ts: Date.now() };
      channelRef.current.send({ type: "broadcast", event: "chat", payload: msg });
      setMessages((prev) => [...prev, msg]); // self:false, so echo locally
    },
    [userId]
  );

  const leave = useCallback(async () => {
    if (match && match.status !== "completed") await abandonMatch(match.id);
    setMatch(null);
    setMessages([]);
    setPhase("idle");
  }, [match]);

  return { match, phase, error, side, messages, find, pick, offerTrade, answerTrade, ready, sendChat, leave };
}
