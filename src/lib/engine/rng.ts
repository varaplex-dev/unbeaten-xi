// Deterministic seeded PRNG so a given seed always reproduces the same
// draft, match sequence, and decisions. mulberry32 is small, fast, and has
// good-enough statistical properties for game logic (not cryptography).

export type RandomFn = () => number;

export function mulberry32(seed: number): RandomFn {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes an arbitrary string seed into a 32-bit integer (djb2 variant). */
export function hashStringToSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

export function createRng(seed: string | number): RandomFn {
  const numericSeed = typeof seed === "number" ? seed : hashStringToSeed(seed);
  return mulberry32(numericSeed);
}

/** YYYY-MM-DD in the local timezone, used as the daily challenge seed. */
export function todaySeedString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `daily-${y}-${m}-${d}`;
}

export function randomSeedString(): string {
  return `seed-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function pickRandom<T>(rng: RandomFn, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Fisher-Yates shuffle using the supplied RNG; does not mutate the input. */
export function shuffle<T>(rng: RandomFn, items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Picks `count` unique items from `items` without replacement. */
export function pickN<T>(rng: RandomFn, items: readonly T[], count: number): T[] {
  return shuffle(rng, items).slice(0, Math.max(0, Math.min(count, items.length)));
}

/** Weighted pick where each item's weight is given by `weightOf`. */
export function pickWeighted<T>(
  rng: RandomFn,
  items: readonly T[],
  weightOf: (item: T) => number
): T {
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return pickRandom(rng, items);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= Math.max(0, weights[i]);
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Weighted sample of `count` unique items, without replacement. */
export function pickNWeighted<T>(
  rng: RandomFn,
  items: readonly T[],
  count: number,
  weightOf: (item: T) => number
): T[] {
  const pool = [...items];
  const result: T[] = [];
  const n = Math.max(0, Math.min(count, pool.length));
  for (let i = 0; i < n; i++) {
    const pick = pickWeighted(rng, pool, weightOf);
    result.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return result;
}
