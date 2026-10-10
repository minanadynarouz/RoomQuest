/**
 * Director client tests - F-03
 * Mocked fetch for success, invalid-plan, timeout, and network-error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generatePlan } from '@roomquest/level-core';
import type { LevelPlan, LevelResponse, SurfaceGraph } from '@roomquest/schema';
import { createDirectorClient } from './client.js';
import { createDirectorClientFromEnv } from './factory.js';
import { applyDirectorResult } from './apply.js';
import {
  markHealthPrewarmStarted,
  resetHealthPrewarmForTests,
} from './health-prewarm.js';
import { createGameStore } from '../store.js';
import {
  createResultPoster,
  resolveLevelKey,
} from '../results/poster.js';
import { LEVELS_PATH } from './types.js';
import type { FetchLike, GenerateFn, KvStore, RepairFn } from './types.js';

/** Synthetic living-room graph — `validatePlan` accepts the fixture plan on this. */
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
      centroid: [0.0, 0.75, -1.0],
      size: [1.0, 0.6],
      yaw: 0.0,
      area: 0.6,
      reach: 'hand',
      angleFromForward: 0,
    },
    {
      id: 's2',
      label: 'couch',
      kind: 'mesh',
      topHeight: 0.45,
      centroid: [0.0, 0.45, -2.5],
      size: [2.0, 0.9],
      yaw: 0.0,
      area: 1.8,
      reach: 'ray',
      angleFromForward: 25,
    },
    {
      id: 's3',
      label: 'desk',
      kind: 'plane',
      topHeight: 0.5,
      centroid: [0.0, 0.5, 0.3],
      size: [1.2, 0.5],
      yaw: 3.14159,
      area: 0.6,
      reach: 'ray',
      angleFromForward: 35,
    },
    {
      id: 's4',
      label: 'table',
      kind: 'plane',
      topHeight: 0.6,
      centroid: [0.9, 0.6, -2.2],
      size: [0.4, 0.4],
      yaw: 0.0,
      area: 0.16,
      reach: 'hand',
      angleFromForward: 40,
    },
    {
      id: 's5',
      label: 'floor',
      kind: 'plane',
      topHeight: 0.0,
      centroid: [0.0, 0.0, -1.0],
      size: [4.0, 3.0],
      yaw: 0.0,
      area: 12.0,
      reach: 'hand',
      angleFromForward: 0,
    },
  ],
  edges: [
    { a: 's1', b: 's2', gap: 0.6, dh: -0.3, kind: 'plank' },
    { a: 's1', b: 's3', gap: 0.5, dh: -0.25, kind: 'plank' },
    { a: 's2', b: 's4', gap: 0.1, dh: 0.15, kind: 'adjacent' },
    { a: 's1', b: 's5', gap: 0.0, dh: -0.75, kind: 'ramp' },
    { a: 's3', b: 's5', gap: 0.0, dh: -0.5, kind: 'ramp' },
    { a: 's2', b: 's5', gap: 0.0, dh: -0.45, kind: 'adjacent' },
  ],
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
        piece: 'gem',
        surface: 's1',
        u: 0.2,
        v: 0.3,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p6',
        piece: 'gem',
        surface: 's2',
        u: 0.6,
        v: 0.7,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p7',
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
      { goal: 'Pull the lever to open the gate', uses: ['p4', 'p3'] },
      { goal: 'Reach the crystal shrine', uses: ['p7'] },
    ],
    dialogue: [{ trigger: 'intro', line: 'Help me reach it.' }],
  };
}

function localPlan(seed = 'f1a2b3c4d5e6-2026-10-09'): LevelPlan {
  return generatePlan(GRAPH, seed, 'normal');
}

