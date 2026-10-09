import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessageLike } from '@langchain/core/messages';
import { LevelPlanLLM } from '@roomquest/schema';
import { DIRECTOR_TEMPERATURE } from './director.constants';
import { raceAbort } from './errors';
import {
  type StructuredChat,
  unwrapStructured,
} from './structured-chat';
import type { LlmProvider } from './telemetry';

export const DIRECTOR_CHAT_FACTORY = Symbol('DIRECTOR_CHAT_FACTORY');
export const DIRECTOR_RUNTIME = Symbol('DIRECTOR_RUNTIME');

/** Optional test/eval overrides for the 7 s budget. Production leaves this empty. */
export interface DirectorRuntime {
  budgetMs?: number;
  fallbackMinRemainingMs?: number;
  now?: () => number;
}

export interface ChatModelParams {
  model: string;
  apiKey: string;
}

export interface DirectorChatFactory {
  createPrimary(input: ChatModelParams): BaseChatModel;
  createFallback(input: ChatModelParams): BaseChatModel;
}

/**
 * LangChain chat factories. `@langchain/google-genai` 2.3.2 types
 * `thinkingLevel` as `"LOW" | "MEDIUM" | "HIGH"` (Gemini 3.8 Flash docs
 * use lowercase `low`). `minimal` is not supported on 3.8 Flash.
 */
export const defaultDirectorChatFactory: DirectorChatFactory = {
  createPrimary(input: ChatModelParams): BaseChatModel {
    return new ChatGoogleGenerativeAI({
      model: input.model,
      apiKey: input.apiKey,
      temperature: DIRECTOR_TEMPERATURE,
      maxRetries: 0,
      thinkingConfig: { thinkingLevel: 'LOW' },
    });
  },
  createFallback(input: ChatModelParams): BaseChatModel {
    return new ChatAnthropic({
      model: input.model,
      apiKey: input.apiKey,
      temperature: DIRECTOR_TEMPERATURE,
      maxRetries: 0,
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
      const structured = model.withStructuredOutput(LevelPlanLLM, {
        includeRaw: true,
      });
      const result: unknown = await raceAbort(
        structured.invoke(messages, { signal }) as Promise<unknown>,
        signal
      );
      return unwrapStructured(result);
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
      const raw = await raceAbort(model.invoke(messages, { signal }), signal);
      const content = raw.content;
      if (typeof content !== 'string') {
        throw new Error('No structured output found');
      }
      return { parsed: JSON.parse(content) as unknown, raw };
    },
  };
}
