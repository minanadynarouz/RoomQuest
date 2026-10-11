/**
 * End-to-end: a route-arm POST /api/v1/levels body (server shape: `lines`
 * as `{ beat: '<index>', text }` next to the plan, plus `routeId`) must reach
 * the store, the Pip speech card and the `?debug=1` overlay sample.
 */
import { IWER_GRAPHS } from '@roomquest/fixtures';
import {
  applyDecoration,
  candidateRoutes,
  validatePlan,
} from '@roomquest/level-core';
import { LevelResponse } from '@roomquest/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDirectorResult } from '../../game/director/apply.js';
import { createDirectorClientFromEnv } from '../../game/director/factory.js';
import { resetHealthPrewarmForTests } from '../../game/director/health-prewarm.js';
import { createGameStore } from '../../game/store.js';
import { selectSpeechCard } from '../../ui/visibility.js';
import { EMPTY_PERF_STATS, sampleStoreStats, type RqPerfStats } from './stats.js';

function routeArmBody(): { body: unknown; lineCount: number; routeId: string } {
  const graph = IWER_GRAPHS.living_room;
  const candidates = candidateRoutes(graph, { seed: 'seed', tier: 'normal' });
  const route = candidates[0];
  if (!route) throw new Error('no candidate route');
  const applied = applyDecoration(candidates, {
    routeId: route.id,
    theme: 'Sofa summit climb',
    twistBeat: '0',
    hazards: [],
    lines: route.plan.beats.slice(0, 4).map((_beat, index) => ({
      beat: String(index),
      text: `Pip line ${String(index)}`,
    })),
  });
  if (!applied.ok) throw new Error('decoration rejected');
  // Exactly what the API serializes (run-director.ts route arm), over JSON.
  const response = LevelResponse.parse({
    plan: applied.plan,
    source: 'llm',
    cacheKey: 'abcd1234abcd1234',
    model: 'gemini-3.8-flash',
    promptVersion: 'v1',
    latencyMs: 900,
    repairs: [],
    relaxed: validatePlan(applied.plan, graph).relaxed,
    lines: applied.lines,
    routeId: route.id,
  });
  return {
    body: JSON.parse(JSON.stringify(response)) as unknown,
    lineCount: applied.lines.length,
    routeId: route.id,
  };
}

describe('server Pip lines → store → speech card → debug overlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetHealthPrewarmForTests();
  });

  it('keeps route-arm lines with ?director=live&emulator=1&debug=1', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { body, lineCount, routeId } = routeArmBody();
    expect(lineCount).toBeGreaterThan(0);
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      })
    );
    const director = createDirectorClientFromEnv({
      search: '?director=live&emulator=1&debug=1',
      storage: { getItem: () => null, setItem: () => undefined },
      fetch: fetchFn,
      apiBaseUrl: 'http://localhost:3000',
    });
    const result = await director.requestPlan(IWER_GRAPHS.living_room);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.usedFallback).toBe(false);
    expect(result.lines).toHaveLength(lineCount);

    const store = createGameStore();
    store.requestLevel();
    store.startSurveying();
    applyDirectorResult(store, result);
    expect(Object.keys(store.level.lines)).toHaveLength(lineCount);
    store.startPlaying();

    // Beat 0 (0-based) fires a pipLine and the card shows the server text.
    expect(
      selectSpeechCard(
        store.phase,
        store.state.currentBeatIndex,
        store.events,
        store.nowMs
      )
    ).toEqual({ beat: '0', text: 'Pip line 0' });

    // The overlay frame sample must report the kept lines and route id.
    const scratch: RqPerfStats = { ...EMPTY_PERF_STATS };
    sampleStoreStats(store, scratch);
    expect(scratch.lines).toBe(lineCount);
    expect(scratch.route).toBe(routeId);
    expect(scratch.source).toBe('llm');
  });
});
