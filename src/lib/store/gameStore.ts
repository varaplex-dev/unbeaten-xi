import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftCategoryId, Player } from "@/lib/types";
import { SQUAD_SIZE } from "@/lib/types";
import { getPlayerById } from "@/lib/data/players";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { randomSeedString, todaySeedString } from "@/lib/engine/rng";
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

export type GameStage = "draft" | "impact-player" | "team-setup" | "season" | "results";

/** "fictional" is the original mock roster; "all-time-real" draws from the
 * real, stats-derived pool in realPlayers.ts. */
export type GameMode = "fictional" | "all-time-real";

function playerLookup(mode: GameMode, id: string): Player | undefined {
  return mode === "all-time-real" ? getRealPlayerById(id) : getPlayerById(id);
}

export interface GameState {
  gameId: string | null;
  seed: string | null;
  mode: GameMode;
  isDaily: boolean;
  createdAt: string | null;
  stage: GameStage;
  draftPicks: DraftPickRecord[];

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

  /** True once the persisted state has been read from localStorage. */
  hasHydrated: boolean;
}

interface GameActions {
  startNewGame: (options?: { seed?: string; isDaily?: boolean; mode?: GameMode }) => void;
  spinTheWheel: (mode: GameMode) => void;
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
        set({ impactPlayerId: player.id, stage: "team-setup" });
      },

      skipImpactPlayer: () => {
        set({ impactPlayerId: null, stage: "team-setup" });
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