function slimeOnFloor(plan: LevelPlan): LevelPlan {
  return {
    ...plan,
    placements: [
      ...plan.placements,
      {
        id: 'p-slime',
        piece: 'slime',
        surface: 's5',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
    ],
  };
}

function apiPlan(): LevelPlan {
  return {
    ...b02FixturePlan(),
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

function headerBag(
  headers: Record<string, string>
): { get(name: string): string | null } {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    get(name: string) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function jsonResponse(
  payload: unknown,
  status = 200,
  headers?: Record<string, string>
): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
    headers: headers ? headerBag(headers) : undefined,
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
    resetHealthPrewarmForTests();
  });

  function client(
    fetchFn: FetchLike,
    extra?: Partial<Parameters<typeof createDirectorClient>[0]>
  ) {
    return createDirectorClient({
      fetch: fetchFn,
      apiBaseUrl: 'http://localhost:3000',
      deviceId: '11111111-2222-4333-8444-555555555555',
      clientVersion: '0.1.0',
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
    expect(result.requestId).toBeUndefined();
  });

  it('stores X-Request-Id when the response header is readable', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(apiResponse(), 200, { 'X-Request-Id': 'req-readable' })
      )
    );
    const result = await client(fetchFn).requestPlan(GRAPH);
    expect(result.usedFallback).toBe(false);
    expect(result.requestId).toBe('req-readable');
  });

  it('leaves requestId undefined when X-Request-Id is not readable', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(apiResponse(), 200))
    );
    const result = await client(fetchFn).requestPlan(GRAPH);
    expect(result.requestId).toBeUndefined();
  });

  it('accepts a B-05 server plan for the posted graph snapshot and posts the result to the cacheKey', async () => {
    const live = JSON.parse(JSON.stringify(GRAPH)) as SurfaceGraph;
    const cacheKey = '0123456789abcdef';
    const fetchFn = vi.fn<FetchLike>((url, init) => {
      if (url.endsWith('/result')) {
        return Promise.resolve(jsonResponse({ stored: false }, 202));
      }
      const body = JSON.parse(init.body) as { graph: SurfaceGraph };
      live.nodes = SCANNED_GRAPH.nodes.map((node) => ({ ...node }));
      live.edges = SCANNED_GRAPH.edges.map((edge) => ({ ...edge }));
      live.roomHash = SCANNED_GRAPH.roomHash;
      const plan = generatePlan(
        body.graph,
        `${body.graph.roomHash}-2026-10-09`,
        'normal'
      );
      return Promise.resolve(
        jsonResponse({
          plan,
          source: 'procedural',
          cacheKey,
          promptVersion: 'v1',
          latencyMs: 18,
          repairs: [],
        })
      );
    });

    const result = await client(fetchFn).requestPlan(live);

    expect(result.usedFallback).toBe(false);
    expect(result.fallbackReason).toBeUndefined();
    expect(result.source).toBe('procedural');
    expect(result.cacheKey).toBe(cacheKey);
    expect(result.plan.start).toBe('s1');
    expect(live.nodes[0]?.id).toBe('s10');

    const store = createGameStore();
    store.requestLevel();
    store.startSurveying();
    applyDirectorResult(store, result);

    const deviceId = '11111111-2222-4333-8444-555555555555';
    const levelKey = resolveLevelKey({
      planSource: store.planSource,
      cacheKey: store.cacheKey,
      seed: store.plan?.seed,
      tier: store.tier,
    });
    expect(levelKey).toBe(cacheKey);
    expect(store.planSource).toBe('procedural');

    await createResultPoster({
      fetch: (input, init) =>
        fetchFn(input, { ...init, signal: new AbortController().signal }),
      apiBaseUrl: 'http://localhost:3000',
      deviceId,
    }).post({
      levelKey: cacheKey,
      deviceId,
      stars: 3,
      gems: 1,
      timeMs: 40_000,
      completed: true,
      planSource: store.planSource ?? 'procedural',
    });

    const resultUrl = fetchFn.mock.calls
      .map(([calledUrl]) => calledUrl)
      .find((calledUrl) =>
        calledUrl.includes(`${LEVELS_PATH}/${cacheKey}/result`)
      );
    expect(resultUrl).toBe(
      `http://localhost:3000${LEVELS_PATH}/${cacheKey}/result`
    );
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
    expect(
      result.issues?.some((issue) => issue.code === 'UNKNOWN_SURFACE')
    ).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('repairs a schema-valid API plan before falling back to generatePlan', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(apiResponse({ plan: slimeOnFloor(apiPlan()) }))
      )
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.source).toBe('llm_repaired');
    expect(result.fallbackReason).toBe('repaired');
    expect(result.usedFallback).toBe(true);
    expect(result.plan.placements.some((p) => p.id === 'p-slime')).toBe(false);
    expect(result.repairs.some((line) => line.includes('slime'))).toBe(true);
    expect(result.plan.start).toBe('s1');
    expect(result.cacheKey).toBe('abcd1234abcd1234');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back to generatePlan when repair cannot validate', async () => {
    const repair: RepairFn = (plan) => ({
      plan,
      repairs: ['gave up'],
      result: {
        ok: false,
        issues: [{ code: 'GOAL_UNREACHABLE', message: 'no path' }],
        relaxed: [],
      },
      relaxed: [],
    });
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(apiResponse({ plan: slimeOnFloor(apiPlan()) }))
      )
    );

    const result = await client(fetchFn, { repair }).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.source).toBe('procedural');
    expect(result.fallbackReason).toBe('graph-mismatch');
    expect(result.plan.placements.some((p) => p.surface === 's1')).toBe(true);
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

  function abortingFetch(): FetchLike {
    return (_url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
  }

  it('uses a one-time cold-start budget and records cold-start-timeout', async () => {
    const fetchFn = vi.fn<FetchLike>(abortingFetch());
    const director = client(fetchFn, {
      budgetMs: 20,
      coldStartBudgetMs: 40,
      isHealthPrewarmPending: () => true,
    });

    const first = await director.requestPlan(GRAPH);
    expect(first.usedFallback).toBe(true);
    expect(first.fallbackReason).toBe('cold-start-timeout');
    expect(first.source).toBe('procedural');

    const second = await director.requestPlan(GRAPH);
    expect(second.usedFallback).toBe(true);
    expect(second.fallbackReason).toBe('timeout');
    expect(second.source).toBe('procedural');
  });

  it('keeps the 8 s timeout when the health pre-warm has already answered', async () => {
    const result = await client(abortingFetch(), {
      budgetMs: 20,
      coldStartBudgetMs: 80,
      isHealthPrewarmPending: () => false,
    }).requestPlan(GRAPH);

    expect(result.fallbackReason).toBe('timeout');
    expect(result.source).toBe('procedural');
  });

  it('accepts a late API plan within the cold-start budget', async () => {
    const fetchFn = vi.fn<FetchLike>(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(jsonResponse(apiResponse()));
          }, 30);
        })
    );

    const result = await client(fetchFn, {
      budgetMs: 15,
      coldStartBudgetMs: 80,
      isHealthPrewarmPending: () => true,
    }).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(false);
    expect(result.source).toBe('llm');
    expect(result.plan.title).toBe('API Quest');
  });

  it('extends the first /levels timeout while landing pre-warm is pending', async () => {
    markHealthPrewarmStarted();
    const result = await client(abortingFetch(), {
      budgetMs: 20,
      coldStartBudgetMs: 40,
    }).requestPlan(GRAPH);

    expect(result.fallbackReason).toBe('cold-start-timeout');
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

  it('reports room-unplayable when the API returns 422 ROOM_UNPLAYABLE', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'ROOM_UNPLAYABLE',
              message: 'Room cannot produce a valid plan even with relaxed rules',
            },
          },
          422
        )
      )
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('room-unplayable');
    expect(result.apiErrorCode).toBe('ROOM_UNPLAYABLE');
    expect(result.source).toBe('procedural');
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

  it('falls back silently on 429 with the RATE_LIMITED envelope', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'per-device cache-miss budget exceeded',
              issues: [{ path: [], message: 'RATE_LIMITED' }],
              retryAfterS: 3600,
            },
          },
          429
        )
      )
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('rate-limited');
    expect(result.retryAfterS).toBe(3600);
    expect(result.requestId).toBeUndefined();
    expect(result.apiErrorCode).toBe('RATE_LIMITED');
    expect(result.source).toBe('procedural');
    expect(result.plan.start).toBe('s1');
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
  });

  it('prefers a readable Retry-After header over the 429 body', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'slow',
              retryAfterS: 3600,
            },
          },
          429,
          { 'Retry-After': '45', 'X-Request-Id': 'req-429' }
        )
      )
    );
    const result = await client(fetchFn).requestPlan(GRAPH);
    expect(result.fallbackReason).toBe('rate-limited');
    expect(result.retryAfterS).toBe(45);
    expect(result.requestId).toBe('req-429');
  });

  it('falls back silently on 429 with only retryAfterS', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ retryAfterS: 90 }, 429))
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('rate-limited');
    expect(result.retryAfterS).toBe(90);
    expect(result.apiErrorCode).toBeUndefined();
    expect(result.source).toBe('procedural');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back silently on 429 with an unparseable body', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      })
    );

    const result = await client(fetchFn).requestPlan(GRAPH);

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('rate-limited');
    expect(result.retryAfterS).toBeUndefined();
    expect(result.apiErrorCode).toBeUndefined();
    expect(result.source).toBe('procedural');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('skips later live POSTs until retryAfterS expires on the injected clock', async () => {
    let now = 1_000;
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse({ retryAfterS: 60 }, 429))
    );
    const director = client(fetchFn, { nowMs: () => now });

    const first = await director.requestPlan(GRAPH);
    expect(first.fallbackReason).toBe('rate-limited');
    expect(first.retryAfterS).toBe(60);
    expect(fetchFn).toHaveBeenCalledOnce();

    now = 31_000;
    const skipped = await director.requestPlan(GRAPH);
    expect(skipped.fallbackReason).toBe('rate-limited');
    expect(skipped.retryAfterS).toBe(30);
    expect(skipped.source).toBe('procedural');
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(console.warn).not.toHaveBeenCalled();

    now = 61_000;
    fetchFn.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(apiResponse()))
    );
    const afterExpiry = await director.requestPlan(GRAPH);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(afterExpiry.usedFallback).toBe(false);
    expect(afterExpiry.source).toBe('llm');
  });

  it('starts the generator in parallel with the POST', async () => {
    let generateCalls = 0;
    const slowFetch: FetchLike = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return jsonResponse(apiResponse());
    };
    const racingGenerate: GenerateFn = (graph, seed, tier, options) => {
      generateCalls += 1;
      return generatePlan(graph, seed, tier, options);
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
    const ids = new Set(SCANNED_GRAPH.nodes.map((node) => node.id));
    expect(ids.has(result.plan.start)).toBe(true);
    expect(ids.has(result.plan.goal)).toBe(true);
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

  it('is deterministic for the same graph, seed and tier', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.reject(new Error('offline'))
    );
    const extra = {
      directorMode: 'off' as const,
      seed: 'det-seed',
      tier: 'easy' as const,
    };

    const a = await client(fetchFn, extra).requestPlan(GRAPH);
    const b = await client(fetchFn, extra).requestPlan(GRAPH);

    expect(a.plan).toEqual(b.plan);
    expect(a.plan).toEqual(generatePlan(GRAPH, 'det-seed', 'easy'));
    expect(a.source).toBe('procedural');
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
    expect(store.plan?.seed).toBe('f1a2b3c4d5e6-2026-10-09');
    expect(store.state.error).toBeNull();
  });

  it('records a graph-mismatch fallback without entering error', () => {
    const store = createGameStore();
    store.requestLevel();
    store.startSurveying();

    applyDirectorResult(store, {
      plan: generatePlan(SCANNED_GRAPH, 'seed', 'normal'),
      source: 'procedural',
      cacheKey: 'procedural:seed',
      promptVersion: 'local',
      latencyMs: 40,
      repairs: [],
      usedFallback: true,
      fallbackReason: 'graph-mismatch',
      issues: [
        {
          code: 'UNKNOWN_SURFACE',
          message: 'start surface "s1" is not in the graph',
          surfaceId: 's1',
        },
      ],
    });

    expect(store.phase).toBe('building');
    expect(store.planSource).toBe('procedural');
    expect(store.fallbackReason).toBe('graph-mismatch');
    expect(store.apiErrorCode).toBeNull();
    expect(store.validationIssues[0]?.code).toBe('UNKNOWN_SURFACE');
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

  it('records a rate-limited fallback without entering error', () => {
    const store = createGameStore();
    store.requestLevel();
    store.startSurveying();

    applyDirectorResult(store, {
      plan: localPlan(),
      source: 'procedural',
      cacheKey: 'procedural:seed',
      promptVersion: 'local',
      latencyMs: 8,
      repairs: [],
      usedFallback: true,
      fallbackReason: 'rate-limited',
      apiErrorCode: 'RATE_LIMITED',
      retryAfterS: 3600,
    });

    expect(store.phase).toBe('building');
    expect(store.fallbackReason).toBe('rate-limited');
    expect(store.retryAfterS).toBe(3600);
    expect(store.apiErrorCode).toBe('RATE_LIMITED');
    expect(store.state.error).toBeNull();
  });
});
