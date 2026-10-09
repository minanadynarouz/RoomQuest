import { FakeListChatModel } from '@langchain/core/utils/testing';
import { AIMessage } from '@langchain/core/messages';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { RunnableLambda } from '@langchain/core/runnables';
import type { LevelPlan } from '@roomquest/schema';
import { wrapJsonChatModel } from './models';
import type { StructuredChat } from './structured-chat';
import type { LlmProvider } from './telemetry';

export const silentLogger = {
  log: (): void => undefined,
  warn: (): void => undefined,
  debug: (): void => undefined,
};

export function planToLlmJson(plan: LevelPlan): string {
  return JSON.stringify({
    ...plan,
    placements: plan.placements.map((placement) => ({
      ...placement,
      to: placement.to ?? null,
    })),
  });
}

export function structuredFromFake(
  fake: FakeListChatModel,
  provider: LlmProvider = 'google',
  model = 'gemini-3.8-flash'
): StructuredChat {
  return wrapJsonChatModel(fake, provider, model);
}

export class ThrowingFakeListChatModel extends FakeListChatModel {
  onThrow?: () => void;

  constructor(private readonly error: Error) {
    super({ responses: ['{}'] });
  }

  _generate(): Promise<never> {
    this.onThrow?.();
    return Promise.reject(this.error);
  }
}

export class HangingFakeListChatModel extends FakeListChatModel {
  constructor() {
    super({ responses: ['{}'] });
  }

  async _generate(
    _messages: never,
    options?: { signal?: AbortSignal }
  ): Promise<never> {
    const signal = options?.signal;
    if (signal === undefined) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    await new Promise<never>((_resolve, reject) => {
      if (signal.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
        return;
      }
      const onAbort = (): void => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
    throw new Error('unreachable');
  }

  /**
   * FakeListChatModel's withStructuredOutput does not forward AbortSignal.
   * Override so timeout tests abort instead of hanging the process.
   */
  override withStructuredOutput(): ReturnType<
    FakeListChatModel['withStructuredOutput']
  > {
    const runnable = RunnableLambda.from(
      async (
        input: BaseLanguageModelInput,
        config?: { signal?: AbortSignal }
      ) => {
        await this.invoke(input, config);
        return { raw: new AIMessage('{}'), parsed: {} };
      }
    );
    return runnable as ReturnType<FakeListChatModel['withStructuredOutput']>;
  }
}

export class UsageFakeListChatModel extends FakeListChatModel {
  _formatGeneration(text: string): {
    message: AIMessage;
    text: string;
  } {
    return {
      message: new AIMessage({
        content: text,
        usage_metadata: {
          input_tokens: 12,
          output_tokens: 34,
          total_tokens: 46,
        },
      }),
      text,
    };
  }
}
