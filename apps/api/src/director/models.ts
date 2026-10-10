import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessageLike } from '@langchain/core/messages';
import { LevelPlanLLMGeminiSchema } from '@roomquest/schema';
import { DIRECTOR_TEMPERATURE } from './director.constants';
import { raceAbort } from './errors';
import { type StructuredChat, unwrapStructured } from './structured-chat';
import type { LlmProvider } from './telemetry';

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
}

export interface DirectorChatFactory {
  createPrimary(input: ChatModelParams): BaseChatModel;
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
      // LangChain's AsyncCaller defaults to 6 retries with backoff. The
      // director owns the 7 s budget, so draft and repair must not retry.
      maxRetries: 0,
      thinkingConfig: { thinkingLevel: 'LOW' },
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
      // Pass the converted JSON schema only — never zod LevelPlanLLM.
      // LangChain's Zod path re-runs toJsonSchema and the bad keywords return.
      const structured = model.withStructuredOutput(LevelPlanLLMGeminiSchema, {
        includeRaw: true,
        method: 'jsonSchema',
        name: 'LevelPlanLLM',
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
