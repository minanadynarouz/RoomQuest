/**
 * Local procedural level-key adapter (F-07).
 *
 * TODO(B-09): switch to `procLevelKey`, `PROC_LEVEL_KEY_RE`, and
 * `ResultLevelKey` from `@roomquest/schema` once PR #28 merges. That
 * package does not export them on this branch (stacked on X-05 / PR #20).
 *
 * Format: `proc:<seed>:<tier>`
 * - `seed` is the same string `generatePlan` received (a number is stringified)
 * - `tier` is `"easy"` | `"normal"`
 * Seed must be non-empty and must not contain `:`.
 */

export const PROC_LEVEL_KEY_PREFIX = 'proc:';

export const PROC_LEVEL_KEY_RE = /^proc:([^:]+):(easy|normal)$/;

export type ProcTier = 'easy' | 'normal';

export interface ProcLevelKeyParts {
  seed: string;
  tier: ProcTier;
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

function parseTier(tier: string): ProcTier {
  if (tier === 'easy' || tier === 'normal') return tier;
  throw new Error('proc tier must be easy|normal');
}

/** Build the canonical client procedural key. */
export function procLevelKey(seed: string | number, tier: string): string {
  const seedPart = stringifyProcSeed(seed);
  if (seedPart.length === 0 || seedPart.includes(':')) {
    throw new Error('proc seed must be non-empty and must not contain ":"');
  }
  const parsedTier = parseTier(tier);
  return `${PROC_LEVEL_KEY_PREFIX}${seedPart}:${parsedTier}`;
}

export function parseProcLevelKey(key: string): ProcLevelKeyParts | null {
  const match = PROC_LEVEL_KEY_RE.exec(key);
  const seed = match?.[1];
  const tierPart = match?.[2];
  if (seed === undefined || tierPart === undefined) {
    return null;
  }
  try {
    return { seed, tier: parseTier(tierPart) };
  } catch {
    return null;
  }
}

export function isProcLevelKey(key: string): boolean {
  return PROC_LEVEL_KEY_RE.test(key);
}
