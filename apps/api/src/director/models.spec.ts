import { HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { LevelPlanLLM, LevelPlanLLMGeminiSchema } from '@roomquest/schema';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DIRECTOR_MODEL } from './director.constants';
import { defaultDirectorChatFactory, wrapChatModel } from './models';

function callerMaxRetries(model: object): number | undefined {
  const caller = (model as unknown as { caller?: { maxRetries?: number } })
    .caller;
  return caller?.maxRetries;
}

describe('defaultDirectorChatFactory', () => {
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
    const placements = properties.placements as Record<string, unknown>;
    const items = placements.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    const to = itemProps.to as Record<string, unknown>;
    expect(to).toEqual({ type: 'string', nullable: true });
    expect(invoke).toHaveBeenCalledWith([], { signal });
    expect(invoke).toHaveBeenCalledTimes(1);
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
    const placements = properties.placements as Record<string, unknown>;
    const items = placements.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    expect(itemProps.to).toEqual({ type: 'string', nullable: true });
    const parTimeMs = properties.parTimeMs as Record<string, unknown>;
    expect(parTimeMs.exclusiveMinimum).toBeUndefined();
    expect(parTimeMs.minimum).toBe(1);
  });
});
