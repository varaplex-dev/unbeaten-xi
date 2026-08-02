import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftCategoryId, Player } from "@/lib/types";
import { SQUAD_SIZE, canBowl, isPaceBowler, isSpinner } from "@/lib/types";
import { getPlayerById } from "@/lib/data/players";
import {
  formationPositions,
  type FormationId,
} from "@/lib/data/fieldingPositions";
import {
  eraTeams,
  nationalTeamPool,
  iplFranchisePool,
  realPlayers,
  getEraTeamById,
  pickNextEraTeam,
  getRealPoolPlayerById,
} from "@/lib/data/gameData";
import { DEFAULT_COMPETITION_ID, type CompetitionId } from "@/lib/engine/competitions";

/** Which set of teams a mode drafts from — deliberately separate from the
 * competition (which sets the match count). "full" is every real squad,
 * "nations" is the World Cup Run pool (no club franchises), and "ipl" is the
 * India XI pool of real IPL franchise-season squads. */
export type TeamScope = "full" | "nations" | "ipl";

/** The striker's batting hand, used only to mirror the Hardcore field-setter. */
export type BatterHand = "right" | "left";

export function poolForScope(scope: TeamScope) {
  switch (scope) {
    case "nations":
      return nationalTeamPool();
    case "ipl":
      return iplFranchisePool();
    default:
      return eraTeams();
  }
}

/** Games saved before teamScope existed default to "full" on hydration; if such
 * a game was a World Cup run, honour its nations-only pool for the remaining
 * spins rather than suddenly letting a club franchise appear. */
export function resolveScope(scope: TeamScope, competition: CompetitionId): TeamScope {
  if (scope === "full" && competition === "world-cup") return "nations";
  return scope;
}
import { randomSeedString, todaySeedString } from "@/lib/engine/rng";
import { autoAssignLineup, type BowlingPhase } from "@/lib/engine/lineup";
import { simulateSeason, type MatchDecision, type MatchResult, type SeasonStats } from "@/lib/engine/simulate";
import type { FieldingAssignments } from "@/lib/engine/fielding";
import { generateRandomXI, spinImpactPlayer } from "@/lib/engine/draft";
import { AUCTION_BUDGET, auctionListingOf, auctionSpend } from "@/lib/engine/auction";
import { PLAYERS } from "@/lib/data/players";
import { track } from "@/lib/analytics";

export interface DraftPickRecord {
  roundNumber: number;
  categoryId: DraftCategoryId;
  playerId: string;
}

export type GameStage = "draft" | "squad-select" | "impact-player" | "auction" | "team-setup" | "season" | "results";

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
  /** Which team pool this game spins from — see TeamScope. Separate from
   * competition: India XI plays a normal league season (match count) but
   * drafts from IPL squads only (scope). */
  teamScope: TeamScope;
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
  /** Auction Mode: the player ids bought so far, in purchase order. Their
   * prices and the purse live in engine/auction.ts; only the picks are state.
   * Empty in every other mode. */
  auctionPurchases: string[];

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
  /** The preset field formation currently applied (Hardcore Mode). null until
   * one is chosen; the board applies the default on entry. */
  fieldingFormation: FormationId | null;
  /** Which batter's hand the field is drawn for (Hardcore Mode). A left-hander
   * mirrors the field — off and leg sides swap — so the captain can set it the
   * way a real one would. Visual only: assignments are keyed by position id, so
   * the flip never changes who's where or the catching bonus. */
  fieldingBatterHand: BatterHand;
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
  spinEraTeam: (competition?: CompetitionId, teamScope?: TeamScope) => void;
  spinNextTeam: () => void;
  startAuction: () => void;
  buyAuctionPlayer: (playerId: string) => void;
  sellAuctionPlayer: (playerId: string) => void;
  completeAuction: () => void;
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
  applyFieldingFormation: (id: FormationId) => void;
  setFieldingBatterHand: (hand: BatterHand) => void;
}

/** The bowler's pseudo-position id in fieldingAssignments — the one non-keeper
 * who bowls rather than fields, shown at the far end of the pitch. */
