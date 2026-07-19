import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftCategoryId, Player } from "@/lib/types";
import { SQUAD_SIZE } from "@/lib/types";
import { getPlayerById } from "@/lib/data/players";
import { getRealPlayerById } from "@/lib/data/realPlayers";
import { getLegendPlayerById } from "@/lib/data/legendPlayers";
import { getEraTeamById, pickNextEraTeam } from "@/lib/data/eraTeams";
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
  /** Batting-order slots (index 0 = position 1) for a spin-drafted squad —
   * null until the user places a player there. Distinct from draftPicks:
   * a slot can be filled out of order (pick #3 might get placed in slot 7),
   * so this needs to support gaps in a way draftPicks' append-only list
   * can't. draftPicks/battingOrder are only populated, in slot order, once
   * every slot here is filled — see placeSquadPlayer(). */
  squadSlots: (string | null)[];
  /** The player just picked from the revealed team, waiting for the user to
   * choose which batting-order slot to place them in — see
   * selectSquadPlayer()/placeSquadPlayer(). Null when nothing is pending. */
  pendingPlayerId: string | null;

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
  placeSquadPlayer: (slotIndex: number) => void;
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
  squadSlots: Array<string | null>(SQUAD_SIZE).fill(null),
  pendingPlayerId: null,
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

      /** Starts a fresh spin-draft game but doesn't pick a team yet — the
       * squad-select page runs a reel animation for the first spin too, and
       * commits the actual pick via spinNextTeam() once it finishes. */
      spinEraTeam: () => {
        const seed = randomSeedString();
        set({
          ...initialState,
          gameId: `game-${Date.now()}`,
          seed,
          mode: "all-time-real",
          isDaily: false,
          createdAt: new Date().toISOString(),
          eraTeamId: null,
          usedEraTeamIds: [],
          stage: "squad-select",
        });
        track("game_started", { mode: "all-time-real", method: "spin-era-team" });
      },

      /** Reveals the next team for the round in progress — every pick comes
       * from a fresh spin, so this excludes teams already drafted from. */
      spinNextTeam: () => {
        const { seed, usedEraTeamIds } = get();
        if (!seed) return;
        const eraTeam = pickNextEraTeam(seed, usedEraTeamIds);
        set({ eraTeamId: eraTeam.id });
      },

      /** Marks a player as this spin's pick, pending a batting-order
       * placement — selecting doesn't finalize a slot. The user still has
       * to choose where in the order they go via placeSquadPlayer(), which
       * is the actual strategic decision (see that function's comment). */
      selectSquadPlayer: (player) => {
        const { squadSlots, eraTeamId, usedEraTeamIds } = get();
        if (!eraTeamId) return;
        const eraTeam = getEraTeamById(eraTeamId);
        if (!eraTeam) return;
        if (squadSlots.every((id) => id !== null)) return;
        if (squadSlots.includes(player.id)) return;
        if (!eraTeam.players.some((p) => p.id === player.id)) return;

        set({
          pendingPlayerId: player.id,
          usedEraTeamIds: [...usedEraTeamIds, eraTeamId],
          eraTeamId: null,
        });
        track("player_selected", {
          categoryId: "wildcard",
          roundNumber: squadSlots.filter((id) => id !== null).length + 1,
        });
      },

      /** Confirms the pending pick's batting-order slot — the actual
       * strategic choice this whole flow builds up to. expectedRunsFromBatting()
       * in statsSimulation.ts weights the top of the order more heavily than
       * the tail, so where a player lands genuinely changes the season
       * simulation, not just the display order. Once every slot is filled,
       * draftPicks and battingOrder (read by composition checks, team-setup,
       * and the simulation itself) are populated in slot order in one shot. */
      placeSquadPlayer: (slotIndex) => {
        const { pendingPlayerId, squadSlots } = get();
        if (!pendingPlayerId) return;
        if (slotIndex < 0 || slotIndex >= SQUAD_SIZE) return;
        if (squadSlots[slotIndex] !== null) return;

        const nextSlots = [...squadSlots];
        nextSlots[slotIndex] = pendingPlayerId;
        const squadComplete = nextSlots.every((id) => id !== null);

        set({
          squadSlots: nextSlots,
          pendingPlayerId: null,
          ...(squadComplete
            ? {
                draftPicks: nextSlots.map(
                  (id, i): DraftPickRecord => ({ roundNumber: i + 1, categoryId: "wildcard", playerId: id as string })
                ),
                battingOrder: nextSlots as string[],
              }
            : {}),
        });
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
