import { describe, expect, it } from 'vitest';
import { CacheMissLimiter } from './cache-miss-limiter';
import { CACHE_MISS_LIMIT } from './rate-limit.constants';

const DEVICE = '550e8400-e29b-41d4-a716-446655440099';

describe('CacheMissLimiter', () => {
  it(`allows ${String(CACHE_MISS_LIMIT)} takes and rejects the next with retryAfterS`, () => {
    const limiter = new CacheMissLimiter();
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
      expect(limiter.take(DEVICE, t0 + i)).toEqual({ ok: true });
    }
    const blocked = limiter.take(DEVICE, t0 + CACHE_MISS_LIMIT);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterS).toBeGreaterThan(0);
      expect(blocked.retryAfterS).toBeLessThanOrEqual(3600);
    }
  });

  it('does not share budget across device ids', () => {
    const limiter = new CacheMissLimiter();
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
      expect(limiter.take('device-a', t0 + i).ok).toBe(true);
    }
    expect(limiter.take('device-b', t0).ok).toBe(true);
  });
});
