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
import { PROMPT_VERSION } from '../director/prompts';
import { makeCacheKey } from './cache-key';
import { CacheMissLimiter } from './cache-miss-limiter';
import { makeDailySeed } from './daily-seed';
import {
  LevelCacheRepository,
  type LevelCacheRow,
} from './level-cache.repository';
import { LevelsService } from './levels.service';

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

function directorResponse(
  plan: LevelPlan,
  source: 'procedural' | 'llm' = 'procedural'
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
  });
}

async function serviceWith(options: {
  cached: LevelCacheRow | null;
  plan?: LevelPlan;
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
      {
        provide: DirectorService,
        useValue: { plan: directorPlan },
      },
      {
        provide: LevelCacheRepository,
        useValue: {
          lookup: vi.fn(() => Promise.resolve(options.cached)),
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
      cached: {
        key: 'k',
        roomHash: request.graph.roomHash,
        date: request.date,
        tier: request.tier,
        promptVersion: PROMPT_VERSION,
        plan: validPlan,
        source: 'procedural',
        model: null,
      },
    });
    const response = await service.create(request, 'device-1');
    expect(response.source).toBe('cache');
    expect(directorPlan).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('treats a cached plan that fails validatePlan as a miss and overwrites', async () => {
    const { service, persist, directorPlan } = await serviceWith({
      cached: {
        key: 'k',
        roomHash: request.graph.roomHash,
        date: request.date,
        tier: request.tier,
        promptVersion: PROMPT_VERSION,
        plan: SYNTHETIC_LIVING_ROOM_PLAN,
        source: 'procedural',
        model: null,
      },
      plan: validPlan,
    });
    const changedGraph = LevelRequest.parse({
      ...request,
      graph: {
        ...SYNTHETIC_LIVING_ROOM,
        nodes: SYNTHETIC_LIVING_ROOM.nodes.map((node) => ({
          ...node,
          label: 'floor' as const,
          topHeight: 0,
          area: 0.05,
          size: [0.2, 0.2] as [number, number],
        })),
      },
    });
    const response = await service.create(changedGraph, 'device-1');
    expect(response.source).not.toBe('cache');
    expect(directorPlan).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('returns 429 on the 11th cache miss for one device', async () => {
    const persist = vi.fn(() => Promise.resolve(undefined));
    const directorPlan = vi.fn(() => Promise.resolve(directorResponse(validPlan)));
    const moduleRef = await Test.createTestingModule({
      providers: [
        LevelsService,
        CacheMissLimiter,
        { provide: DirectorService, useValue: { plan: directorPlan } },
        {
          provide: LevelCacheRepository,
          useValue: { lookup: vi.fn(() => Promise.resolve(null)), persist },
        },
      ],
    }).compile();
    const service = moduleRef.get(LevelsService);
    for (let i = 0; i < 10; i += 1) {
      await service.create(request, 'device-limit');
    }
    await expect(service.create(request, 'device-limit')).rejects.toBeInstanceOf(
      RateLimitedException
    );
  });
});
