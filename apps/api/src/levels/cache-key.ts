import { createHash } from 'node:crypto';

/**
 * Deterministic cache key from architecture §6:
 * first 16 hex chars of sha256(`${roomHash}|${date}|${tier}|${promptVersion}`).
 */
export function makeCacheKey(
  roomHash: string,
  date: string,
  tier: string,
  promptVersion: string
): string {
  return createHash('sha256')
    .update(`${roomHash}|${date}|${tier}|${promptVersion}`)
    .digest('hex')
    .slice(0, 16);
}
