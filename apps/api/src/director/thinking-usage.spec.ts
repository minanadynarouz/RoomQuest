import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { SYNTHETIC_LIVING_ROOM_PLAN } from '@roomquest/fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DIRECTOR_MODEL } from './director.constants';
import { defaultDirectorChatFactory, wrapChatModel } from './models';
import { tokensFromRaw } from './telemetry';
import { planToLlmJson } from './test-fakes';
import {
  resetUnsupportedThinkingLevels,
  thinkingConfigForId,
} from './thinking';

/**
 * B-08 diagnosis: why `thoughtsTokenCount` read 0 at DIRECTOR_THINKING=low.
 *
 * Real ChatGoogleGenerativeAI, dummy key, `client.generateContent` stubbed:
 * no network, no live Gemini. The stub returns the usageMetadata shape the
 * Gemini REST API sends for a thinking model.
 */

const DUMMY_KEY = 'test-not-a-real-key';

const GEMINI_USAGE = {
  promptTokenCount: 1200,
  candidatesTokenCount: 180,
  thoughtsTokenCount: 95,
  totalTokenCount: 1475,
};

interface CapturedRequest {
  generationConfig?: {
    thinkingConfig?: { thinkingLevel?: string; thinkingBudget?: number };
    responseSchema?: unknown;
    temperature?: number;
  };
}

function stubbedModel(id: 'low' | 'default'): {
  chat: ReturnType<typeof wrapChatModel>;
  captured: CapturedRequest[];
} {
  const model = defaultDirectorChatFactory.createPrimary({
    model: DEFAULT_DIRECTOR_MODEL,
    apiKey: DUMMY_KEY,
    thinking: thinkingConfigForId(id),
  });
  const captured: CapturedRequest[] = [];
  const client = (
    model as unknown as {
      client: { generateContent: (request: unknown) => Promise<unknown> };
    }
  ).client;
  client.generateContent = (request: unknown) => {
    captured.push(request as CapturedRequest);
    return Promise.resolve({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN) }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: GEMINI_USAGE,
      },
    });
  };
  return {
    chat: wrapChatModel(model, 'google', DEFAULT_DIRECTOR_MODEL),
    captured,
  };
}

afterEach(() => {
  resetUnsupportedThinkingLevels();
});

describe('thinking tokens diagnosis (mocked generateContent)', () => {
  it('sends generationConfig.thinkingConfig.thinkingLevel LOW on the wire', async () => {
    const { chat, captured } = stubbedModel('low');
    await chat.invokeStructured(
      [new SystemMessage('prefix'), new HumanMessage('plan')],
      new AbortController().signal
    );
    expect(captured).toHaveLength(1);
    const generationConfig = captured[0]?.generationConfig;
    const logged: string[] = [];
    logged.push(
      `outgoing generationConfig ${JSON.stringify({
        thinkingConfig: generationConfig?.thinkingConfig,
        temperature: generationConfig?.temperature,
        hasResponseSchema: generationConfig?.responseSchema !== undefined,
      })}`
    );
    // Visible with `vitest --reporter=verbose`; asserted below.
    console.info(logged[0]);
    expect(logged[0]).toContain('"thinkingConfig":{"thinkingLevel":"LOW"}');
    expect(generationConfig?.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(generationConfig?.responseSchema).toBeDefined();
  });

  it('omits thinkingConfig entirely for DIRECTOR_THINKING=default', async () => {
    const { chat, captured } = stubbedModel('default');
    await chat.invokeStructured(
      [new HumanMessage('plan')],
      new AbortController().signal
    );
    expect(captured[0]?.generationConfig).not.toHaveProperty('thinkingConfig');
  });

  it('LangChain 2.3.2 drops thoughtsTokenCount; tokensFromRaw recovers it from totals', async () => {
    const { chat } = stubbedModel('low');
    const call = await chat.invokeStructured(
      [new HumanMessage('plan')],
      new AbortController().signal
    );
    const raw = call.raw as {
      usage_metadata?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        output_token_details?: { reasoning?: number };
      };
      response_metadata?: Record<string, unknown>;
    };
    // What the library actually exposes: no reasoning detail, no
    // usageMetadata in response_metadata — only the three totals.
    expect(raw.usage_metadata?.input_tokens).toBe(GEMINI_USAGE.promptTokenCount);
    expect(raw.usage_metadata?.output_tokens).toBe(
      GEMINI_USAGE.candidatesTokenCount
    );
    expect(raw.usage_metadata?.total_tokens).toBe(GEMINI_USAGE.totalTokenCount);
    expect(raw.usage_metadata?.output_token_details?.reasoning).toBeUndefined();
    expect(raw.response_metadata?.usageMetadata).toBeUndefined();

    const tokens = tokensFromRaw(call.raw);
    expect(tokens.inputTokens).toBe(GEMINI_USAGE.promptTokenCount);
    expect(tokens.outputTokens).toBe(GEMINI_USAGE.candidatesTokenCount);
    expect(tokens.thoughtsTokenCount).toBe(GEMINI_USAGE.thoughtsTokenCount);
    expect(tokens.thinkingTokens).toBe(GEMINI_USAGE.thoughtsTokenCount);
  });

  it('still prefers explicit reasoning / thoughtsTokenCount when present', () => {
    expect(
      tokensFromRaw({
        usage_metadata: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 40,
          output_token_details: { reasoning: 7 },
        },
      }).thoughtsTokenCount
    ).toBe(7);
    expect(
      tokensFromRaw({
        response_metadata: {
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            thoughtsTokenCount: 3,
            totalTokenCount: 18,
          },
        },
      }).thoughtsTokenCount
    ).toBe(3);
  });

  it('reports null (not 0) when the totals show no thinking', () => {
    expect(
      tokensFromRaw({
        usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }).thoughtsTokenCount
    ).toBeNull();
  });
});
