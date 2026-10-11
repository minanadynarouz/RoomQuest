import { HumanMessage } from '@langchain/core/messages';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { candidateRoutes } from '@roomquest/level-core';
import { LevelRequest } from '@roomquest/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { envSchema } from '../config/env';
import { DEFAULT_DIRECTOR_MODEL } from './director.constants';
import { defaultDirectorChatFactory, wrapChatModel } from './models';
import {
  buildDecorationMessages,
  DECORATION_SYSTEM_PREFIX,
} from './prompts/decoration';
import { runDirector } from './run-director';
import type { StructuredChat } from './structured-chat';
import { promptCharCount, tokensFromRaw } from './telemetry';
import { mockDecorationJson, silentLogger } from './test-fakes';
import {
  isThinkingLevelUnsupported,
  resetUnsupportedThinkingLevels,
  resolveDecorationThinkingId,
  thinkingConfigWithFallback,
  thinkingFallbackLevels,
} from './thinking';

afterEach(() => {
  resetUnsupportedThinkingLevels();
});

function thinkingLevelOf(model: object): string | undefined {
  return (model as { thinkingConfig?: { thinkingLevel?: string } })
    .thinkingConfig?.thinkingLevel;
}

describe('DIRECTOR_DECORATION_THINKING', () => {
  it('defaults to minimal and validates ids', () => {
    expect(resolveDecorationThinkingId(undefined)).toBe('minimal');
    expect(resolveDecorationThinkingId(' ')).toBe('minimal');
    expect(resolveDecorationThinkingId('LOW')).toBe('low');
    expect(() => resolveDecorationThinkingId('max')).toThrow(
      /DIRECTOR_DECORATION_THINKING/
    );
    expect(thinkingFallbackLevels('minimal')).toEqual(['LOW']);
    expect(thinkingFallbackLevels('low')).toEqual([]);
  });

  it('env schema defaults DIRECTOR_DECORATION_THINKING to minimal', () => {
    const parsed = envSchema.safeParse({});
    if (parsed.success) {
      expect(parsed.data.DIRECTOR_DECORATION_THINKING).toBe('minimal');
    }
    const low = envSchema.safeParse({ DIRECTOR_DECORATION_THINKING: 'low' });
    if (low.success) {
      expect(low.data.DIRECTOR_DECORATION_THINKING).toBe('low');
    }
  });

  it('initial config is MINIMAL; factory sends it', () => {
    expect(thinkingConfigWithFallback('minimal')).toEqual({
      thinkingLevel: 'MINIMAL',
    });
    const chat = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
      thinking: thinkingConfigWithFallback('minimal'),
    });
    expect(thinkingLevelOf(chat)).toBe('MINIMAL');
  });

  it('falls back MINIMAL → LOW (not to no thinking) when Gemini rejects MINIMAL', async () => {
    const model = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
      thinking: thinkingConfigWithFallback('minimal'),
    });
    const sentLevels: (string | undefined)[] = [];
    const client = (
      model as unknown as {
        client: { generateContent: (request: unknown) => Promise<unknown> };
      }
    ).client;
    client.generateContent = (request: unknown) => {
      const gen = (request as { generationConfig?: { thinkingConfig?: { thinkingLevel?: string } } })
        .generationConfig;
      sentLevels.push(gen?.thinkingConfig?.thinkingLevel ?? thinkingLevelOf(model));
      if (sentLevels.length === 1) {
        return Promise.reject(
          Object.assign(
            new Error('[400 Bad Request] Thinking level MINIMAL is not supported'),
            { status: 400 }
          )
        );
      }
      return Promise.resolve({
        response: {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: '{}' }] },
              finishReason: 'STOP',
            },
          ],
        },
      });
    };
    const chat = wrapChatModel(model, 'google', DEFAULT_DIRECTOR_MODEL, {
      thinkingFallback: thinkingFallbackLevels('minimal'),
    });
    await chat.invokeStructured(
      [new HumanMessage('decorate')],
      new AbortController().signal
    );
    expect(sentLevels).toHaveLength(2);
    expect(thinkingLevelOf(model)).toBe('LOW');
    expect(isThinkingLevelUnsupported('MINIMAL')).toBe(true);
    expect(thinkingConfigWithFallback('minimal')).toEqual({
      thinkingLevel: 'LOW',
    });
  });
});

describe('route arm uses the decoration chat only for the decoration call', () => {
  it('sends the decoration call through options.decoration and records telemetry', async () => {
    const roomId = IWER_ROOM_IDS[0];
    const request = LevelRequest.parse({
      graph: IWER_GRAPHS[roomId],
      date: '2026-10-14',
      tier: 'easy',
    });
    const used: string[] = [];
    const fake = (name: string, answer: () => unknown): StructuredChat => ({
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: () => {
        used.push(name);
        return Promise.resolve({
          parsed: answer(),
          raw: {
            usage_metadata: { input_tokens: 900, output_tokens: 40, total_tokens: 960 },
            response_metadata: {
              usageMetadata: { cachedContentTokenCount: 768, thoughtsTokenCount: 20 },
            },
          },
          ttftMs: null,
        });
      },
    });
    const { makeDailySeed } = await import('../levels/daily-seed');
    const seed = makeDailySeed(request.graph.roomHash, request.date);
    const candidates = candidateRoutes(request.graph, { seed, tier: 'easy' });
    const decorationAnswer = () => JSON.parse(mockDecorationJson(candidates)) as unknown;
    const outcome = await runDirector(request, {
      primary: fake('primary', decorationAnswer),
      decoration: fake('decoration', decorationAnswer),
      placement: 'route',
      logger: silentLogger,
    });
    expect(used).toEqual(['decoration']);
    const row = outcome.telemetry[0];
    expect(row?.cachedTokens).toBe(768);
    expect(row?.inputTokens).toBe(900);
    expect(row?.outputTokens).toBe(40);
    expect(row?.thinkingTokens).toBe(20);
    expect(row?.ttfbMs).toBeNull();
    expect(row?.totalMs).toBe(row?.latencyMs);
    expect(row?.promptChars).toBeGreaterThan(DECORATION_SYSTEM_PREFIX.length);
  });
});

describe('decoration prompt caching layout', () => {
  it('system prefix + few-shots are byte-identical across rooms/tiers/seeds; room data last', () => {
    let reference: string | undefined;
    for (const roomId of IWER_ROOM_IDS) {
      for (const tier of ['easy', 'normal'] as const) {
        for (const seed of ['a', 'b', 'c']) {
          const routes = candidateRoutes(IWER_GRAPHS[roomId], { seed, tier });
          if (routes.length === 0) continue;
          const msgs = buildDecorationMessages(routes, { seed, tier });
          const prefix = JSON.stringify(msgs.slice(0, -1));
          reference ??= prefix;
          expect(prefix).toBe(reference);
          expect(msgs[0]?.content).toBe(DECORATION_SYSTEM_PREFIX);
          const last = msgs.at(-1)?.content ?? '';
          for (const route of routes) expect(last).toContain(`- ${route.id}: `);
        }
      }
    }
    expect(reference).toBeDefined();
  });
});

describe('telemetry helpers', () => {
  it('reads cachedContentTokenCount and counts prompt chars', () => {
    expect(
      tokensFromRaw({ usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 4 } })
        .cachedTokens
    ).toBe(4);
    expect(tokensFromRaw({ usage_metadata: { input_tokens: 3 } }).cachedTokens).toBeNull();
    expect(
      promptCharCount([new HumanMessage('abc'), { content: [{ text: 'de' }, 'f'] }])
    ).toBe(6);
  });
});
