import { describe, expect, it, vi } from 'vitest';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { LevelPlanLLMGeminiSchema } from '@roomquest/schema';
import { defaultDirectorChatFactory, wrapChatModel } from './models';
import { DEFAULT_DIRECTOR_MODEL } from './director.constants';

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
  });
});
