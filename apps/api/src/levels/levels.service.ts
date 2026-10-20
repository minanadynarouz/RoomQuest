import { performance } from 'node:perf_hooks';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { validatePlan } from '@roomquest/level-core';
import { LevelPlan, LevelResponse, type LevelRequest } from '@roomquest/schema';
import { RateLimitedException } from '../common/rate-limited.exception';
import { RoomUnplayableException } from '../common/room-unplayable.exception';
import { DirectorService } from '../director/director.service';
import { DIRECTOR_RUNTIME, type DirectorRuntime } from '../director/models';
import { PROMPT_VERSION } from '../director/prompts';
import { claimFirstQuery, dbStageKey, roundMs } from '../common/first-query';
import { makeCacheKey } from './cache-key';
import { CacheMissLimiter } from './cache-miss-limiter';
import { LevelCacheRepository } from './level-cache.repository';
import {
  cacheMetadataFromRelaxed,
  linesFromCacheMetadata,
  routeIdFromCacheMetadata,
} from './relaxed-metadata';

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

    // Pre-call breakdown starts here. The daily-counter reserve is NOT run
    // in parallel with this lookup: on a hit it would burn an LLM_DAILY_MAX
    // slot for nothing. It overlaps the director's prompt prep instead.
    const preCall: Record<string, number> = {};
    const lookupCold = claimFirstQuery(this.cache);
    const lookupStarted = performance.now();
    const cached = await this.cache.lookup(cacheKey);
    preCall[dbStageKey('cacheLookup', lookupCold)] = roundMs(
      performance.now() - lookupStarted
    );
    if (cached !== null) {
      const parsed = LevelPlan.safeParse(cached.plan);
      if (parsed.success) {
        const validation = validatePlan(parsed.data, request.graph);
        if (validation.ok) {
          const routeId = routeIdFromCacheMetadata(cached.metadata);
          const lines = linesFromCacheMetadata(cached.metadata);
          return LevelResponse.parse({
            ...(routeId === undefined ? {} : { routeId }),
            ...(lines === undefined ? {} : { lines }),
            plan: parsed.data,
            source: 'cache',
            cacheKey,
            model: cached.model ?? undefined,
            promptVersion,
            latencyMs: Math.max(0, now() - startedMs),
            repairs: [],
            relaxed: validation.relaxed,
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

    const response = await this.director.plan(request, preCall);
    const validation = validatePlan(response.plan, request.graph);
    if (!validation.ok) {
      throw new RoomUnplayableException();
    }
    const body = LevelResponse.parse({
      ...response,
      cacheKey,
      latencyMs: Math.max(0, now() - startedMs),
      relaxed: validation.relaxed,
    });

    if (!isTransientLlmFallback(body.fallbackReason)) {
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
          metadata: cacheMetadataFromRelaxed(
            body.relaxed ?? [],
            body.routeId,
            body.lines
          ),
        },
        startedMs,
        now()
      );
    }

    return body;
  }
}

/** Transient LLM failures: never cache the procedural fallback so the next request can retry the LLM. */
const TRANSIENT_LLM_FALLBACKS: ReadonlySet<string> = new Set([
  'llm-quota',
  'llm-timeout',
  'llm-error',
]);

function isTransientLlmFallback(reason: string | undefined): boolean {
  return reason !== undefined && TRANSIENT_LLM_FALLBACKS.has(reason);
}
