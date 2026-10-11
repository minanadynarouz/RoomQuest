import { FakeListChatModel } from '@langchain/core/utils/testing';
import { AIMessage } from '@langchain/core/messages';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { RunnableLambda } from '@langchain/core/runnables';
import { listHintedSlots, type CandidateRoute } from '@roomquest/level-core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import { abortableDelay } from './errors';
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
    th: plan.theme,
    pl: plan.placements.map((placement) => ({
      i: placement.id,
      pc: placement.piece,
      s: placement.surface,
      t: placement.to ?? null,
      u: placement.u,
      v: placement.v,
      lk: placement.links,
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
  generateCalls = 0;

  constructor(private readonly error: Error) {
    // Match production Gemini: no LangChain retry/backoff on the 7 s budget.
    super({ responses: ['{}'], maxRetries: 0 });
  }

  _generate(): Promise<never> {
    this.generateCalls += 1;
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

/**
 * Fake that sleeps a per-call delay (honouring AbortSignal) then returns the
 * next canned plan. Used to prove a slow first + slow repair still finishes
 * inside the 7 s whole-request budget.
 */
export class SlowFakeListChatModel extends FakeListChatModel {
  private readonly delaysMs: number[];

  constructor(options: { responses: string[]; delaysMs: number | number[] }) {
    super({ responses: options.responses });
    this.delaysMs = Array.isArray(options.delaysMs)
      ? options.delaysMs
      : [options.delaysMs];
  }

  private delayForCall(): number {
    const index = Math.min(this.i, this.delaysMs.length - 1);
    return this.delaysMs[index] ?? 0;
  }

  async _generate(
    messages: never,
    options?: { signal?: AbortSignal }
  ): Promise<Awaited<ReturnType<FakeListChatModel['_generate']>>> {
    const signal = options?.signal ?? new AbortController().signal;
    await abortableDelay(this.delayForCall(), signal);
    return super._generate(messages, options);
  }

  /**
   * FakeListChatModel's withStructuredOutput does not forward AbortSignal.
   * Forward config so wrapChatModel's raceAbort can cancel a slow repair.
   */
  override withStructuredOutput(): ReturnType<
    FakeListChatModel['withStructuredOutput']
  > {
    const runnable = RunnableLambda.from(
      async (
        input: BaseLanguageModelInput,
        config?: { signal?: AbortSignal }
      ) => {
        const message = await this.invoke(input, config);
        if (typeof message.content !== 'string') {
          throw new Error('No structured output found');
        }
        return {
          raw: message,
          parsed: JSON.parse(message.content) as unknown,
        };
      }
    );
    return runnable as ReturnType<FakeListChatModel['withStructuredOutput']>;
  }
}

export class AfterGenerateFakeListChatModel extends FakeListChatModel {
  onAfterGenerate?: () => void;

  async _generate(
    messages: never,
    options?: { signal?: AbortSignal }
  ): Promise<Awaited<ReturnType<FakeListChatModel['_generate']>>> {
    const result = await super._generate(messages, options);
    this.onAfterGenerate?.();
    return result;
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
        response_metadata: {
          usageMetadata: {
            thoughtsTokenCount: 5,
          },
        },
      }),
      text,
    };
  }
}

/**
 * Slot-mode mock answer: map each placement to an unused hinted slot that
 * fits the piece (same surface first). Returns uv JSON when the graph
 * offers no hinted slots.
 */
export function planToSlotLlmJson(
  plan: LevelPlan,
  graph: SurfaceGraph,
  seed: string
): string {
  const slots = listHintedSlots(graph, { seed });
  if (slots.length === 0) {
    return planToLlmJson(plan);
  }
  const used = new Set<string>();
  return JSON.stringify({
    th: plan.theme,
    pl: plan.placements.map((placement) => {
      const free = slots.filter((slot) => !used.has(slot.id));
      const pick =
        free.find(
          (slot) =>
            slot.surfaceId === placement.surface &&
            slot.fits.includes(placement.piece)
        ) ??
        free.find((slot) => slot.fits.includes(placement.piece)) ??
        free[0] ??
        slots[0];
      if (pick !== undefined) {
        used.add(pick.id);
      }
      return {
        i: placement.id,
        pc: placement.piece,
        slot: pick?.id ?? '',
        t: placement.to ?? null,
        lk: placement.links,
      };
    }),
  });
}

/**
 * Route-arm mock answer built only from what the request offers: the first
 * candidate (or `routeId` override), its first twist beat, its offered
 * hazards, and one in-voice line per beat.
 */
export function mockDecorationJson(
  candidates: readonly CandidateRoute[],
  overrides: Record<string, unknown> = {}
): string {
  const route = candidates[0];
  if (route === undefined) {
    return JSON.stringify({
      routeId: 'r0',
      theme: 'none',
      twistBeat: '0',
      hazards: [],
      ...overrides,
    });
  }
  const hazards = route.options.hazards
    .filter((hazard) => hazard.types.length > 0)
    .slice(0, 1)
    .map((hazard) => ({ beat: hazard.beat, type: hazard.types[0] ?? '' }));
  return JSON.stringify({
    routeId: route.id,
    theme: 'Sofa summit climb',
    twistBeat: route.options.twistBeats[0] ?? '0',
    hazards,
    lines: route.plan.beats.slice(0, 8).map((_beat, index) => ({
      beat: String(index),
      text: `Whoa, look at that, step ${String(index + 1)} together!`,
    })),
    ...overrides,
  });
}
