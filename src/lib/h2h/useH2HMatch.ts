"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  findOrCreateMatch,
  commitPick,
  recordMyResult,
  abandonMatch,
  sideForUser,
  type H2HMatchRow,
} from "@/lib/h2h/matchClient";

export type H2HPhase = "idle" | "searching" | "in-match" | "error";

/** Owns one online Head-to-Head match: matchmaking, the realtime
 * subscription that keeps both clients' view of the match row in sync, and
 * the pick/leave actions. The heavy game logic lives in matchClient.ts and
 * headToHead.ts — this hook is just the live wiring. */
export function useH2HMatch(userId: string | null) {
  const [match, setMatch] = useState<H2HMatchRow | null>(null);
  const [phase, setPhase] = useState<H2HPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const recordedRef = useRef(false);

  const find = useCallback(async () => {
    if (!userId) return;
    setError(null);
    setPhase("searching");
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

  // Live-sync the match row (guest joining, opponent picks, completion).
  const matchId = match?.id ?? null;
  useEffect(() => {
    const client = supabase;
    if (!matchId || !client) return;
    const channel = client
      .channel(`h2h:${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "h2h_matches", filter: `id=eq.${matchId}` },
        (payload) => setMatch(payload.new as H2HMatchRow)
      )
      .subscribe();
    return () => {
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

  const pick = useCallback(
    async (playerId: string) => {
      if (!match || !userId) return;
      const side = sideForUser(match, userId);
      if (!side || match.turn !== side) return;
      const updated = await commitPick(match, side, playerId);
      if (updated) setMatch(updated);
    },
    [match, userId]
  );

  const leave = useCallback(async () => {
    if (match && match.status !== "completed") await abandonMatch(match.id);
    setMatch(null);
    setPhase("idle");
  }, [match]);

  const side = match && userId ? sideForUser(match, userId) : null;

  return { match, phase, error, side, find, pick, leave };
}
