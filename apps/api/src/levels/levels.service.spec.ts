import { Test } from '@nestjs/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { generatePlan } from '@roomquest/level-core';
import { LevelRequest, LevelResponse, type LevelPlan } from '@roomquest/schema';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitedException } from '../common/rate-limited.exception';
import { DirectorService } from '../director/director.service';
import { DIRECTOR_RUNTIME } from '../director/models';
import { PROMPT_VERSION } from '../director/prompts';
import { makeCacheKey } from './cache-key';
import { CacheMissLimiter } from './cache-miss-limiter';
import { makeDailySeed } from './daily-seed';
import {
  LevelCacheRepository,
  type LevelCacheRow,
} from './level-cache.repository';
import { LevelsService } from './levels.service';
import { CACHE_MISS_LIMIT, CACHE_MISS_WINDOW_MS } from './rate-limit.constants';

const request = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-12-01',
  tier: 'easy',
});

const validPlan = generatePlan(
  SYNTHETIC_LIVING_ROOM,
  makeDailySeed(SYNTHETIC_LIVING_ROOM.roomHash, request.date),
  'easy'
);

const WARM_HIT_LOOKUP_MS = 12;

function directorResponse(
  plan: LevelPlan,
  source: 'procedural' | 'llm' = 'procedural',
  fallbackReason?: 'llm-quota'
): LevelResponse {
  return LevelResponse.parse({
    plan,
    source,
    cacheKey: makeCacheKey(
      request.graph.roomHash,
      request.date,
      request.tier,
      PROMPT_VERSION
    ),
    promptVersion: PROMPT_VERSION,
    latencyMs: 12,
    repairs: [],
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
  });
}

function cachedRow(plan: LevelPlan): LevelCacheRow {
  return {
    key: 'k',
    roomHash: request.graph.roomHash,
    date: request.date,
    tier: request.tier,
    promptVersion: PROMPT_VERSION,
    plan,
    source: 'procedural',
    model: null,
  };
}

async function serviceWith(options: {
  cached: LevelCacheRow | null;
  plan?: LevelPlan;
  now?: () => number;
  lookup?: () => Promise<LevelCacheRow | null>;
}): Promise<{
  service: LevelsService;
  persist: ReturnType<typeof vi.fn>;
  directorPlan: ReturnType<typeof vi.fn>;
}> {
  const persist = vi.fn(() => Promise.resolve(undefined));
  const directorPlan = vi.fn(() =>
    Promise.resolve(directorResponse(options.plan ?? validPlan))
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      LevelsService,
      CacheMissLimiter,
      { provide: DIRECTOR_RUNTIME, useValue: { now: options.now } },
      {
        provide: DirectorService,
        useValue: { plan: directorPlan },
      },
      {
        provide: LevelCacheRepository,
        useValue: {
          lookup:
            options.lookup ?? vi.fn(() => Promise.resolve(options.cached)),
          persist,
        },
      },
    ],
  }).compile();
  return {
    service: moduleRef.get(LevelsService),
    persist,
    directorPlan,
  };
}

describe('LevelsService cache + limiter', () => {
  it('returns source cache on a valid hit without calling the director', async () => {
    const { service, persist, directorPlan } = await serviceWith({
      cached: cachedRow(validPlan),
    });
    const response = await service.create(request, 'device-1');
    expect(response.source).toBe('cache');
    expect(directorPlan).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('warm cache hit latencyMs is lookup time (injected now, under 300 ms)', async () => {
    let nowMs = 0;
    const { service, directorPlan } = await serviceWith({
      cached: cachedRow(validPlan),
      now: () => nowMs,
      lookup: () => {
        nowMs = WARM_HIT_LOOKUP_MS;
        return Promise.resolve(cachedRow(validPlan));
      },
    });
    const response = await service.create(request, 'device-1');
    expect(response.source).toBe('cache');
    expect(directorPlan).not.toHaveBeenCalled();
    expect(response.latencyMs).toBe(WARM_HIT_LOOKUP_MS);
    expect(response.latencyMs).toBeLessThan(300);
  });

  it('treats a cached plan that fails validatePlan as a miss and overwrites', async () => {
    const stale: LevelPlan = {
      ...SYNTHETIC_LIVING_ROOM_PLAN,
      start: 'missing-start',
      goal: 'missing-goal',
      placements: SYNTHETIC_LIVING_ROOM_PLAN.placements.map((placement) => ({
        ...placement,
        surface: `gone-${placement.surface}`,
      })),
    };
    const { service, persist, directorPlan } = await serviceWith({
      cached: cachedRow(stale),
      plan: validPlan,
    });
    const response = await service.create(request, 'device-1');
    expect(response.source).not.toBe('cache');
    expect(directorPlan).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('returns 429 with retryAfterS on the 11th miss, then allows after the hour', async () => {
    let nowMs = 0;
    const persist = vi.fn(() => Promise.resolve(undefined));
    const directorPlan = vi.fn(() =>
      Promise.resolve(directorResponse(validPlan))
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        LevelsService,
        CacheMissLimiter,
        { provide: DIRECTOR_RUNTIME, useValue: { now: () => nowMs } },
        { provide: DirectorService, useValue: { plan: directorPlan } },
        {
          provide: LevelCacheRepository,
          useValue: { lookup: vi.fn(() => Promise.resolve(null)), persist },
        },
      ],
    }).compile();
    const service = moduleRef.get(LevelsService);
    for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
      await service.create(request, 'device-limit');
    }
    const blocked = await service.create(request, 'device-limit').then(
      () => null,
      (error: unknown) => error
    );
    expect(blocked).toBeInstanceOf(RateLimitedException);
    expect((blocked as RateLimitedException).retryAfterS).toBe(3600);

    nowMs += CACHE_MISS_WINDOW_MS;
    const afterWindow = await service.create(request, 'device-limit');
    expect(afterWindow.source).not.toBe('cache');
  });

  it('does not cache a procedural llm-quota fallback under the LLM key', async () => {
    const persist = vi.fn(() => Promise.resolve(undefined));
    const directorPlan = vi.fn(() =>
      Promise.resolve(directorResponse(validPlan, 'procedural', 'llm-quota'))
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        LevelsService,
        CacheMissLimiter,
        { provide: DirectorService, useValue: { plan: directorPlan } },
        {
          provide: LevelCacheRepository,
          useValue: {
            lookup: vi.fn(() => Promise.resolve(null)),
            persist,
          },
        },
      ],
    }).compile();
    const service = moduleRef.get(LevelsService);
    const response = await service.create(request, 'device-quota');
    expect(response.source).toBe('procedural');
    expect(response.fallbackReason).toBe('llm-quota');
    expect(directorPlan).toHaveBeenCalledOnce();
    expect(persist).not.toHaveBeenCalled();
  });
});
