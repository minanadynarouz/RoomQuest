import { describe, expect, it } from 'vitest';
import { formatDebugBlock, formatDebugLines, formatLatency } from './format.js';
import { EMPTY_PERF_STATS } from './stats.js';

describe('debug overlay format', () => {
  it('renders screenshot-friendly aligned rows', () => {
    const block = formatDebugBlock({
      ...EMPTY_PERF_STATS,
      fps: 60.2,
      drawCalls: 24,
      triangles: 18000,
      surfaces: 5,
      source: 'cache',
      latencyMs: 8,
      repairs: 0,
      fallbackReason: null,
      validationIssues: 0,
      directorStatus: 'resolved',
      requestId: 'req-abc',
      repairedBy: 'snap',
      relaxed: ['PATH_DISTANCE_TOO_SHORT'],
    });
    expect(block).toContain('PERF');
    expect(block).toContain('fps      60');
    expect(block).toContain('draws    24');
    expect(block).toContain('tris     18000');
    expect(block).toContain('source   cache');
    expect(block).toContain('latency  8ms');
    expect(block).toContain('fallback -');
    expect(block).toContain('director resolved');
    expect(block).toContain('reqId    req-abc');
    expect(block).toContain('repaired snap');
    expect(block).toContain('relaxed  PATH_DISTANCE_TOO_SHORT');
    expect(formatLatency(null)).toBe('-');
    expect(formatDebugLines(EMPTY_PERF_STATS).map((line) => line.id)).toEqual([
      'debug-fps',
      'debug-draws',
      'debug-tris',
      'debug-surfaces',
      'debug-source',
      'debug-latency',
      'debug-repairs',
      'debug-fallback',
      'debug-issues',
      'debug-director',
      'debug-reqid',
      'debug-repaired',
      'debug-relaxed',
    ]);
  });
});
