import { HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { LevelPlanLLM, LevelPlanLLMGeminiSchema } from '@roomquest/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DIRECTOR_MODEL } from './director.constants';
import { defaultDirectorChatFactory, wrapChatModel } from './models';
import { resetUnsupportedThinkingLevels } from './thinking';

function callerMaxRetries(model: object): number | undefined {
  const caller = (model as unknown as { caller?: { maxRetries?: number } })
    .caller;
  return caller?.maxRetries;
}

describe('defaultDirectorChatFactory', () => {
  afterEach(() => {
    resetUnsupportedThinkingLevels();
  });

  it('constructs a Gemini chat model without invoking it', () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
    });
    expect(primary).toBeInstanceOf(ChatGoogleGenerativeAI);
    expect(callerMaxRetries(primary)).toBe(0);
  });

  it('uses withStructuredOutput(LevelPlanLLMGeminiSchema) and forwards the AbortSignal', async () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
    });
    const invoke = vi.fn().mockResolvedValue({ parsed: {}, raw: {} });
    const withStructuredOutput = vi
      .spyOn(primary, 'withStructuredOutput')
      .mockReturnValue({ invoke } as never);
    const chat = wrapChatModel(primary, 'google', DEFAULT_DIRECTOR_MODEL);
    const signal = new AbortController().signal;
    await chat.invokeStructured([], signal);
    expect(withStructuredOutput).toHaveBeenCalledWith(
      LevelPlanLLMGeminiSchema,
      {
        includeRaw: true,
        method: 'jsonSchema',
        name: 'LevelPlanLLM',
      }
    );
    const sent = withStructuredOutput.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const properties = sent.properties as Record<string, unknown>;
    const placements = properties.pl as Record<string, unknown>;
    const items = placements.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    const to = itemProps.t as Record<string, unknown>;
    expect(to).toEqual({ type: 'string', nullable: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    const invokeOpts = invoke.mock.calls[0]?.[1] as
      | { signal?: AbortSignal; callbacks?: unknown }
      | undefined;
    expect(invokeOpts?.signal).toBe(signal);
    expect(Array.isArray(invokeOpts?.callbacks)).toBe(true);
    expect(sent).not.toBe(LevelPlanLLM);
    expect(sent).not.toHaveProperty('safeParse');
  });

  it('sends the Gemini-safe responseSchema on the generateContent payload', async () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
    });
    const captured: unknown[] = [];
    const client = (
      primary as unknown as {
        client: {
          generateContent: (
            request: unknown,
            requestOptions?: unknown
          ) => Promise<unknown>;
        };
      }
    ).client;
    client.generateContent = (request: unknown) => {
      captured.push(request);
      return Promise.resolve({
        response: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: '{}' }],
              },
              finishReason: 'STOP',
            },
          ],
        },
      });
    };
    const chat = wrapChatModel(primary, 'google', DEFAULT_DIRECTOR_MODEL);
    await chat.invokeStructured(
      [new HumanMessage('plan')],
      new AbortController().signal
    );
    expect(captured).toHaveLength(1);
    const payload = captured[0] as {
      generationConfig?: { responseSchema?: Record<string, unknown> };
    };
    const schema = payload.generationConfig?.responseSchema;
    expect(schema).toBeDefined();
    expect(schema).toEqual(LevelPlanLLMGeminiSchema);
    expect(schema).not.toHaveProperty('$schema');
    expect(schema).not.toHaveProperty('additionalProperties');
    expect(schema).not.toHaveProperty('safeParse');
    const properties = schema?.properties as Record<string, unknown>;
    const placements = properties.pl as Record<string, unknown>;
    const items = placements.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    expect(itemProps.t).toEqual({ type: 'string', nullable: true });
    expect(properties.parTimeMs).toBeUndefined();
    expect(properties.th).toBeDefined();
  });

  it('sends thinkingLevel LOW by default (MINIMAL 400s on gemini-3.8-flash)', () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
    });
    const config = (
      primary as unknown as {
        thinkingConfig?: { thinkingLevel?: string; thinkingBudget?: number };
      }
    ).thinkingConfig;
    expect(config?.thinkingLevel).toBe('LOW');
    expect(config?.thinkingBudget).toBeUndefined();
  });

  it('retries once without thinkingConfig when Gemini 400s the thinking level', async () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
    });
    let calls = 0;
    const client = (
      primary as unknown as {
        client: {
          generateContent: (
            request: unknown,
            requestOptions?: unknown
          ) => Promise<unknown>;
        };
      }
    ).client;
    client.generateContent = () => {
      calls += 1;
      if (calls === 1) {
        const err = Object.assign(
          new Error('[400 Bad Request] Thinking level LOW is not supported'),
          { status: 400 }
        );
        return Promise.reject(err);
      }
      return Promise.resolve({
        response: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: '{}' }],
              },
              finishReason: 'STOP',
            },
          ],
        },
      });
    };
    const chat = wrapChatModel(primary, 'google', DEFAULT_DIRECTOR_MODEL);
    await chat.invokeStructured(
      [new HumanMessage('plan')],
      new AbortController().signal
    );
    expect(calls).toBe(2);
    expect(
      (primary as unknown as { thinkingConfig?: unknown }).thinkingConfig
    ).toBeUndefined();

    await chat.invokeStructured(
      [new HumanMessage('plan')],
      new AbortController().signal
    );
    expect(calls).toBe(3);
  });

  it('sends thinkingLevel LOW when configured', () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
      thinking: { thinkingLevel: 'LOW' },
    });
    const config = (
      primary as unknown as { thinkingConfig?: { thinkingLevel?: string } }
    ).thinkingConfig;
    expect(config?.thinkingLevel).toBe('LOW');
  });

  it('omits thinkingConfig for provider default', () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
      thinking: undefined,
    });
    const config = (
      primary as unknown as { thinkingConfig?: unknown }
    ).thinkingConfig;
    expect(config).toBeUndefined();
  });
});
