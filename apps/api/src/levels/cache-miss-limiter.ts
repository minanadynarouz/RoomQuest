import { Injectable } from '@nestjs/common';
import { CACHE_MISS_LIMIT, CACHE_MISS_WINDOW_MS } from './rate-limit.constants';

export type CacheMissTakeResult =
  { ok: true } | { ok: false; retryAfterS: number };

/**
 * Sliding-window limiter for cache misses, keyed by device id.
 * In-memory only (MVP). Not shared across API instances.
 *
 * `nowMs` is injectable (same idea as `DIRECTOR_RUNTIME.now`) so tests can
 * freeze or advance the hour window without waiting on wall-clock time.
 * The default calls `Date.now()` at take time so Vitest fake timers work.
 */
@Injectable()
export class CacheMissLimiter {
  private readonly hits = new Map<string, number[]>();

  take(deviceId: string, nowMs: number = Date.now()): CacheMissTakeResult {
    const windowStart = nowMs - CACHE_MISS_WINDOW_MS;
    const recent = (this.hits.get(deviceId) ?? []).filter(
      (stamp) => stamp > windowStart
    );
    if (recent.length >= CACHE_MISS_LIMIT) {
      const oldest = recent[0] ?? nowMs;
      const retryAfterS = Math.max(
        1,
        Math.ceil((oldest + CACHE_MISS_WINDOW_MS - nowMs) / 1000)
      );
      this.hits.set(deviceId, recent);
      return { ok: false, retryAfterS };
    }
    recent.push(nowMs);
    this.hits.set(deviceId, recent);
    return { ok: true };
  }
}
