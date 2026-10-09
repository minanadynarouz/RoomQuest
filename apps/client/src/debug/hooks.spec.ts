import { describe, expect, it } from 'vitest';
import {
  applyRqHooks,
  createStatsGetter,
  resetLatestPerfStats,
  shouldExposeDebugHooks,
  writeLatestPerfStats,
  type RqDebugHooks,
  type RqHookTarget,
} from './hooks.js';
import { EMPTY_PERF_STATS } from './stats.js';

function fakeHooks(overrides: Partial<RqDebugHooks> = {}): RqDebugHooks {
  return {
    store: { plan: null } as RqDebugHooks['store'],
    graph: null,
    plan: null,
    snapTargets: [],
    drawCalls: 0,
    placement: null,
    stats: () => EMPTY_PERF_STATS,
    ...overrides,
  };
}

describe('applyRqHooks gating', () => {
  it('does not install __rq in production without ?debug=1', () => {
    const target: RqHookTarget = {};
    const installed = applyRqHooks({ debug: false }, false, target, fakeHooks);
    expect(installed).toBe(false);
    expect(target.__rq).toBeUndefined();
    expect(shouldExposeDebugHooks({ debug: false }, false)).toBe(false);
  });

  it('installs __rq when ?debug=1 in production', () => {
    const target: RqHookTarget = {};
    const installed = applyRqHooks({ debug: true }, false, target, () =>
      fakeHooks({
        stats: () => ({ ...EMPTY_PERF_STATS, drawCalls: 4 }),
      })
    );
    expect(installed).toBe(true);
    expect(target.__rq).toBeDefined();
    expect(target.__rq?.store).toBeDefined();
    expect(target.__rq?.plan).toBeNull();
    expect(target.__rq?.stats().drawCalls).toBe(4);
    expect(typeof target.__rq?.stats).toBe('function');
    expect(target.__rq?.autoSolve).toBeUndefined();
  });

  it('installs __rq in dev without the debug flag', () => {
    const target: RqHookTarget = {};
    expect(applyRqHooks({ debug: false }, true, target, fakeHooks)).toBe(true);
    expect(target.__rq).toBeDefined();
  });

  it('strips a previously installed hook when gated off', () => {
    const target: RqHookTarget = { __rq: fakeHooks() };
    applyRqHooks({ debug: false }, false, target, fakeHooks);
    expect(target.__rq).toBeUndefined();
  });

  it('keeps the typed autoSolve slot when reinstalling', () => {
    const autoSolve = async (): Promise<void> => {
      /* F-09 / X-05 */
    };
    const target: RqHookTarget = {
      __rq: fakeHooks({ autoSolve }),
    };
    applyRqHooks({ debug: true }, false, target, fakeHooks);
    expect(target.__rq?.autoSolve).toBe(autoSolve);
  });
});

describe('stats getter', () => {
  it('falls back until the overlay writes a sample', () => {
    resetLatestPerfStats();
    const getter = createStatsGetter(
      () => ({ ...EMPTY_PERF_STATS, drawCalls: 9, triangles: 1200 })
    );
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
