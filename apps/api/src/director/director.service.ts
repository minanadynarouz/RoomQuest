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
import type { DirectorFailurePoint } from './issue-trace';
import { HEDGE_DAILY_CAP_FRACTION, type HedgeReserveResult } from './hedge';
import {
  resolveDecorationThinkingId,
  resolveDirectorThinkingId,
  thinkingConfigForId,
  thinkingConfigWithFallback,
  thinkingFallbackLevels,
} from './thinking';

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

  /**
   * Reserve one LLM_DAILY_MAX slot for the route-arm hedge call. Skips when
   * the day's usage is already at >= 80 % of the cap (hedges are optional).
   */
  async reserveHedgeSlot(): Promise<HedgeReserveResult> {
    if (this.dailyUsage === undefined) {
      return { ok: true };
    }
    const snap = await this.dailyUsage.snapshot();
    if (snap.failClosed) {
      return { ok: false, reason: 'usage-unavailable' };
    }
    if (snap.used >= HEDGE_DAILY_CAP_FRACTION * snap.max) {
      return { ok: false, reason: 'near-daily-cap' };
    }
    const slot = await this.dailyUsage.consume();
    if (slot === 'ok') return { ok: true };
    return {
      ok: false,
      reason: slot === 'capped' ? 'daily-capped' : 'usage-unavailable',
    };
  }

  async plan(request: LevelRequest): Promise<LevelResponse> {
    const outcome = await this.run(request);
    return outcome.response;
  }

  async run(request: LevelRequest): Promise<DirectorOutcome> {
    const now = this.runtime?.now ?? (() => Date.now());
    const startedMs = now();
    const mode = this.config.get('DIRECTOR_MODE', { infer: true });
    const promptVersion = PROMPT_VERSION;

    const procedural = (
      reason: 'director-mock' | 'llm-unconfigured' | 'llm-quota',
      failedAt: DirectorFailurePoint
    ): DirectorOutcome => ({
      ...proceduralOutcome(request, startedMs, [], promptVersion, now, reason),
      failedAt,
    });

    if (mode === 'mock') {
      return procedural('director-mock', 'mode');
    }

    const googleKey = this.config.get('GOOGLE_API_KEY', { infer: true });
    if (googleKey === undefined || googleKey.length === 0) {
      this.logger.warn(
        'DIRECTOR_MODE=live but GOOGLE_API_KEY is unset; falling back to a procedural plan'
      );
      return procedural('llm-unconfigured', 'mode');
    }

    if (this.quotaBreaker?.isOpen()) {
      return procedural('llm-quota', 'quota-precheck');
    }

    if (this.dailyUsage !== undefined) {
      const slot = await this.dailyUsage.consume();
      if (slot !== 'ok') {
        return procedural('llm-quota', 'quota-precheck');
      }
    }

    const directorModel = this.config.get('DIRECTOR_MODEL', { infer: true });
    const thinking = thinkingConfigForId(
      resolveDirectorThinkingId(
        this.config.get('DIRECTOR_THINKING', { infer: true })
      )
    );

    const primary = wrapChatModel(
      this.factory.createPrimary({
        model: directorModel,
        apiKey: googleKey,
        thinking,
      }),
      'google',
      directorModel
    );

    const placement = this.config.get('DIRECTOR_PLACEMENT', { infer: true });
    let decoration: typeof primary | undefined;
    if (placement === 'route') {
      const decorationId = resolveDecorationThinkingId(
        this.config.get('DIRECTOR_DECORATION_THINKING', { infer: true })
      );
      decoration = wrapChatModel(
        this.factory.createPrimary({
          model: directorModel,
          apiKey: googleKey,
          thinking: thinkingConfigWithFallback(decorationId),
        }),
        'google',
        directorModel,
        { thinkingFallback: thinkingFallbackLevels(decorationId) }
      );
    }

    return runDirector(request, {
      primary,
      decoration,
      promptVersion,
      logger: this.logger,
      budgetMs: this.runtime?.budgetMs,
      llmRepairMinRemainingMs:
        this.runtime?.llmRepairMinRemainingMs ??
        this.config.get('LLM_REPAIR_MIN_REMAINING_MS', { infer: true }),
      placement,
      proceduralReserveMs: this.runtime?.proceduralReserveMs,
      now,
      startedMs,
      quotaBreaker: this.quotaBreaker,
      hedge: {
        delayMs: this.config.get('DIRECTOR_HEDGE_MS', { infer: true }),
        reserve: () => this.reserveHedgeSlot(),
      },
    });
  }
}
