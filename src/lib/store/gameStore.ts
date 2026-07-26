import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftCategoryId, Player } from "@/lib/types";
import { SQUAD_SIZE } from "@/lib/types";
import { getPlayerById } from "@/lib/data/players";
import {
  eraTeams,
  nationalTeamPool,
  realPlayers,
  getEraTeamById,
  pickNextEraTeam,
  getRealPoolPlayerById,
} from "@/lib/data/gameData";
import { DEFAULT_COMPETITION_ID, type CompetitionId } from "@/lib/engine/competitions";

/** Which teams a competition drafts from. A World Cup is contested by nations,
 * so its pool excludes the club franchises; every other competition uses the
 * full pool. */
function teamPoolFor(competition: CompetitionId) {
  return competition === "world-cup" ? nationalTeamPool() : eraTeams();
}
import { randomSeedString, todaySeedString } from "@/lib/engine/rng";
import { autoAssignLineup, type BowlingPhase } from "@/lib/engine/lineup";
import { simulateSeason, type MatchDecision, type MatchResult, type SeasonStats } from "@/lib/engine/simulate";
import type { FieldingAssignments } from "@/lib/engine/fielding";
import { generateRandomXI, spinImpactPlayer } from "@/lib/engine/draft";
import { PLAYERS } from "@/lib/data/players";
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
  if (mode === "all-time-real") return getRealPoolPlayerById(id);
  return getPlayerById(id);
}

export interface GameState {
  gameId: string | null;
  seed: string | null;
  mode: GameMode;
  isDaily: boolean;
  createdAt: string | null;
  /** Which real competition this game is being played as — sets the season
   * length (14 league matches, 9 for a World Cup run) and, for World Cup Run,
   * restricts the spin pool to national sides. See engine/competitions.ts. */
  competition: CompetitionId;
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
  /** playerId -> the era year of the team they were drafted from (see
   * EraTeam.year). Averaged at simulation time so a spin-drafted squad's
   * season is played against era-appropriate opponents. Empty for the old
   * flat-draft modes, which then simulate with no era adjustment. */
  pickSourceYears: Record<string, number>;

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

  /** Real fielding-position assignments (position id -> player id) for
   * Hardcore Mode — see fielding.ts. Empty/unused in a normal game. */
  fieldingAssignments: FieldingAssignments;
  /** The XI player selected for fielding placement, waiting for a position
   * tap — same select-then-place pattern as selectSquadPlayer/
   * placeSquadPlayer. Only used in Hardcore Mode. */
  pendingFieldingPlayerId: string | null;
  /** A standing preference, not per-game progress — deliberately excluded
   * from initialState's reset-on-new-game spread (see hardcoreMode's
   * handling right below hasHydrated) so toggling it in Settings doesn't
   * get wiped out the next time a game starts. */
  hardcoreMode: boolean;
  /** The user's best-ever local result (wins always implies losses =
   * SQUAD_SIZE - wins, so only wins needs comparing). A lifetime record,
   * not per-game progress — excluded from initialState for the same reason
   * as hardcoreMode, so starting or resetting a game never erases it. */
  bestSeason: { wins: number; losses: number } | null;

  /** True once the persisted state has been read from localStorage. */
  hasHydrated: boolean;
}

interface GameActions {
  startNewGame: (options?: { seed?: string; isDaily?: boolean; mode?: GameMode }) => void;
  spinTheWheel: (mode: GameMode) => void;
  spinEraTeam: (competition?: CompetitionId) => void;
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
  setHardcoreMode: (enabled: boolean) => void;
  selectPlayerForFielding: (playerId: string) => void;
  assignFieldingPosition: (positionId: string) => void;
}

// hasHydrated, hardcoreMode, and bestSeason are intentionally excluded here:
// hasHydrated reflects localStorage load status, hardcoreMode is a standing
// user preference, and bestSeason is a lifetime record — none of these is
// per-game progress, so all three must survive
// resetGame()/startNewGame()/spinEraTeam()/spinTheWheel()'s `...initialState`
// spreads instead of getting wiped every time a new game starts.
const initialState: Omit<GameState, "hasHydrated" | "hardcoreMode" | "bestSeason"> = {
  gameId: null,
  seed: null,
  mode: "fictional",
  competition: DEFAULT_COMPETITION_ID,
  isDaily: false,
  createdAt: null,
  stage: "draft",
  draftPicks: [],
  eraTeamId: null,
  usedEraTeamIds: [],
  squadSlots: Array<string | null>(SQUAD_SIZE).fill(null),
  pendingPlayerId: null,
  pickSourceYears: {},
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
  fieldingAssignments: {},
  pendingFieldingPlayerId: null,
};

function getXi(draftPicks: DraftPickRecord[], mode: GameMode): Player[] {
  return draftPicks.map((pick) => playerLookup(mode, pick.playerId)).filter((p): p is Player => Boolean(p));
}

