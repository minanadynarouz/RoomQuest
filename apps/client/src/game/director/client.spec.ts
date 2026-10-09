/**
 * Director client tests - F-03
 * Mocked fetch for success, invalid-plan, timeout, and network-error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LevelPlan, LevelResponse, SurfaceGraph } from '@roomquest/schema';
import { createDirectorClient } from './client.js';
import { createDirectorClientFromEnv } from './factory.js';
import { applyDirectorResult } from './apply.js';
import { stubGenerate, schemaValidate } from './fallback.js';
import { createGameStore } from '../store.js';
import type { FetchLike, GenerateFn, KvStore } from './types.js';

const GRAPH: SurfaceGraph = {
  version: 1,
  roomHash: 'f1a2b3c4d5e6',
  mode: 'scene',
  floorY: 0,
  nodes: [
    {
      id: 's1',
      label: 'table',
      kind: 'plane',
      topHeight: 0.75,
      centroid: [0, 0.75, 0],
      size: [1, 0.6],
      yaw: 0,
      area: 0.6,
      reach: 'hand',
      angleFromForward: 0,
    },
    {
      id: 's2',
      label: 'couch',
      kind: 'mesh',
      topHeight: 0.45,
      centroid: [0, 0.45, -2],
      size: [2, 0.9],
      yaw: 0,
      area: 1.8,
      reach: 'ray',
      angleFromForward: 25,
    },
  ],
  edges: [{ a: 's1', b: 's2', gap: 0.4, dh: -0.3, kind: 'plank' }],
};

function localPlan(seed = 'f1a2b3c4d5e6-2026-10-09'): LevelPlan {
  return stubGenerate(GRAPH, seed, 'normal');
}

function apiPlan(): LevelPlan {
  return {
    ...localPlan('api-seed'),
    title: 'API Quest',
    seed: 'api-seed',
  };
}

function apiResponse(overrides?: Partial<LevelResponse>): LevelResponse {
  return {
    plan: apiPlan(),
    source: 'llm',
    cacheKey: 'abcd1234abcd1234',
    model: 'gemini-3.8-flash',
    promptVersion: 'v1',
    latencyMs: 120,
    repairs: [],
    ...overrides,
  };
}

function jsonResponse(
  payload: unknown,
  status = 200
): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  };
}

function memoryStore(initial: Record<string, string> = {}): KvStore {
  const data = { ...initial };
  return {
    getItem(key) {
      return data[key] ?? null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

describe('createDirectorClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const generate: GenerateFn = (graph, seed, tier) =>
    stubGenerate(graph, seed, tier);

  function client(
    fetchFn: FetchLike,
    extra?: Partial<Parameters<typeof createDirectorClient>[0]>
  ) {
    return createDirectorClient({
      fetch: fetchFn,
      apiBaseUrl: 'http://localhost:3000',
      deviceId: '11111111-2222-4333-8444-555555555555',
      clientVersion: '0.1.0',
      generate,
      validate: schemaValidate,
      date: '2026-10-09',
      ...extra,
    });
  }

  it('accepts a valid API plan on the success path', async () => {
    const fetchFn = vi.fn<FetchLike>((url, init) => {
      expect(url).toBe('http://localhost:3000/api/v1/levels');
      expect(init.method).toBe('POST');
      expect(init.headers['X-Device-Id']).toBe(
        '11111111-2222-4333-8444-555555555555'
      );
      expect(init.headers['X-Client-Version']).toBe('0.1.0');
      const body = JSON.parse(init.body) as {
        graph: SurfaceGraph;
        date: string;
        tier: string;
      };
      expect(body.date).toBe('2026-10-09');
      expect(body.tier).toBe('normal');
      expect(body.graph.roomHash).toBe('f1a2b3c4d5e6');
      return Promise.resolve(jsonResponse(apiResponse()));
    });

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(false);
    expect(result.source).toBe('llm');
    expect(result.plan.title).toBe('API Quest');
    expect(result.cacheKey).toBe('abcd1234abcd1234');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('falls back when the API plan fails local validation', async () => {
    const badPlan = {
      ...apiPlan(),
      start: 's99',
      goal: 's99',
      placements: apiPlan().placements.map((p) => ({
        ...p,
        surface: 's99',
        to: undefined,
      })),
    };
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ ...apiResponse(), plan: badPlan }))
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('invalid-plan');
    expect(result.source).toBe('procedural');
    expect(result.plan.start).toBe('s1');
    expect(result.plan.goal).toBe('s2');
  });

  it('falls back when LevelResponse does not parse', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ not: 'a level response' }))
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('invalid-plan');
    expect(result.source).toBe('procedural');
  });

  it('falls back on timeout when fetch is aborted', async () => {
    const fetchFn = vi.fn<FetchLike>(
      (_url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    const started = Date.now();
    const result = await client(fetchFn, { budgetMs: 25 }).requestPlan(GRAPH);
    const elapsed = Date.now() - started;

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('timeout');
    expect(result.source).toBe('procedural');
    expect(elapsed).toBeLessThan(8000);
  });

  it('falls back on network error', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.reject(new Error('Failed to fetch'))
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('network');
    expect(result.source).toBe('procedural');
    expect(result.plan.placements.length).toBeGreaterThanOrEqual(4);
  });

  it('falls back on HTTP error without throwing', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ error: { code: 'INTERNAL' } }, 500))
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('http-error');
    expect(result.source).toBe('procedural');
  });

  it('starts the generator in parallel with the POST', async () => {
    let generateCalls = 0;
    const slowFetch: FetchLike = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return jsonResponse(apiResponse());
    };
    const racingGenerate: GenerateFn = (graph, seed, tier) => {
      generateCalls += 1;
      return stubGenerate(graph, seed, tier);
    };

    const result = await client(slowFetch, {
      generate: racingGenerate,
    }).requestPlan(GRAPH);

    expect(generateCalls).toBe(1);
    expect(result.usedFallback).toBe(false);
    expect(result.source).toBe('llm');
  });

  it('skips the API when director=off', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(apiResponse()))
    );
    const result = await client(fetchFn, { directorMode: 'off' }).requestPlan(
      GRAPH
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.source).toBe('procedural');
    expect(result.fallbackReason).toBe('director-off');
    expect(result.plan.seed).toBe('f1a2b3c4d5e6-2026-10-09');
  });

  it('skips the API when director=mock', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(apiResponse()))
    );
    const result = await client(fetchFn, { directorMode: 'mock' }).requestPlan(
      GRAPH
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.fallbackReason).toBe('director-mock');
    expect(result.source).toBe('procedural');
  });

  it('honours seed and date overrides', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.reject(new Error('network down'))
    );
    const result = await client(fetchFn).requestPlan(GRAPH, {
      seed: 'custom-seed',
      date: '2026-12-01',
    });

    expect(result.plan.seed).toBe('custom-seed');
  });

  it('always resolves to a schema-valid plan', async () => {
    const paths: FetchLike[] = [
      () => Promise.resolve(jsonResponse(apiResponse())),
      () => Promise.resolve(jsonResponse({ broken: true })),
      () => Promise.reject(new Error('offline')),
    ];

    for (const fetchFn of paths) {
      const result = await client(fetchFn).requestPlan(GRAPH);
      expect(result.plan.placements.length).toBeGreaterThanOrEqual(4);
      expect(result.plan.start).toBe('s1');
      expect(result.latencyMs).toBeLessThan(8000);
    }
  });
});

describe('createDirectorClientFromEnv', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads director flags and persists a device id', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(apiResponse()))
    );
    const storage = memoryStore();
    const director = createDirectorClientFromEnv({
      search: '?director=off&seed=flag-seed&date=2026-10-09',
      storage,
      fetch: fetchFn,
      apiBaseUrl: 'http://localhost:3000',
      randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });

    const result = await director.requestPlan(GRAPH);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.plan.seed).toBe('flag-seed');
    expect(storage.getItem('roomquest:deviceId')).toBe(
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    );
  });
});

describe('applyDirectorResult', () => {
  it('surfaces source and latency on the game store', () => {
    const store = createGameStore();
    store.requestLevel();
    store.startSurveying();

    applyDirectorResult(store, {
      plan: localPlan(),
      source: 'llm',
      cacheKey: 'cache-1',
      promptVersion: 'v1',
      latencyMs: 412,
      repairs: ['clamped-uv'],
      usedFallback: false,
    });

    expect(store.phase).toBe('building');
    expect(store.planSource).toBe('llm');
    expect(store.directorLatencyMs).toBe(412);
    expect(store.repairs).toEqual(['clamped-uv']);
    expect(store.cacheKey).toBe('cache-1');
    expect(store.plan?.title).toBe('Roomquest');
  });
});
