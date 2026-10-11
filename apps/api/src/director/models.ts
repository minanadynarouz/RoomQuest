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

function stripUnsupportedThinking(model: BaseChatModel): void {
  const level = googleThinkingConfig(model)?.thinkingLevel;
  if (isThinkingLevelUnsupported(level)) {
    clearGoogleThinkingConfig(model);
  }
}

/**
 * LangChain chat factories. Thinking is `thinkingLevel: LOW` in production
 * (`MINIMAL` 400s on gemini-3.8-flash). If Gemini rejects a level, the
 * wrapper retries once without thinkingConfig and remembers it. `maxRetries`
 * stays 0 — the director owns the 7 s AbortSignal budget.
 */
export const defaultDirectorChatFactory: DirectorChatFactory = {
  createPrimary(input: ChatModelParams): BaseChatModel {
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

export function wrapChatModel(
  model: BaseChatModel,
  provider: LlmProvider,
  modelId: string
): StructuredChat {
  return {
    provider,
    model: modelId,
    async invokeStructured(messages, signal) {
      stripUnsupportedThinking(model);
      const structured = model.withStructuredOutput(LevelPlanLLMGeminiSchema, {
        includeRaw: true,
        method: 'jsonSchema',
        name: 'LevelPlanLLM',
      });
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
        clearGoogleThinkingConfig(model);
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
