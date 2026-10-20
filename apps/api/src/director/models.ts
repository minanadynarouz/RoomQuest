import {
  ChatGoogleGenerativeAI,
  type GoogleGenerativeAIChatInput,
} from '@langchain/google-genai';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessageLike } from '@langchain/core/messages';
import { LevelPlanLLMGeminiSchema } from '@roomquest/schema';
import { DIRECTOR_TEMPERATURE } from './director.constants';
import { raceAbort } from './errors';
import { type StructuredChat, unwrapStructured } from './structured-chat';
import type { LlmProvider } from './telemetry';
import {
  DEFAULT_DIRECTOR_THINKING,
  isThinkingLevelUnsupported,
  isUnsupportedThinkingLevelError,
  rememberUnsupportedThinkingLevel,
  thinkingConfigFor,
  type DirectorThinking,
  type GeminiThinkingLevel,
} from './thinking';

export const DIRECTOR_CHAT_FACTORY = Symbol('DIRECTOR_CHAT_FACTORY');
export const DIRECTOR_RUNTIME = Symbol('DIRECTOR_RUNTIME');

/** Optional test/eval overrides for the 7 s whole-request budget. Production leaves this empty. */
export interface DirectorRuntime {
  budgetMs?: number;
  llmRepairMinRemainingMs?: number;
  proceduralReserveMs?: number;
  now?: () => number;
}

export interface ChatModelParams {
  model: string;
  apiKey: string;
  thinking?: DirectorThinking;
}

export interface DirectorChatFactory {
  createPrimary(input: ChatModelParams): BaseChatModel;
}

function thinkingConfigInput(
  thinking: DirectorThinking | undefined
): GoogleGenerativeAIChatInput['thinkingConfig'] | undefined {
  const resolved = thinkingConfigFor(thinking);
  if (resolved === undefined) {
    return undefined;
  }
  // MINIMAL is valid on Gemini 3; @langchain/google-genai 2.3.2 types omit it.
  return resolved as GoogleGenerativeAIChatInput['thinkingConfig'];
}

function thinkingFromParams(
  input: ChatModelParams
): DirectorThinking | undefined {
  if (Object.hasOwn(input, 'thinking')) {
    return input.thinking;
  }
  return DEFAULT_DIRECTOR_THINKING;
}

function googleThinkingConfig(
  model: BaseChatModel
): { thinkingLevel?: string } | undefined {
  const rec = model as unknown as { thinkingConfig?: { thinkingLevel?: string } };
  return rec.thinkingConfig;
}

function clearGoogleThinkingConfig(model: BaseChatModel): void {
  (model as unknown as { thinkingConfig?: unknown }).thinkingConfig = undefined;
}

function nextSupportedLevel(
  fallback: readonly GeminiThinkingLevel[]
): GeminiThinkingLevel | undefined {
  return fallback.find((level) => !isThinkingLevelUnsupported(level));
}

/** Step to the next supported fallback level, or drop thinkingConfig. */
function downgradeThinking(
  model: BaseChatModel,
  fallback: readonly GeminiThinkingLevel[]
): void {
  const next = nextSupportedLevel(fallback);
  if (next === undefined) {
    clearGoogleThinkingConfig(model);
    return;
  }
  (model as unknown as { thinkingConfig?: unknown }).thinkingConfig = {
    thinkingLevel: next,
  };
}

function stripUnsupportedThinking(
  model: BaseChatModel,
  fallback: readonly GeminiThinkingLevel[]
): void {
  const level = googleThinkingConfig(model)?.thinkingLevel;
  if (isThinkingLevelUnsupported(level)) {
    downgradeThinking(model, fallback);
  }
}

export interface WrapChatModelOptions {
  /**
   * Thinking levels to step through when Gemini rejects the configured one
   * (e.g. ['LOW'] after MINIMAL). Empty: drop thinkingConfig (default).
   */
  thinkingFallback?: readonly GeminiThinkingLevel[];
}

/**
 * LangChain chat factories. Thinking is `thinkingLevel: LOW` in production
 * (`MINIMAL` 400s on gemini-3.8-flash). If Gemini rejects a level, the
 * wrapper retries once without thinkingConfig and remembers it. `maxRetries`
 * stays 0 — the director owns the 7 s AbortSignal budget.
 */
/**
 * Dummy keys used by specs that stub `client.generateContent` (no network).
 * Real Gemini keys never start with this prefix.
 */
export const TEST_DUMMY_KEY_PREFIX = 'test-';

/**
 * Refuse to build a real Gemini client under Vitest / NODE_ENV=test unless
 * RQ_ALLOW_LIVE_LLM=1 — protects the $10 billing cap. Dummy `test-*` keys
 * are allowed because those specs stub the transport and a dummy key cannot
 * authenticate anyway.
 */
