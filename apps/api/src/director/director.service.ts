import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hintedSlotIds } from '@roomquest/level-core';
import {
  LevelPlanLLMGeminiSchema,
  levelPlanSlotLLMGeminiSchema,
  type LevelRequest,
  type LevelResponse,
} from '@roomquest/schema';
import type { Env } from '../config/env';
import { makeDailySeed } from '../levels/daily-seed';
import {
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
  wrapChatModel,
  type DirectorChatFactory,
  type DirectorRuntime,
} from './models';
import { resolveDirectorPlacement } from './placement';
import { promptVersionFor } from './prompts';
import { LLM_QUOTA_BREAKER, type LlmQuotaBreaker } from './quota-breaker';
import {
  proceduralOutcome,
  runDirector,
  type DirectorOutcome,
} from './run-director';
import { resolveDirectorThinkingId, thinkingConfigForId } from './thinking';

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
    const placement = resolveDirectorPlacement(
      this.config.get('DIRECTOR_PLACEMENT', { infer: true })
    );
    const promptVersion = promptVersionFor(placement);

    if (mode === 'mock') {
      return proceduralOutcome(request, startedMs, [], promptVersion, now);
    }

    const googleKey = this.config.get('GOOGLE_API_KEY', { infer: true });
    if (googleKey === undefined || googleKey.length === 0) {
      this.logger.warn(
        'DIRECTOR_MODE=live but GOOGLE_API_KEY is unset; falling back to a procedural plan'
      );
      return proceduralOutcome(
        request,
        startedMs,
        [],
        promptVersion,
        now,
        'llm-error',
        'draft'
      );
    }

    if (this.quotaBreaker?.isOpen()) {
      return proceduralOutcome(
        request,
        startedMs,
        [],
        promptVersion,
        now,
        'llm-quota',
        'quota'
      );
    }

    const directorModel = this.config.get('DIRECTOR_MODEL', { infer: true });
    const thinking = thinkingConfigForId(
      resolveDirectorThinkingId(
        this.config.get('DIRECTOR_THINKING', { infer: true })
      )
    );
    const seed = makeDailySeed(request.graph.roomHash, request.date);
    const schema =
      placement === 'slot'
        ? levelPlanSlotLLMGeminiSchema(
            hintedSlotIds(request.graph, { seed })
          )
        : LevelPlanLLMGeminiSchema;

    const primary = wrapChatModel(
      this.factory.createPrimary({
        model: directorModel,
        apiKey: googleKey,
        thinking,
      }),
      'google',
      directorModel,
      schema
    );

    return runDirector(request, {
      primary,
      promptVersion,
      logger: this.logger,
      budgetMs: this.runtime?.budgetMs,
      llmRepairMinRemainingMs:
        this.runtime?.llmRepairMinRemainingMs ??
        this.config.get('LLM_REPAIR_MIN_REMAINING_MS', { infer: true }),
      proceduralReserveMs: this.runtime?.proceduralReserveMs,
      now,
      startedMs,
      quotaBreaker: this.quotaBreaker,
      placement,
    });
  }
}
