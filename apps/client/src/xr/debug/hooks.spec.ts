import { describe, expect, it } from 'vitest';
import {
  createStatsGetter,
  resetLatestPerfStats,
  writeLatestPerfStats,
} from './hooks.js';
import { EMPTY_PERF_STATS } from './stats.js';

describe('overlay stats getter', () => {
  it('falls back until the overlay writes a sample', () => {
    resetLatestPerfStats();
    const getter = createStatsGetter(() => ({
      ...EMPTY_PERF_STATS,
      drawCalls: 9,
      triangles: 1200,
    }));
    expect(getter()).toEqual({
      ...EMPTY_PERF_STATS,
      drawCalls: 9,
      triangles: 1200,
    });
    writeLatestPerfStats({
      ...EMPTY_PERF_STATS,
      fps: 60,
      drawCalls: 12,
      triangles: 3400,
    });
    expect(getter().drawCalls).toBe(12);
    expect(getter().triangles).toBe(3400);
    expect(getter().fps).toBe(60);
    resetLatestPerfStats();
  });
});
