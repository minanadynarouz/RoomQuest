import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { validatePlan } from '@roomquest/level-core';
import { LevelPlan, LevelResponse, type LevelRequest } from '@roomquest/schema';
import { RateLimitedException } from '../common/rate-limited.exception';
import { DirectorService } from '../director/director.service';
import { DIRECTOR_RUNTIME, type DirectorRuntime } from '../director/models';
import { PROMPT_VERSION } from '../director/prompts';
import { makeCacheKey } from './cache-key';
import { CacheMissLimiter } from './cache-miss-limiter';
import { LevelCacheRepository } from './level-cache.repository';

@Injectable()
export class LevelsService {
  private readonly logger = new Logger(LevelsService.name);

  constructor(
    @Inject(DirectorService) private readonly director: DirectorService,
    @Inject(LevelCacheRepository)
    private readonly cache: LevelCacheRepository,
    @Inject(CacheMissLimiter) private readonly limiter: CacheMissLimiter,
    @Optional()
    @Inject(DIRECTOR_RUNTIME)
    private readonly runtime?: DirectorRuntime
  ) {}

  async create(
    request: LevelRequest,
    deviceId: string
  ): Promise<LevelResponse> {
    const now = this.runtime?.now ?? (() => Date.now());
    const startedMs = now();
    const promptVersion = PROMPT_VERSION;
    const cacheKey = makeCacheKey(
      request.graph.roomHash,
      request.date,
      request.tier,
      promptVersion
    );

    this.logger.debug(`Level request from device ${deviceId} key=${cacheKey}`);

    const cached = await this.cache.lookup(cacheKey);
    if (cached !== null) {
      const parsed = LevelPlan.safeParse(cached.plan);
      if (parsed.success) {
        const validation = validatePlan(parsed.data, request.graph);
        if (validation.ok) {
          return LevelResponse.parse({
            plan: parsed.data,
            source: 'cache',
            cacheKey,
            model: cached.model ?? undefined,
            promptVersion,
            latencyMs: Math.max(0, now() - startedMs),
            repairs: [],
          });
        }
        this.logger.debug(
          `Cached plan failed validatePlan for ${cacheKey}; treating as miss`
        );
      }
    }

    const budget = this.limiter.take(deviceId, now());
    if (!budget.ok) {
      throw new RateLimitedException(budget.retryAfterS);
    }

    const response = await this.director.plan(request);
    const body = LevelResponse.parse({
      ...response,
      cacheKey,
      latencyMs: Math.max(0, now() - startedMs),
    });

    if (body.fallbackReason !== 'llm-quota') {
      await this.cache.persist(
        {
          key: cacheKey,
          roomHash: request.graph.roomHash,
          date: request.date,
          tier: request.tier,
          promptVersion,
          plan: body.plan,
          source: body.source,
          model: body.model ?? null,
        },
        startedMs,
        now()
      );
    }

    return body;
  }
}