export const useGameStore = create<GameState & GameActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      hasHydrated: false,
      hardcoreMode: false,
      bestSeason: null,

      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

      setHardcoreMode: (enabled) => set({ hardcoreMode: enabled }),

      /** Marks an XI player as ready to be placed on the field — same
       * select-then-place pattern as squad-select's placement mechanic.
       * Hardcore Mode only; a normal game never calls this. */
      selectPlayerForFielding: (playerId) => {
        const { fieldingAssignments } = get();
        if (Object.values(fieldingAssignments).includes(playerId)) return;
        set({ pendingFieldingPlayerId: playerId });
      },

      /** Confirms the pending player's real fielding position. Only the two
       * close-catching spots (slip, gully) feed into the simulation (see
       * fieldingWicketBonus) — the rest of the board is genuine strategic
       * depth without a fabricated stat behind it. */
      assignFieldingPosition: (positionId) => {
        const { pendingFieldingPlayerId, fieldingAssignments } = get();
        if (!pendingFieldingPlayerId) return;
        if (fieldingAssignments[positionId]) return;
        set({
          fieldingAssignments: { ...fieldingAssignments, [positionId]: pendingFieldingPlayerId },
          pendingFieldingPlayerId: null,
        });
      },

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
        const pool = mode === "all-time-real" ? realPlayers() : PLAYERS;

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
       * commits the actual pick via spinNextTeam() once it finishes.
       *
       * `competition` decides both the season length and which teams can be
       * spun into: the default league campaign draws on everything, while
       * World Cup Run is restricted to national sides. */
      spinEraTeam: (competition = DEFAULT_COMPETITION_ID) => {
        const seed = randomSeedString();
        set({
          ...initialState,
          gameId: `game-${Date.now()}`,
          seed,
          mode: "all-time-real",
          competition,
          isDaily: false,
          createdAt: new Date().toISOString(),
          eraTeamId: null,
          usedEraTeamIds: [],
          stage: "squad-select",
        });
        track("game_started", { mode: "all-time-real", method: "spin-era-team", competition });
      },

      /** Reveals the next team for the round in progress — every pick comes
       * from a fresh spin, so this excludes teams already drafted from. */
      spinNextTeam: () => {
        const { seed, usedEraTeamIds, competition } = get();
        if (!seed) return;
        const eraTeam = pickNextEraTeam(seed, usedEraTeamIds, teamPoolFor(competition));
        if (!eraTeam) return; // data not loaded yet — spin is gated on it in the UI
        set({ eraTeamId: eraTeam.id });
      },

      /** Marks a player as this spin's pick, pending a batting-order
       * placement — selecting doesn't finalize a slot. The user still has
       * to choose where in the order they go via placeSquadPlayer(), which
       * is the actual strategic decision (see that function's comment). */
      selectSquadPlayer: (player) => {
        const { squadSlots, eraTeamId, usedEraTeamIds, pickSourceYears } = get();
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
          pickSourceYears: { ...pickSourceYears, [player.id]: eraTeam.year },
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
        const { eraTeamId, usedEraTeamIds, pickSourceYears } = get();
        const eraTeam = eraTeamId ? getEraTeamById(eraTeamId) : null;
        set({
          impactPlayerId: player.id,
          stage: "team-setup",
          // Spin-draft games reveal one more team for the Impact Player
          // pick; category-draft games never set eraTeamId, so this is a
          // no-op there.
          ...(eraTeamId ? { usedEraTeamIds: [...usedEraTeamIds, eraTeamId], eraTeamId: null } : {}),
          ...(eraTeam ? { pickSourceYears: { ...pickSourceYears, [player.id]: eraTeam.year } } : {}),
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
        const {
          draftPicks,
          seed,
          mode,
          competition,
          isDaily,
          battingOrder,
          captainId,
          impactPlayerId,
          matchResults,
          hardcoreMode,
          fieldingAssignments,
          bestSeason,
          pickSourceYears,
        } = get();
        const xi = getXi(draftPicks, mode);
        if (xi.length !== SQUAD_SIZE || !seed || !captainId) return;
        const impactPlayer = impactPlayerId ? (playerLookup(mode, impactPlayerId) ?? null) : null;
        const isFirstRun = matchResults.length === 0;

        // Average the era of the drafted XI (only spin-draft games record a
        // source year per pick) so the season is played against opponents
        // anchored to that era — a 1980s legends side isn't measured against
        // modern T20 run-rates, and vice versa.
        const eraYears = xi
          .map((p) => pickSourceYears[p.id])
          .filter((y): y is number => typeof y === "number");
        const averageEra = eraYears.length
          ? Math.round(eraYears.reduce((sum, y) => sum + y, 0) / eraYears.length)
          : undefined;

        let decisions = get().decisions;
        let result = simulateSeason(
          seed,
          xi,
          battingOrder,
          captainId,
          impactPlayer,
          decisions,
          {
            fieldingAssignments: hardcoreMode ? fieldingAssignments : undefined,
            averageEra,
            competition,
          }
        );

        // Classic mode never surfaces in-match decisions — that interactive
        // layer is Hardcore Mode's territory. Auto-resolve with the first
        // option (a neutral default, not a claimed-optimal one) and keep
        // re-running until the season actually finishes, so the user sees a
        // single straight-through simulation with no further input needed.
        while (result.pendingDecision && !hardcoreMode) {
          decisions = { ...decisions, [result.pendingDecision.matchNumber]: result.pendingDecision.options[0].id };
          result = simulateSeason(seed, xi, battingOrder, captainId, impactPlayer, decisions, {
            averageEra,
            competition,
          });
        }

        const { matches, stats, pendingDecision } = result;
        // The landing hero frames this record around the flagship 14-match
        // league ("14 MATCHES / N LOSSES"), so only league seasons feed it.
        // Otherwise a 9-0 World Cup would show as "0 losses" against a 14-match
        // goal (implying a 14-0 never achieved), and — comparing by raw wins —
        // a mediocre 10-4 league could overwrite a genuine undefeated run.
        // Within one competition length, most wins == fewest losses, so the
        // wins comparison is correct once the length is fixed.
        const nextBestSeason =
          stats && competition === "league-major" && (!bestSeason || stats.wins > bestSeason.wins)
            ? { wins: stats.wins, losses: stats.losses }
            : bestSeason;

        set({
          matchResults: matches,
          seasonStats: stats,
          pendingDecision,
          decisions,
          bestSeason: nextBestSeason,
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
