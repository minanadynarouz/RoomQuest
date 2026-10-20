import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { candidateRoutes } from '@roomquest/level-core';
import { LevelRequest } from '@roomquest/schema';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { claimFirstQuery, dbStageKey } from '../common/first-query';
import type { Env } from '../config/env';
import { validateEnv } from '../config/env';
import { makeDailySeed } from '../levels/daily-seed';
import { PrismaService } from '../prisma/prisma.service';
import { decorationEnums } from './prompts/decoration';
import { routeCallOptions } from './route-arm';
import { runDirector } from './run-director';
import type { StructuredChat } from './structured-chat';
import { settleWithDirectorFakeTime, useDirectorFakeTimers } from './test-clock';
import { mockDecorationJson } from './test-fakes';
import { warmUpGemini, warmupBlockedReason, warmupEnabled } from './warmup';

const logger = () => {
  const lines: string[] = [];
  return {
    lines,
    log: (m: string) => lines.push(m),
    warn: (m: string) => lines.push(m),
    debug: () => undefined,
  };
};
const LIVE_ENV = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

describe('DIRECTOR_WARMUP models.get', () => {
  it('resolves on by default only for live + key; explicit off wins', () => {
    expect(warmupEnabled(undefined, 'live', 'k')).toBe(true);
    expect(warmupEnabled(undefined, 'mock', 'k')).toBe(false);
    expect(warmupEnabled(undefined, 'live', undefined)).toBe(false);
    expect(warmupEnabled(false, 'live', 'k')).toBe(false);
    expect(warmupEnabled(true, 'mock', 'k')).toBe(false);
    expect(validateEnv({ DIRECTOR_WARMUP: 'off' }).DIRECTOR_WARMUP).toBe(false);
    expect(validateEnv({}).DIRECTOR_WARMUP).toBeUndefined();
  });

  it('never runs in tests, CI or with dummy keys', async () => {
    expect(warmupBlockedReason('real-key', process.env)).toBe('test');
    expect(warmupBlockedReason('real-key', { CI: 'true' })).toBe('ci');
    expect(warmupBlockedReason('test-key', {})).toBe('dummy-key');
    const fetchImpl = vi.fn();
    const log = logger();
    await expect(
      warmUpGemini({ model: 'm', apiKey: 'real-key', logger: log, fetchImpl })
    ).resolves.toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log.lines).toEqual(['director.warmup skipped reason=test']);
  });

  it('issues one GET models/{model} with the API key header (mocked fetch)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('{"name":"models/gemini-3.8-flash"}', { status: 200 }))
    );
    const log = logger();
    const out = await warmUpGemini({
      model: 'gemini-3.8-flash',
      apiKey: 'real-key',
      logger: log,
      fetchImpl: fetchImpl,
      env: LIVE_ENV,
    });
    expect(out).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('real-key');
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatch(/^director\.warmup ok/);
  });

  it('swallows HTTP and network errors with a single log line', async () => {
    for (const fetchImpl of [
      () => Promise.resolve(new Response('no', { status: 403 })),
      () => Promise.reject(new TypeError('fetch failed')),
    ]) {
      const log = logger();
      await expect(
        warmUpGemini({
          model: 'm',
          apiKey: 'real-key',
          logger: log,
          fetchImpl: fetchImpl,
          env: LIVE_ENV,
        })
      ).resolves.toBe('failed');
      expect(log.lines).toHaveLength(1);
      expect(log.lines[0]).toMatch(/^director\.warmup failed/);
    }
  });
});

