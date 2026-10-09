import { describe, expect, it, vi } from 'vitest';
import { useDirectorFakeTimers } from '../director/test-clock';
import { CacheMissLimiter } from './cache-miss-limiter';
import { CACHE_MISS_LIMIT, CACHE_MISS_WINDOW_MS } from './rate-limit.constants';

const DEVICE = '550e8400-e29b-41d4-a716-446655440099';
const T0 = 1_700_000_000_000;

describe('CacheMissLimiter', () => {
  it(`allows ${String(CACHE_MISS_LIMIT)} takes and rejects the next with retryAfterS`, () => {
    const limiter = new CacheMissLimiter();
    for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
      expect(limiter.take(DEVICE, T0)).toEqual({ ok: true });
    }
    expect(limiter.take(DEVICE, T0)).toEqual({
      ok: false,
      retryAfterS: 3600,
    });
    expect(limiter.take(DEVICE, T0 + 60_000)).toEqual({
      ok: false,
      retryAfterS: 3540,
    });
  });

  it('allows another take after the hour window (injected nowMs)', () => {
    const limiter = new CacheMissLimiter();
    for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
      expect(limiter.take(DEVICE, T0).ok).toBe(true);
    }
    expect(limiter.take(DEVICE, T0 + CACHE_MISS_WINDOW_MS - 1).ok).toBe(false);
    expect(limiter.take(DEVICE, T0 + CACHE_MISS_WINDOW_MS)).toEqual({
      ok: true,
    });
  });

  describe('fake timers', () => {
    useDirectorFakeTimers();

    it('uses Date.now when nowMs is omitted, then allows after the hour', () => {
      const limiter = new CacheMissLimiter();
      for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
        expect(limiter.take(DEVICE).ok).toBe(true);
      }
      expect(limiter.take(DEVICE)).toEqual({ ok: false, retryAfterS: 3600 });
      vi.advanceTimersByTime(CACHE_MISS_WINDOW_MS);
      expect(limiter.take(DEVICE)).toEqual({ ok: true });
    });
  });

  it('does not share budget across device ids', () => {
    const limiter = new CacheMissLimiter();
    for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
      expect(limiter.take('device-a', T0 + i).ok).toBe(true);
    }
    expect(limiter.take('device-b', T0).ok).toBe(true);
  });
});
