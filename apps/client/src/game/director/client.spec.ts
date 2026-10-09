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

/** Player graph whose surface ids do not match the B-02 fixture (s1/s2/s4). */
const SCANNED_GRAPH: SurfaceGraph = {
  version: 1,
  roomHash: 'aabbccddeeff',
  mode: 'scene',
  floorY: 0,
  nodes: [
    {
      id: 's10',
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
      id: 's11',
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
  edges: [{ a: 's10', b: 's11', gap: 0.4, dh: -0.3, kind: 'plank' }],
};

/**
 * Schema-valid plan using fixture surface ids (s1, s2, s4), as B-02's mock
 * director returns until B-05 binds plans to the request graph.
 */
function b02FixturePlan(): LevelPlan {
  return {
    seed: 'f1a2b3c4d5e6-2026-10-14',
    theme: 'forest',
    title: 'The Living Room Quest',
    start: 's1',
    goal: 's2',
    parTimeMs: 180000,
    placements: [
      {
        id: 'p1',
        piece: 'village_hut',
        surface: 's1',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p2',
        piece: 'plank_bridge',
        surface: 's1',
        to: 's2',
        u: 0.8,
        v: 0.5,
        playerBuilt: true,
        links: [],
      },
      {
        id: 'p3',
        piece: 'gate',
        surface: 's2',
        u: 0.3,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p4',
        piece: 'lever',
        surface: 's4',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: ['p3'],
      },
      {
        id: 'p5',
        piece: 'crystal_shrine',
        surface: 's2',
        u: 0.8,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
    ],
    beats: [
      { goal: 'Bridge the gap to the couch', uses: ['p2'] },
      { goal: 'Reach the crystal shrine', uses: ['p5'] },
    ],
    dialogue: [{ trigger: 'intro', line: 'Help me reach it.' }],
  };
}

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

  it('treats a B-02 fixture-id plan as a clean graph-mismatch fallback', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(
          apiResponse({
            plan: b02FixturePlan(),
            source: 'procedural',
          })
        )
      )
    );

    const result = await client(fetchFn).requestPlan(SCANNED_GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('graph-mismatch');
    expect(result.source).toBe('procedural');
    expect(result.apiErrorCode).toBeUndefined();
    expect(result.plan.start).toBe('s10');
    expect(result.plan.goal).toBe('s11');
    expect(result.plan.placements.every((p) => p.surface !== 's1')).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
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

  it('falls back on INVALID_REQUEST and records the code', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'INVALID_REQUEST',
              message: 'graph.nodes: too small',
              issues: [{ path: ['graph', 'nodes'], message: 'too small' }],
            },
          },
          400
        )
      )
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('api-error');
    expect(result.apiErrorCode).toBe('INVALID_REQUEST');
    expect(result.source).toBe('procedural');
    expect(result.plan.start).toBe('s1');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back on INTERNAL and records the code', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: { code: 'INTERNAL', message: 'director boom' },
          },
          500
        )
      )
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('api-error');
    expect(result.apiErrorCode).toBe('INTERNAL');
    expect(result.source).toBe('procedural');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back on a non-envelope HTTP error without throwing', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ oops: true }, 502))
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('http-error');
    expect(result.apiErrorCode).toBeUndefined();
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

  it('returns a valid plan for ?director=mock on a non-fixture graph', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(apiResponse({ plan: b02FixturePlan() })))
    );
    const result = await client(fetchFn, { directorMode: 'mock' }).requestPlan(
      SCANNED_GRAPH
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('director-mock');
    expect(result.source).toBe('procedural');
    expect(result.plan.start).toBe('s10');
    expect(result.plan.goal).toBe('s11');
    expect(schemaValidate(result.plan, SCANNED_GRAPH).ok).toBe(true);
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
    expect(store.state.error).toBeNull();
  });

  it('records a graph-mismatch fallback without entering error', () => {
    const store = createGameStore();
    store.requestLevel();
    store.startSurveying();

    applyDirectorResult(store, {
      plan: stubGenerate(SCANNED_GRAPH, 'seed', 'normal'),
      source: 'procedural',
      cacheKey: 'procedural:seed',
      promptVersion: 'local',
      latencyMs: 40,
      repairs: [],
      usedFallback: true,
      fallbackReason: 'graph-mismatch',
    });

    expect(store.phase).toBe('building');
    expect(store.planSource).toBe('procedural');
    expect(store.fallbackReason).toBe('graph-mismatch');
    expect(store.apiErrorCode).toBeNull();
    expect(store.state.error).toBeNull();
  });

  it('records INVALID_REQUEST on the store for debug', () => {
    const store = createGameStore();
    store.requestLevel();
    store.startSurveying();

    applyDirectorResult(store, {
      plan: localPlan(),
      source: 'procedural',
      cacheKey: 'procedural:seed',
      promptVersion: 'local',
      latencyMs: 12,
      repairs: [],
      usedFallback: true,
      fallbackReason: 'api-error',
      apiErrorCode: 'INVALID_REQUEST',
    });

    expect(store.phase).toBe('building');
    expect(store.apiErrorCode).toBe('INVALID_REQUEST');
    expect(store.fallbackReason).toBe('api-error');
    expect(store.state.error).toBeNull();
  });
});
