// Quick composition sanity check for the generated real-player pool.
// Run with: npx tsx scripts/cricket-data/check-pool.ts
import { REAL_PLAYERS } from "../../src/lib/data/realPlayers";
import { isWicketkeeper, isPaceBowler, isSpinner, canBowl } from "../../src/lib/types";

console.log("Total:", REAL_PLAYERS.length);
console.log("Keepers:", REAL_PLAYERS.filter(isWicketkeeper).length);
console.log("Pace bowlers:", REAL_PLAYERS.filter(isPaceBowler).length);
console.log("Spinners:", REAL_PLAYERS.filter(isSpinner).length);
console.log("Bowling-capable:", REAL_PLAYERS.filter(canBowl).length);
console.log("Overseas:", REAL_PLAYERS.filter((p) => p.nationalityType === "overseas").length);
console.log("Indian:", REAL_PLAYERS.filter((p) => p.nationalityType === "indian").length);
