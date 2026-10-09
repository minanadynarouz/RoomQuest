/**
 * Seeded PRNG for the procedural generator.
 *
 * mulberry32, seeded from an FNV-1a string hash. No `Math.random`, no `Date`.
 * Safe in the browser instant-fallback path.
 */

export interface Rng {
  /** Uniform float in `[0, 1)`. */
  next: () => number;
  /** Uniform integer in `[0, maxExclusive)`. */
  nextInt: (maxExclusive: number) => number;
  /** Pick one item; `fallback` is used when `items` is empty. */
  pick: <T>(items: readonly T[], fallback: T) => T;
}

/** 32-bit FNV-1a of `input`. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * mulberry32: small, fast, 32-bit. Returns values in `[0, 1)`.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const next = mulberry32(hashString(seed));
  return {
    next,
    nextInt: (maxExclusive: number) => {
      if (maxExclusive <= 1) {
        return 0;
      }
      return Math.floor(next() * maxExclusive);
    },
    pick: <T>(items: readonly T[], fallback: T): T => {
      if (items.length === 0) {
        return fallback;
      }
      const item = items[Math.floor(next() * items.length)];
      return item ?? fallback;
    },
  };
}
