import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SYNTHETIC_LIVING_ROOM_PLAN } from '@roomquest/fixtures';
import { LevelPlan, LevelResponse, type LevelRequest } from '@roomquest/schema';
import type { Env } from '../config/env';
import { makeCacheKey } from '../levels/cache-key';
import {
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
  wrapChatModel,
  type DirectorChatFactory,
  type DirectorRuntime,
} from './models';
import { PROMPT_VERSION } from './prompts';
import { LLM_QUOTA_BREAKER, type LlmQuotaBreaker } from './quota-breaker';
import {
  proceduralOutcome,
  runDirector,
  type DirectorOutcome,
} from './run-director';

@Injectable()
export class DirectorService {
  private readonly logger = new Logger(DirectorService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(DIRECTOR_CHAT_FACTORY)
    private readonly factory: DirectorChatFactory,
    @Optional()
    @Inject(LLM_QUOTA_BREAKER)
    private readonly quotaBreaker?: LlmQuotaBreaker,
    @Optional()
    @Inject(DIRECTOR_RUNTIME)
    private readonly runtime?: DirectorRuntime
  ) {}

  async plan(request: LevelRequest): Promise<LevelResponse> {
    const outcome = await this.run(request);
    return outcome.response;
  }

  async run(request: LevelRequest): Promise<DirectorOutcome> {
    const now = this.runtime?.now ?? (() => Date.now());
    const startedMs = now();
    const mode = this.config.get('DIRECTOR_MODE', { infer: true });
    const promptVersion = PROMPT_VERSION;

    if (mode === 'mock') {
      return this.mockOutcome(request, startedMs, promptVersion, now);
    }

    const googleKey = this.config.get('GOOGLE_API_KEY', { infer: true });
    if (googleKey === undefined || googleKey.length === 0) {
      this.logger.warn(
        'DIRECTOR_MODE=live but GOOGLE_API_KEY is unset; falling back to a procedural plan'
      );
      return proceduralOutcome(request, startedMs, [], promptVersion, now);
    }

    if (this.quotaBreaker?.isOpen()) {
      return proceduralOutcome(
        request,
        startedMs,
        [],
        promptVersion,
        now,
        'llm-quota'
      );
    }

    const directorModel = this.config.get('DIRECTOR_MODEL', { infer: true });

    const primary = wrapChatModel(
      this.factory.createPrimary({
        model: directorModel,
        apiKey: googleKey,
      }),
      'google',
      directorModel
    );

    return runDirector(request, {
      primary,
      promptVersion,
      logger: this.logger,
      budgetMs: this.runtime?.budgetMs,
      llmRepairMinRemainingMs: this.runtime?.llmRepairMinRemainingMs,
      proceduralReserveMs: this.runtime?.proceduralReserveMs,
      now,
      startedMs,
      quotaBreaker: this.quotaBreaker,
    });
  }

  private mockOutcome(
    request: LevelRequest,
    startedMs: number,
    promptVersion: string,
    now: () => number
  ): DirectorOutcome {
    const plan = LevelPlan.parse(SYNTHETIC_LIVING_ROOM_PLAN);
    return {
      response: LevelResponse.parse({
        plan,
        source: 'procedural',
        cacheKey: makeCacheKey(
          request.graph.roomHash,
          request.date,
          request.tier,
          promptVersion
        ),
        promptVersion,
        latencyMs: Math.max(0, now() - startedMs),
        repairs: [],
      }),
      telemetry: [],
    };
  }
}
