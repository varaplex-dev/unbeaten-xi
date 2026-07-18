import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftCategoryId, Player } from "@/lib/types";
import { SQUAD_SIZE } from "@/lib/types";
import { getPlayerById } from "@/lib/data/players";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { getLegendPlayerById } from "@/lib/data/legendPlayers";
import { ERA_TEAMS, getEraTeamById } from "@/lib/data/eraTeams";
import { randomSeedString, todaySeedString, createRng, pickRandom } from "@/lib/engine/rng";
import { autoAssignLineup, type BowlingPhase } from "@/lib/engine/lineup";
import { simulateSeason, type MatchDecision, type MatchResult, type SeasonStats } from "@/lib/engine/simulate";
import { generateRandomXI, spinImpactPlayer } from "@/lib/engine/draft";
import { PLAYERS } from "@/lib/data/players";
import { REAL_PLAYERS } from "@/lib/data/realPlayers";
import { track } from "@/lib/analytics";

export interface DraftPickRecord {
  roundNumber: number;
  categoryId: DraftCategoryId;
  playerId: string;
}

export type GameStage = "draft" | "squad-select" | "impact-player" | "team-setup" | "season" | "results";

/** "fictional" is the original mock roster; "all-time-real" draws from the
 * real, stats-derived pool in realPlayers.ts — including, when eraTeamId is
 * set, the legends pool a spun Era Team's roster might reference. */
export type GameMode = "fictional" | "all-time-real";

function playerLookup(mode: GameMode, id: string): Player | undefined {
  if (mode === "all-time-real") return getRealPlayerById(id) ?? getLegendPlayerById(id);
  return getPlayerById(id);
}

export interface GameState {
  gameId: string | null;
  seed: string | null;
  mode: GameMode;
  isDaily: boolean;
  createdAt: string | null;
  stage: GameStage;
  draftPicks: DraftPickRecord[];
  /** The Era Team currently revealed for the round in progress — drives
   * squad-select's player pool for this pick. Cleared after every pick (XI
   * or Impact Player), since each pick comes from spinning into a fresh
   * team; null between spins, while waiting for the user to spin again. */
  eraTeamId: string | null;
  /** Every team already drafted from this game, oldest first — excluded
   * from future spins (one pick per team) and used by team-setup to detect
   * "this squad was assembled via spin-drafting" (skip the overseas-quota
   * rule, which doesn't apply to a squad stitched together from many
   * single-nation-by-construction teams). */
  usedEraTeamIds: string[];

  battingOrder: string[];
  bowlingRoleAssignments: Record<string, BowlingPhase>;
  captainId: string | null;
  viceCaptainId: string | null;
  wicketkeeperId: string | null;
  impactPlayerId: string | null;

  // Season stage
  matchResults: MatchResult[];
  seasonStats: SeasonStats | null;
  decisions: Record<number, string>;
  pendingDecision: MatchDecision | null;
  /** True once this game's result has been written to Supabase, so the
   * results page doesn't insert a duplicate row on re-render or revisit. */
  resultSaved: boolean;

  /** True once the persisted state has been read from localStorage. */
  hasHydrated: boolean;
}

interface GameActions {
  startNewGame: (options?: { seed?: string; isDaily?: boolean; mode?: GameMode }) => void;
  spinTheWheel: (mode: GameMode) => void;
  spinEraTeam: () => void;
  spinNextTeam: () => void;
  selectSquadPlayer: (player: Player) => void;
  draftPlayer: (player: Player, categoryId: DraftCategoryId) => void;
  pickImpactPlayer: (player: Player) => void;
  skipImpactPlayer: () => void;
  resetGame: () => void;
  startDailyChallenge: () => void;
  setHasHydrated: (hydrated: boolean) => void;
  autoBuildLineup: () => void;
  setBattingOrder: (order: string[]) => void;
  moveBattingOrderItem: (playerId: string, direction: "up" | "down") => void;
  setCaptain: (playerId: string) => void;
  setWicketkeeper: (playerId: string) => void;
  setBowlingRole: (playerId: string, role: BowlingPhase) => void;
  runSeasonSimulation: () => void;
  resolveDecision: (choiceId: string) => void;
  markResultSaved: () => void;
}

// hasHydrated is intentionally excluded here: it must survive resetGame()
// and startNewGame() spreads, since it reflects localStorage load status,
// not game progress.
const initialState: Omit<GameState, "hasHydrated"> = {
  gameId: null,
  seed: null,
  mode: "fictional",
  isDaily: false,
  createdAt: null,
  stage: "draft",
  draftPicks: [],
  eraTeamId: null,
  usedEraTeamIds: [],
  battingOrder: [],
  bowlingRoleAssignments: {},
  captainId: null,
  viceCaptainId: null,
  wicketkeeperId: null,
  impactPlayerId: null,
  matchResults: [],
  seasonStats: null,
  decisions: {},
  pendingDecision: null,
  resultSaved: false,
};

