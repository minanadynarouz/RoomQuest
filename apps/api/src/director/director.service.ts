import { performance } from 'node:perf_hooks';
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LevelResponse, type LevelRequest } from '@roomquest/schema';
import { claimFirstQuery, dbStageKey, roundMs } from '../common/first-query';
import type { Env } from '../config/env';
import {
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
  wrapChatModel,
  type DirectorChatFactory,
  type DirectorRuntime,
} from './models';
import { PROMPT_VERSION } from './prompts';
import type { StructuredChat } from './structured-chat';
import { warmUpGemini, warmupEnabled, type WarmupResult } from './warmup';
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
export class DirectorService implements OnApplicationBootstrap {
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

  /** Fire-and-forget Gemini warm-up (DIRECTOR_WARMUP); never blocks boot. */
  onApplicationBootstrap(): void {
    void this.warmUp();
  }

  async warmUp(fetchImpl?: typeof fetch): Promise<WarmupResult | 'disabled'> {
    const apiKey = this.config.get('GOOGLE_API_KEY', { infer: true });
    if (
      apiKey === undefined ||
      !warmupEnabled(
        this.config.get('DIRECTOR_WARMUP', { infer: true }),
        this.config.get('DIRECTOR_MODE', { infer: true }),
        apiKey
      )
    ) {
      return 'disabled';
    }
    return warmUpGemini({
      model: this.config.get('DIRECTOR_MODEL', { infer: true }),
      apiKey,
      logger: this.logger,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
  }

  /**
   * Chat models (ChatGoogleGenerativeAI + wrapper with its cached
   * withStructuredOutput runnables) are created once per process per
   * model/thinking config and reused; a changed API key rebuilds them.
   */
  private readonly chats = new Map<string, { apiKey: string; chat: StructuredChat }>();

  /**
   * Per-request handle for a process-cached chat. Construction is deferred to
   * the first invoke, i.e. after the daily-counter gate passed, so a capped or
   * DB-down request never builds a live model. `modelGetMs` records the
   * lookup (≈0 when cached; the constructor cost on the first request).
   */
  private lazyChat(
    model: string,
    preCall: Record<string, number>,
    key: string,
    create: () => StructuredChat,
    apiKey: string
  ): StructuredChat {
    let resolved: StructuredChat | undefined;
    const get = (): StructuredChat => {
      if (resolved === undefined) {
        const started = performance.now();
        resolved = this.cachedChat(key, create, apiKey);
        preCall.modelGetMs = roundMs(
          (preCall.modelGetMs ?? 0) + performance.now() - started
        );
      }
      return resolved;
    };
    return {
      provider: 'google',
      model,
      invokeStructured: (messages, signal, options) =>
        get().invokeStructured(messages, signal, options),
    };
  }

  private cachedChat(
    key: string,
    create: () => StructuredChat,
    apiKey: string
  ): StructuredChat {
    const hit = this.chats.get(key);
    if (hit?.apiKey === apiKey) {
      return hit.chat;
    }
    const chat = create();
    this.chats.set(key, { apiKey, chat });
    return chat;
  }

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

  async plan(
    request: LevelRequest,
    preCall?: Record<string, number>
  ): Promise<LevelResponse> {
    const outcome = await this.run(request, preCall);
    return outcome.response;
  }

  async run(
    request: LevelRequest,
    callerPreCall: Record<string, number> = {}
  ): Promise<DirectorOutcome> {
    const preCall = callerPreCall;
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

    const breakerStarted = performance.now();
    const breakerOpen = this.quotaBreaker?.isOpen() === true;
    preCall.breakerMs = roundMs(performance.now() - breakerStarted);
    if (breakerOpen) {
      return procedural('llm-quota', 'quota-precheck');
    }

    // Daily-counter reservation (a Postgres round trip) runs in parallel
    // with chat lookup and prompt prep; runDirector awaits it right before
    // the first model call.
    const gateStarted = performance.now();
    const usage = this.dailyUsage;
    const reserveCold = usage === undefined ? false : claimFirstQuery(usage);
    const llmGate =
      usage === undefined
        ? undefined
        : usage.consume().then((slot) => {
            preCall[dbStageKey('dailyReserve', reserveCold)] = roundMs(
              performance.now() - gateStarted
            );
            return slot === 'ok';
          });

    const directorModel = this.config.get('DIRECTOR_MODEL', { infer: true });
    const thinkingId = resolveDirectorThinkingId(
      this.config.get('DIRECTOR_THINKING', { infer: true })
    );
    const primary = this.lazyChat(
      directorModel,
      preCall,
      `primary|${directorModel}|${thinkingId}`,
      () =>
        wrapChatModel(
          this.factory.createPrimary({
            model: directorModel,
            apiKey: googleKey,
            thinking: thinkingConfigForId(thinkingId),
          }),
          'google',
          directorModel
        ),
      googleKey
    );

    const placement = this.config.get('DIRECTOR_PLACEMENT', { infer: true });
    let decoration: typeof primary | undefined;
    if (placement === 'route') {
      const decorationId = resolveDecorationThinkingId(
        this.config.get('DIRECTOR_DECORATION_THINKING', { infer: true })
      );
      decoration = this.lazyChat(
        directorModel,
        preCall,
        `decoration|${directorModel}|${decorationId}`,
        () =>
          wrapChatModel(
            this.factory.createPrimary({
              model: directorModel,
              apiKey: googleKey,
              thinking: thinkingConfigWithFallback(decorationId),
            }),
            'google',
            directorModel,
            { thinkingFallback: thinkingFallbackLevels(decorationId) }
          ),
        googleKey
      );
    }

    return runDirector(request, {
      primary,
      decoration,
      ...(llmGate === undefined ? {} : { llmGate }),
      preCall,
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
