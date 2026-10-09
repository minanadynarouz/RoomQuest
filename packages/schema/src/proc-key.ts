import { z } from 'zod';
import { Tier } from './level.js';

/**
 * Client-generated procedural level key.
 * `POST /api/v1/levels/:cacheKey/result` accepts these without a LevelCache row.
 *
 * Format: `proc:<seed>:<tier>` — same string as the F-07 client adapter in
 * `apps/client/src/game/results/proc-key.ts` (do not drift; that file stays
 * local until it can import this helper).
 * - `seed` is the same string `generatePlan` received (a number is stringified)
 * - `tier` is the schema `Tier` enum (`easy` | `normal`)
 * Seed must be non-empty and must not contain `:`, so the key round-trips.
 */
export const PROC_LEVEL_KEY_PREFIX = 'proc:';

/** Anchored matcher for `proc:<seed>:<tier>`. Seed is `[^:]+`. */
export const PROC_LEVEL_KEY_RE = /^proc:([^:]+):(easy|normal)$/;

export const ProcLevelKey = z
  .string()
  .regex(PROC_LEVEL_KEY_RE, 'expected proc:<seed>:<tier>')
  .refine((value) => parseProcLevelKey(value) !== null, {
    message: 'expected proc:<seed>:<tier> with a valid Tier',
  });
export type ProcLevelKey = z.infer<typeof ProcLevelKey>;

/**
 * Path param for `POST /api/v1/levels/:cacheKey/result`.
 * Director cache keys are opaque (unknown → 404 later). Anything that
 * starts with `proc:` must match `ProcLevelKey` (malformed → 400).
 */
export const ResultLevelKey = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith(PROC_LEVEL_KEY_PREFIX) || PROC_LEVEL_KEY_RE.test(value),
    { message: 'expected proc:<seed>:<tier> with tier easy|normal' }
  );
export type ResultLevelKey = z.infer<typeof ResultLevelKey>;

export interface ProcLevelKeyParts {
  seed: string;
  tier: Tier;
}

/**
 * Build the canonical key. Must produce the same string as the F-07
 * client-local `procLevelKey` (`proc:<seed>:<tier>`).
 */
export function procLevelKey(seed: string | number, tier: Tier): ProcLevelKey {
  const seedPart = stringifyProcSeed(seed);
  if (seedPart.length === 0 || seedPart.includes(':')) {
    throw new Error('proc seed must be non-empty and must not contain ":"');
  }
  const parsedTier = Tier.parse(tier);
  return ProcLevelKey.parse(
    `${PROC_LEVEL_KEY_PREFIX}${seedPart}:${parsedTier}`
  );
}

export function parseProcLevelKey(key: string): ProcLevelKeyParts | null {
  const match = PROC_LEVEL_KEY_RE.exec(key);
  const seed = match?.[1];
  const tierPart = match?.[2];
  if (seed === undefined || tierPart === undefined) {
    return null;
  }
  const tier = Tier.safeParse(tierPart);
  if (!tier.success) {
    return null;
  }
  return { seed, tier: tier.data };
}

export function isProcLevelKey(key: string): key is ProcLevelKey {
  return PROC_LEVEL_KEY_RE.test(key);
}

export function isProcLevelKeyAttempt(key: string): boolean {
  return key.startsWith(PROC_LEVEL_KEY_PREFIX);
}

function stringifyProcSeed(seed: string | number): string {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) {
      throw new Error('proc seed must be a finite number or non-empty string');
    }
    return String(seed);
  }
  return seed;
}