function getXi(draftPicks: DraftPickRecord[], mode: GameMode): Player[] {
  return draftPicks.map((pick) => playerLookup(mode, pick.playerId)).filter((p): p is Player => Boolean(p));
}

export const useGameStore = create<GameState & GameActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      hasHydrated: false,

      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

      startNewGame: (options) => {
        const seed = options?.seed ?? randomSeedString();
        const isDaily = options?.isDaily ?? false;
        const mode = options?.mode ?? "fictional";
        set({
          ...initialState,
          gameId: `game-${Date.now()}`,
          seed,
          mode,
          isDaily,
          createdAt: new Date().toISOString(),
        });
        track(isDaily ? "daily_challenge_started" : "game_started", { mode });
      },

      startDailyChallenge: () => {
        get().startNewGame({ seed: todaySeedString(), isDaily: true, mode: "all-time-real" });
      },

      spinTheWheel: (mode) => {
        const seed = randomSeedString();
        const pool = mode === "all-time-real" ? REAL_PLAYERS : PLAYERS;

        const picks = generateRandomXI(seed, pool);
        const xi = picks.map((p) => p.player);
        const draftPicks: DraftPickRecord[] = picks.map((p) => ({
          roundNumber: p.roundNumber,
          categoryId: p.categoryId,
          playerId: p.player.id,
        }));

        const impactPlayer = spinImpactPlayer(seed, xi, pool);
        const lineup = autoAssignLineup(xi);

        set({
          ...initialState,
          gameId: `game-${Date.now()}`,
          seed,
          mode,
          isDaily: false,
          createdAt: new Date().toISOString(),
          draftPicks,
          impactPlayerId: impactPlayer?.id ?? null,
          battingOrder: lineup.battingOrder,
          bowlingRoleAssignments: lineup.bowlingRoleAssignments,
          captainId: lineup.captainId,
          viceCaptainId: lineup.viceCaptainId,
          wicketkeeperId: lineup.wicketkeeperId,
          stage: "team-setup",
        });
        track("game_started", { mode, method: "spin-the-wheel" });
      },

      spinEraTeam: () => {
        const seed = randomSeedString();
        const rng = createRng(`${seed}::era-team-0`);
        const eraTeam = pickRandom(rng, ERA_TEAMS);

        set({
          ...initialState,
          gameId: `game-${Date.now()}`,
          seed,
          mode: "all-time-real",
          isDaily: false,
          createdAt: new Date().toISOString(),
          eraTeamId: eraTeam.id,
          usedEraTeamIds: [],
          stage: "squad-select",
        });
        track("game_started", { mode: "all-time-real", method: "spin-era-team", eraTeamId: eraTeam.id });
      },

      /** Reveals the next team for the round in progress — every pick comes
       * from a fresh spin, so this excludes teams already drafted from. */
      spinNextTeam: () => {
        const { seed, usedEraTeamIds } = get();
        if (!seed) return;
        const available = ERA_TEAMS.filter((t) => !usedEraTeamIds.includes(t.id));
        // Only hit if usedEraTeamIds somehow grew past the pool size — not
        // reachable in practice (89 teams, 12 picks max) but a safe fallback
        // beats a spin that silently does nothing.
        const pool = available.length > 0 ? available : ERA_TEAMS;
        const rng = createRng(`${seed}::era-team-${usedEraTeamIds.length}`);
        const eraTeam = pickRandom(rng, pool);
        set({ eraTeamId: eraTeam.id });
      },

      selectSquadPlayer: (player) => {
        const { draftPicks, eraTeamId, usedEraTeamIds } = get();
        if (!eraTeamId) return;
        const eraTeam = getEraTeamById(eraTeamId);
        if (!eraTeam) return;
        if (draftPicks.length >= SQUAD_SIZE) return;
        if (draftPicks.some((pick) => pick.playerId === player.id)) return;
        if (!eraTeam.players.some((p) => p.id === player.id)) return;

        const nextPicks: DraftPickRecord[] = [
          ...draftPicks,
          { roundNumber: draftPicks.length + 1, categoryId: "wildcard", playerId: player.id },
        ];
        const squadComplete = nextPicks.length >= SQUAD_SIZE;
        set({
          draftPicks: nextPicks,
          usedEraTeamIds: [...usedEraTeamIds, eraTeamId],
          // Cleared regardless of squadComplete — squad-select shows the
          // Impact Player spin prompt next, same "spin for your pick" UI.
          eraTeamId: null,
        });
        track("player_selected", { categoryId: "wildcard", roundNumber: nextPicks.length });
        if (squadComplete) track("draft_completed", { squadSize: SQUAD_SIZE });
      },

      draftPlayer: (player, categoryId) => {
        const { draftPicks } = get();
        if (draftPicks.length >= SQUAD_SIZE) return;
        if (draftPicks.some((pick) => pick.playerId === player.id)) return;

        const nextPicks: DraftPickRecord[] = [
          ...draftPicks,
          {
            roundNumber: draftPicks.length + 1,
            categoryId,
            playerId: player.id,
          },
        ];
        const draftComplete = nextPicks.length >= SQUAD_SIZE;
        set({
          draftPicks: nextPicks,
          stage: draftComplete ? "impact-player" : "draft",
        });
        track("player_selected", { categoryId, roundNumber: nextPicks.length });
        if (draftComplete) track("draft_completed", { squadSize: SQUAD_SIZE });
      },

      pickImpactPlayer: (player) => {
        const { eraTeamId, usedEraTeamIds } = get();
        set({
          impactPlayerId: player.id,
          stage: "team-setup",
          // Spin-draft games reveal one more team for the Impact Player
          // pick; category-draft games never set eraTeamId, so this is a
          // no-op there.
          ...(eraTeamId ? { usedEraTeamIds: [...usedEraTeamIds, eraTeamId], eraTeamId: null } : {}),
        });
      },

      skipImpactPlayer: () => {
        set({ impactPlayerId: null, stage: "team-setup", eraTeamId: null });
      },

      resetGame: () => set(initialState),

      autoBuildLineup: () => {
        const { draftPicks, mode } = get();
        const xi = getXi(draftPicks, mode);
        if (xi.length !== SQUAD_SIZE) return;

        const lineup = autoAssignLineup(xi);
        set({
          battingOrder: lineup.battingOrder,
          bowlingRoleAssignments: lineup.bowlingRoleAssignments,
          captainId: lineup.captainId,
          viceCaptainId: lineup.viceCaptainId,
          wicketkeeperId: lineup.wicketkeeperId,
        });
      },

      setBattingOrder: (order) => set({ battingOrder: order }),

      moveBattingOrderItem: (playerId, direction) => {
        const { battingOrder } = get();
        const index = battingOrder.indexOf(playerId);
        if (index === -1) return;
        const swapWith = direction === "up" ? index - 1 : index + 1;
        if (swapWith < 0 || swapWith >= battingOrder.length) return;
        const next = [...battingOrder];
        [next[index], next[swapWith]] = [next[swapWith], next[index]];
        set({ battingOrder: next });
      },

      setCaptain: (playerId) => set({ captainId: playerId }),

      setWicketkeeper: (playerId) => set({ wicketkeeperId: playerId }),

      setBowlingRole: (playerId, role) => {
        const { bowlingRoleAssignments } = get();
        set({ bowlingRoleAssignments: { ...bowlingRoleAssignments, [playerId]: role } });
      },

      runSeasonSimulation: () => {
        const { draftPicks, seed, mode, isDaily, battingOrder, captainId, impactPlayerId, decisions, matchResults } =
          get();
        const xi = getXi(draftPicks, mode);
        if (xi.length !== SQUAD_SIZE || !seed || !captainId) return;
        const impactPlayer = impactPlayerId ? (playerLookup(mode, impactPlayerId) ?? null) : null;
        const isFirstRun = matchResults.length === 0;

        const { matches, stats, pendingDecision } = simulateSeason(
          seed,
          xi,
          battingOrder,
          captainId,
          impactPlayer,
          decisions
        );
        set({
          matchResults: matches,
          seasonStats: stats,
          pendingDecision,
          stage: stats ? "results" : "season",
        });

        if (isFirstRun) track("season_started", { mode });
        if (stats) {
          track("season_completed", { mode, wins: stats.wins, losses: stats.losses });
          if (isDaily) track("daily_challenge_completed", { wins: stats.wins, losses: stats.losses });
        }
      },

      resolveDecision: (choiceId) => {
        const { pendingDecision, decisions } = get();
        if (!pendingDecision) return;
        set({ decisions: { ...decisions, [pendingDecision.matchNumber]: choiceId } });
        track("match_decision_made", {
          matchNumber: pendingDecision.matchNumber,
          type: pendingDecision.type,
          choiceId,
        });
        get().runSeasonSimulation();
      },

      markResultSaved: () => set({ resultSaved: true }),
    }),
    {
      name: "fourteen-zero-game",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export function useDraftedPlayers(): Player[] {
  const draftPicks = useGameStore((s) => s.draftPicks);
  const mode = useGameStore((s) => s.mode);
  return getXi(draftPicks, mode);
}