export const BOWLER_SLOT = "bowler";

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
  teamScope: "full",
  isDaily: false,
  createdAt: null,
  stage: "draft",
  draftPicks: [],
  eraTeamId: null,
  usedEraTeamIds: [],
  squadSlots: Array<string | null>(SQUAD_SIZE).fill(null),
  pendingPlayerId: null,
  pickSourceYears: {},
  auctionPurchases: [],
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
  fieldingFormation: null,
  fieldingBatterHand: "right",
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

      /** Picks up an XI player to move — a fielder, the bowler, or an as-yet
       * unplaced player. Tap a spot next to drop/swap. Hardcore Mode only. */
      selectPlayerForFielding: (playerId) => {
        set((s) => ({ pendingFieldingPlayerId: s.pendingFieldingPlayerId === playerId ? null : playerId }));
      },

      /** Drops the picked-up player onto a spot (a fielding position or the
       * BOWLER_SLOT). Empty → move; occupied → swap. Only the close-catching
       * spots feed the sim (see fieldingWicketBonus); the rest is strategy. */
      assignFieldingPosition: (positionId) => {
        const { pendingFieldingPlayerId, fieldingAssignments } = get();
        if (!pendingFieldingPlayerId) return;
        const next = { ...fieldingAssignments };
        const fromPos = Object.keys(next).find((pid) => next[pid] === pendingFieldingPlayerId);
        if (fromPos === positionId) {
          set({ pendingFieldingPlayerId: null });
          return;
        }
        const occupant = next[positionId];
        next[positionId] = pendingFieldingPlayerId;
        if (fromPos) {
          // Swap the displaced player back into the vacated spot, or empty it.
          if (occupant) next[fromPos] = occupant;
          else delete next[fromPos];
        }
        // If the picked-up player had no prior spot and the target was
        // occupied, that occupant is simply displaced (becomes unplaced).
        set({ fieldingAssignments: next, pendingFieldingPlayerId: null });
      },

      /** Applies a preset formation: auto-places the nine fielders into that
       * formation's spots (better catchers — bowlers/all-rounders — into the
       * close catching positions) and leaves one specialist as the bowler at
       * the far end. The user can then tap to swap anyone around. */
      applyFieldingFormation: (id) => {
        const { draftPicks, mode, wicketkeeperId } = get();
        const xi = getXi(draftPicks, mode);
        if (xi.length !== SQUAD_SIZE) return;
        const outfield = xi.filter((p) => p.id !== wicketkeeperId);
        const bowler =
          outfield.find((p) => isPaceBowler(p) || isSpinner(p)) ?? outfield[outfield.length - 1];
        const fielders = outfield.filter((p) => p.id !== bowler?.id);
        // Catchers first, so they land in the catching-zone-first formation.
        const ordered = [...fielders].sort((a, b) => Number(canBowl(b)) - Number(canBowl(a)));
        const positions = formationPositions(id);
        const assignments: FieldingAssignments = {};
        positions.forEach((pos, i) => {
          if (ordered[i]) assignments[pos.id] = ordered[i].id;
        });
        if (bowler) assignments[BOWLER_SLOT] = bowler.id;
        set({ fieldingFormation: id, fieldingAssignments: assignments, pendingFieldingPlayerId: null });
      },

      setFieldingBatterHand: (hand) => set({ fieldingBatterHand: hand }),

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
      spinEraTeam: (competition = DEFAULT_COMPETITION_ID, teamScope = "full") => {
        const seed = randomSeedString();
        set({
          ...initialState,
          gameId: `game-${Date.now()}`,
          seed,
          mode: "all-time-real",
          competition,
          teamScope,
          isDaily: false,
          createdAt: new Date().toISOString(),
          eraTeamId: null,
          usedEraTeamIds: [],
          stage: "squad-select",
        });
        track("game_started", { mode: "all-time-real", method: "spin-era-team", competition, teamScope });
      },

      /** Reveals the next team for the round in progress — every pick comes
       * from a fresh spin, so this excludes teams already drafted from. */
      spinNextTeam: () => {
        const { seed, usedEraTeamIds, competition, teamScope } = get();
        if (!seed) return;
        const pool = poolForScope(resolveScope(teamScope, competition));
        const eraTeam = pickNextEraTeam(seed, usedEraTeamIds, pool);
        if (!eraTeam) return; // data not loaded yet — spin is gated on it in the UI
        set({ eraTeamId: eraTeam.id });
      },

      /** Auction Mode: start a fresh salary-cap draft. */
      startAuction: () => {
        set({
          ...initialState,
          gameId: `game-${Date.now()}`,
          seed: randomSeedString(),
          mode: "all-time-real",
          competition: DEFAULT_COMPETITION_ID,
          teamScope: "full",
          isDaily: false,
          createdAt: new Date().toISOString(),
          stage: "auction",
          auctionPurchases: [],
        });
        track("game_started", { mode: "all-time-real", method: "auction" });
      },

      /** Buy a player, if the roster has room, the purse can cover the price,
       * and neither this id nor another id for the same player is already in. */
      buyAuctionPlayer: (playerId) => {
        const { auctionPurchases } = get();
        if (auctionPurchases.length >= SQUAD_SIZE) return;
        if (auctionPurchases.includes(playerId)) return;
        const listing = auctionListingOf(playerId);
        if (!listing) return;
        if (auctionSpend(auctionPurchases) + listing.price > AUCTION_BUDGET + 1e-9) return;
        // Same cricketer can exist under several ids — block a duplicate by name.
        const ownedNames = new Set(
          auctionPurchases.map((id) => auctionListingOf(id)?.player.name).filter(Boolean)
        );
        if (ownedNames.has(listing.player.name)) return;
        set({ auctionPurchases: [...auctionPurchases, playerId] });
        track("player_selected", { categoryId: "auction", roundNumber: auctionPurchases.length + 1 });
      },

      sellAuctionPlayer: (playerId) => {
        set({ auctionPurchases: get().auctionPurchases.filter((id) => id !== playerId) });
      },

      /** Lock in the bought XI and hand off to the shared team-setup → season
       * flow, exactly like a completed spin draft (order = purchase order, soft
       * composition — usedEraTeamIds marks it as a free-build squad). */
      completeAuction: () => {
        const { auctionPurchases } = get();
        if (auctionPurchases.length !== SQUAD_SIZE) return;
        set({
          draftPicks: auctionPurchases.map(
            (id, i): DraftPickRecord => ({ roundNumber: i + 1, categoryId: "wildcard", playerId: id })
          ),
          battingOrder: auctionPurchases.slice(),
          squadSlots: auctionPurchases.slice(),
          usedEraTeamIds: ["__auction__"],
          stage: "team-setup",
        });
        track("draft_completed", { squadSize: SQUAD_SIZE, method: "auction" });
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

        const decisions = get().decisions;
        // In-match decisions are a Hardcore-Mode mechanic. Classic passes
        // decisionsEnabled: false, so the season has no decision matches at
        // all — no phantom bonuses and no "the gamble didn't come off"
        // narratives for calls the player never made. Hardcore keeps them and
        // pauses on each via the pendingDecision flow (see resolveDecision).
        const result = simulateSeason(
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
            decisionsEnabled: hardcoreMode,
          }
        );

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
