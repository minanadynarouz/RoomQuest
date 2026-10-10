import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LevelResponse, type LevelRequest } from '@roomquest/schema';
import type { Env } from '../config/env';
import {
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
  wrapChatModel,
  type DirectorChatFactory,
  type DirectorRuntime,
} from './models';
import { PROMPT_VERSION } from './prompts';
import { LLM_DAILY_USAGE, type LlmDailyUsage } from './daily-usage';
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
    @Inject(LLM_DAILY_USAGE)
    private readonly dailyUsage?: LlmDailyUsage,
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
      return proceduralOutcome(request, startedMs, [], promptVersion, now);
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

    if (this.dailyUsage !== undefined) {
      const slot = await this.dailyUsage.consume();
      if (slot !== 'ok') {
        return proceduralOutcome(
          request,
          startedMs,
          [],
          promptVersion,
          now,
          'llm-quota'
        );
      }
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
}
