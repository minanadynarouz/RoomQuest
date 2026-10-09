import { describe, it, expect } from 'vitest';
import { PAR_TIME_MAX_MS, PAR_TIME_MIN_MS } from '@roomquest/schema';
import { clampParTimeMs } from './clamp-par';

describe('clampParTimeMs', () => {
  it('returns integers inside the legal range unchanged', () => {
    expect(clampParTimeMs(PAR_TIME_MIN_MS)).toBe(PAR_TIME_MIN_MS);
    expect(clampParTimeMs(180000)).toBe(180000);
    expect(clampParTimeMs(PAR_TIME_MAX_MS)).toBe(PAR_TIME_MAX_MS);
  });

  it('clamps below min up to PAR_TIME_MIN_MS', () => {
    expect(clampParTimeMs(0)).toBe(PAR_TIME_MIN_MS);
    expect(clampParTimeMs(1)).toBe(PAR_TIME_MIN_MS);
    expect(clampParTimeMs(PAR_TIME_MIN_MS - 1)).toBe(PAR_TIME_MIN_MS);
  });

  it('clamps above max down to PAR_TIME_MAX_MS', () => {
    expect(clampParTimeMs(PAR_TIME_MAX_MS + 1)).toBe(PAR_TIME_MAX_MS);
    expect(clampParTimeMs(999999)).toBe(PAR_TIME_MAX_MS);
  });

  it('rounds to an integer before clamping', () => {
    expect(clampParTimeMs(180000.4)).toBe(180000);
    expect(clampParTimeMs(180000.6)).toBe(180001);
  });

  it('snaps non-finite values to PAR_TIME_MIN_MS', () => {
    expect(clampParTimeMs(Number.NaN)).toBe(PAR_TIME_MIN_MS);
    expect(clampParTimeMs(Number.POSITIVE_INFINITY)).toBe(PAR_TIME_MIN_MS);
    expect(clampParTimeMs(Number.NEGATIVE_INFINITY)).toBe(PAR_TIME_MIN_MS);
  });
});