export function assertLiveLlmAllowed(
  apiKey: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  const underTest = env.NODE_ENV === 'test' || env.VITEST !== undefined;
  if (!underTest || env.RQ_ALLOW_LIVE_LLM === '1') {
    return;
  }
  if (apiKey.startsWith(TEST_DUMMY_KEY_PREFIX)) {
    return;
  }
  throw new Error(
    'Refusing to construct ChatGoogleGenerativeAI under test without RQ_ALLOW_LIVE_LLM=1'
  );
}

export const defaultDirectorChatFactory: DirectorChatFactory = {
  createPrimary(input: ChatModelParams): BaseChatModel {
    assertLiveLlmAllowed(input.apiKey);
    const thinkingConfig = thinkingConfigInput(thinkingFromParams(input));
    return new ChatGoogleGenerativeAI({
      model: input.model,
      apiKey: input.apiKey,
      temperature: DIRECTOR_TEMPERATURE,
      maxRetries: 0,
      ...(thinkingConfig !== undefined ? { thinkingConfig } : {}),
    });
  },
};

const STRUCTURED_RUNNABLE_CACHE_MAX = 256;

export function wrapChatModel(
  model: BaseChatModel,
  provider: LlmProvider,
  modelId: string,
  wrapOptions: WrapChatModelOptions = {}
): StructuredChat {
  const fallback = wrapOptions.thinkingFallback ?? [];
  // withStructuredOutput runnables per schema identity (bounded). The static
  // plan schema is always cached; per-request schemas need `schemaKey`.
  const runnables = new Map<string, ReturnType<BaseChatModel['withStructuredOutput']>>();
  const structuredFor = (
    options: Parameters<StructuredChat['invokeStructured']>[2]
  ): ReturnType<BaseChatModel['withStructuredOutput']> => {
    const build = (): ReturnType<BaseChatModel['withStructuredOutput']> =>
      model.withStructuredOutput(
        options?.responseSchema ?? LevelPlanLLMGeminiSchema,
        {
          includeRaw: true,
          method: 'jsonSchema',
          name: options?.schemaName ?? 'LevelPlanLLM',
        }
      );
    const key =
      options?.responseSchema === undefined
        ? `static:${options?.schemaName ?? 'LevelPlanLLM'}`
        : options.schemaKey === undefined
          ? undefined
          : `${options.schemaName ?? ''}:${options.schemaKey}`;
    if (key === undefined) return build();
    let runnable = runnables.get(key);
    if (runnable === undefined) {
      runnable = build();
      if (runnables.size >= STRUCTURED_RUNNABLE_CACHE_MAX) {
        const oldest = runnables.keys().next().value;
        if (oldest !== undefined) runnables.delete(oldest);
      }
      runnables.set(key, runnable);
    }
    return runnable;
  };
  return {
    provider,
    model: modelId,
    async invokeStructured(messages, signal, options) {
      stripUnsupportedThinking(model, fallback);
      const structured = structuredFor(options);
      const startedMs = Date.now();
      const firstToken = { ms: null as number | null };
      const callbacks: Partial<BaseCallbackHandler>[] = [
        {
          handleLLMNewToken: (): void => {
            firstToken.ms ??= Date.now();
          },
        },
      ];
      const invokeOnce = (): Promise<unknown> =>
        raceAbort(
          structured.invoke(messages, { signal, callbacks }) as Promise<unknown>,
          signal
        );
      let result: unknown;
      try {
        result = await invokeOnce();
      } catch (err) {
        const level = googleThinkingConfig(model)?.thinkingLevel;
        if (
          level === undefined ||
          !isUnsupportedThinkingLevelError(err)
        ) {
          throw err;
        }
        rememberUnsupportedThinkingLevel(level);
        downgradeThinking(model, fallback);
        result = await invokeOnce();
      }
      const call = unwrapStructured(result);
      return {
        ...call,
        ttftMs:
          firstToken.ms === null
            ? null
            : Math.max(0, firstToken.ms - startedMs),
      };
    },
  };
}

/** Test helper: structured output from a chat model via JSON.parse. */
export function wrapJsonChatModel(
  model: {
    invoke: (
      input: BaseMessageLike[],
      options?: { signal?: AbortSignal }
    ) => Promise<{ content: unknown; usage_metadata?: unknown }>;
  },
  provider: LlmProvider,
  modelId: string
): StructuredChat {
  return {
    provider,
    model: modelId,
    async invokeStructured(messages, signal) {
      const startedMs = Date.now();
      const raw = await raceAbort(model.invoke(messages, { signal }), signal);
      const content = raw.content;
      if (typeof content !== 'string') {
        throw new Error('No structured output found');
      }
      return {
        parsed: JSON.parse(content) as unknown,
        raw,
        ttftMs: Math.max(0, Date.now() - startedMs),
      };
    },
  };
}
