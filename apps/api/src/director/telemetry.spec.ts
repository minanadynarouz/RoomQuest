import { describe, expect, it } from 'vitest';
import { tokensFromRaw } from './telemetry';

describe('tokensFromRaw', () => {
  it('reads usageMetadata.thoughtsTokenCount', () => {
    const tokens = tokensFromRaw({
      response_metadata: {
        usageMetadata: {
          promptTokenCount: 11,
          candidatesTokenCount: 22,
          thoughtsTokenCount: 9,
        },
      },
    });
    expect(tokens.inputTokens).toBe(11);
    expect(tokens.outputTokens).toBe(22);
    expect(tokens.thinkingTokens).toBe(9);
    expect(tokens.thoughtsTokenCount).toBe(9);
  });

  it('reads LangChain usage_metadata thoughtsTokenCount', () => {
    const tokens = tokensFromRaw({
      usage_metadata: {
        input_tokens: 3,
        output_tokens: 4,
        thoughtsTokenCount: 5,
      },
    });
    expect(tokens.thoughtsTokenCount).toBe(5);
    expect(tokens.thinkingTokens).toBe(5);
  });

  it('prefers includeRaw output_token_details.reasoning over thoughtsTokenCount 0', () => {
    const tokens = tokensFromRaw({
      parsed: { th: 'forest' },
      raw: {
        usage_metadata: {
          input_tokens: 100,
          output_tokens: 50,
          output_token_details: { reasoning: 17 },
        },
        response_metadata: {
          usageMetadata: {
            thoughtsTokenCount: 0,
          },
        },
      },
    });
    expect(tokens.inputTokens).toBe(100);
    expect(tokens.outputTokens).toBe(50);
    expect(tokens.thoughtsTokenCount).toBe(17);
    expect(tokens.thinkingTokens).toBe(17);
  });

  it('reads a Google usageMetadata fixture with positive reasoning tokens', () => {
    const tokens = tokensFromRaw({
      usage_metadata: {
        input_tokens: 80,
        output_tokens: 40,
        output_token_details: { reasoning: 9 },
      },
    });
    expect(tokens.thoughtsTokenCount).toBe(9);
  });

  it('reads Gemini SDK generateContent usageMetadata when LangChain drops thoughts', () => {
    const tokens = tokensFromRaw({
      usage_metadata: {
        input_tokens: 10,
        output_tokens: 20,
      },
      response: {
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          thoughtsTokenCount: 7,
        },
      },
    });
    expect(tokens.inputTokens).toBe(10);
    expect(tokens.outputTokens).toBe(20);
    expect(tokens.thoughtsTokenCount).toBe(7);
  });

  it('merges LangChain usage_metadata with Gemini usageMetadata.thoughtsTokenCount', () => {
    const tokens = tokensFromRaw({
      usage_metadata: {
        input_tokens: 12,
        output_tokens: 34,
      },
      response_metadata: {
        usageMetadata: {
          thoughtsTokenCount: 5,
        },
      },
    });
    expect(tokens.inputTokens).toBe(12);
    expect(tokens.outputTokens).toBe(34);
    expect(tokens.thoughtsTokenCount).toBe(5);
  });
});