describe('Prisma boot warm-up and first-query split', () => {
  function prismaWith(client: unknown): PrismaService {
    const config = { get: () => undefined } as unknown as ConfigService<Env, true>;
    const service = new PrismaService(config);
    (service as unknown as { client: unknown }).client = client;
    return service;
  }

  it('SELECT 1 once, claims the first query, never throws', async () => {
    const query = vi.fn(() => Promise.resolve([{ '?column?': 1 }]));
    const service = prismaWith({ $queryRawUnsafe: query });
    await expect(service.warmConnection()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(service.claimFirstQuery()).toBe(false);

    const failing = prismaWith({
      $queryRawUnsafe: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    await expect(failing.warmConnection()).resolves.toBe(false);
  });

  it('labels only the first DB query as cold', () => {
    const service = prismaWith(null);
    expect(dbStageKey('cacheLookup', claimFirstQuery(service))).toBe('cacheLookupColdMs');
    expect(dbStageKey('dailyReserve', claimFirstQuery(service))).toBe('dailyReserveMs');
    expect(claimFirstQuery({})).toBe(false);
  });

  it('does not warm up under test', () => {
    const query = vi.fn();
    prismaWith({ $queryRawUnsafe: query }).onApplicationBootstrap();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('route schema memoization', () => {
  it('returns the identical schema object for the same enum set', () => {
    const graph = IWER_GRAPHS[IWER_ROOM_IDS[0]];
    const enums = decorationEnums(candidateRoutes(graph, { seed: 'memo', tier: 'easy' }));
    const a = routeCallOptions(enums);
    const b = routeCallOptions({ ...enums, routeIds: [...enums.routeIds].reverse() });
    expect(a.responseSchema).toBe(b.responseSchema);
    expect(a.schemaKey).toBe(b.schemaKey);
  });
});

describe('daily reserve overlaps prompt prep (fake timers)', () => {
  useDirectorFakeTimers();

  it('the gate is awaited right before the model call; precall log + telemetry breakdown', async () => {
    const request = LevelRequest.parse({
      graph: IWER_GRAPHS[IWER_ROOM_IDS[0]],
      date: '2026-10-14',
      tier: 'easy',
    });
    const seed = makeDailySeed(request.graph.roomHash, request.date);
    const answer = JSON.parse(
      mockDecorationJson(candidateRoutes(request.graph, { seed, tier: 'easy' }))
    ) as unknown;
    let invokedAt = -1;
    const chat: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: () => {
        invokedAt = Date.now();
        return Promise.resolve({ parsed: answer });
      },
    };
    const preCall: Record<string, number> = { cacheLookupMs: 12 };
    const gate = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        preCall.dailyReserveMs = 400;
        resolve(true);
      }, 400);
    });
    const log = logger();
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: chat,
        placement: 'route',
        logger: log,
        llmGate: gate,
        preCall,
      })
    );
    expect(invokedAt).toBe(400);
    expect(outcome.response.source).toBe('llm');
    expect(outcome.preCall).toMatchObject({ cacheLookupMs: 12, dailyReserveMs: 400 });
    for (const key of ['candidateRoutesMs', 'schemaMs', 'promptMs', 'llmGateWaitMs', 'totalMs']) {
      expect(outcome.preCall).toHaveProperty(key);
    }
    expect(outcome.telemetry[0]?.preCallMs).toEqual(outcome.preCall);
    const line = log.lines.find((l) => l.startsWith('director.precall'));
    expect(line).toContain('cacheLookupMs=12');
    expect(line).toContain('dailyReserveMs=400');
    expect(line).toContain('totalMs=400');
  });

  it('a capped reservation → procedural llm-quota, no model call', async () => {
    const request = LevelRequest.parse({
      graph: IWER_GRAPHS[IWER_ROOM_IDS[0]],
      date: '2026-10-14',
      tier: 'easy',
    });
    const invoke = vi.fn();
    const outcome = await settleWithDirectorFakeTime(
      runDirector(request, {
        primary: { provider: 'google', model: 'm', invokeStructured: invoke },
        placement: 'route',
        logger: logger(),
        llmGate: Promise.resolve(false),
      })
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(outcome.response.fallbackReason).toBe('llm-quota');
    expect(outcome.failedAt).toBe('quota-precheck');
  });
});
