import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import * as levelCore from '@roomquest/level-core';
import { candidateRoutes, validatePlan } from '@roomquest/level-core';
import {
  buildLevelDecorationGeminiSchema,
  LevelRequest,
  LevelResponse,
  type Tier,
} from '@roomquest/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeDailySeed } from '../levels/daily-seed';
import { DEFAULT_DIRECTOR_MODEL } from './director.constants';
import { defaultDirectorChatFactory, wrapChatModel } from './models';
import { decorationEnums } from './prompts/decoration';
import { countBannedWordHits } from './route-arm';
import { runDirector } from './run-director';
import type { StructuredCallOptions, StructuredChat } from './structured-chat';
import { mockDecorationJson, silentLogger } from './test-fakes';
import { resetUnsupportedThinkingLevels } from './thinking';

vi.mock('@roomquest/level-core', async (importOriginal) => {
  const actual = await importOriginal<typeof levelCore>();
  return { ...actual, candidateRoutes: vi.fn(actual.candidateRoutes) };
});

const TIERS: readonly Tier[] = ['easy', 'normal'];
const DATE = '2026-10-14';

function requestFor(roomId: (typeof IWER_ROOM_IDS)[number], tier: Tier) {
  return LevelRequest.parse({ graph: IWER_GRAPHS[roomId], date: DATE, tier });
}

function seedFor(request: LevelRequest): string {
  return makeDailySeed(request.graph.roomHash, request.date);
}

/** Mocked transport: returns canned decoration objects, records calls. */
function capturing(answer: unknown): {
  chat: StructuredChat;
  calls: (StructuredCallOptions | undefined)[];
} {
  const calls: (StructuredCallOptions | undefined)[] = [];
  return {
    calls,
    chat: {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: (_messages, _signal, options) => {
        calls.push(options);
        return Promise.resolve({ parsed: answer });
      },
    },
  };
}

afterEach(() => {
  resetUnsupportedThinkingLevels();
});

describe('DIRECTOR_PLACEMENT=route', () => {
  for (const roomId of IWER_ROOM_IDS) {
    for (const tier of TIERS) {
      it(`serves a decorated candidate route for ${roomId} × ${tier}`, async () => {
        const request = requestFor(roomId, tier);
        const candidates = candidateRoutes(request.graph, {
          seed: seedFor(request),
          tier,
        });
        const answer = JSON.parse(mockDecorationJson(candidates)) as {
          routeId: string;
        };
        const { chat, calls } = capturing(answer);
        const outcome = await runDirector(request, {
          primary: chat,
          placement: 'route',
          logger: silentLogger,
        });
        expect(calls).toHaveLength(1);
        if (candidates.length === 0) {
          expect(outcome.response.fallbackReason).toBe('no-route-candidates');
          return;
        }
        const parsed = LevelResponse.parse(outcome.response);
        expect(['llm', 'llm_repaired']).toContain(parsed.source);
        expect(outcome.placement).toBe('route');
        expect(outcome.telemetry).toHaveLength(1);
        expect(validatePlan(parsed.plan, request.graph).ok).toBe(true);
        const chosen = candidates.find((c) => c.id === answer.routeId);
        expect(parsed.relaxed).toEqual(chosen?.relaxed);
        expect(parsed.lines?.length).toBeGreaterThan(0);
        expect(outcome.routeDecoration?.routeId).toBe(answer.routeId);
        expect(outcome.routeDecoration?.droppedLines).toBe(0);
        expect(outcome.routeDecoration?.bannedWordHits).toBe(0);
        const schema = calls[0]?.responseSchema ?? {};
        expect(schema).toEqual(
          buildLevelDecorationGeminiSchema(decorationEnums(candidates))
        );
      });
    }
  }

  const roomId = IWER_ROOM_IDS[0];
  const request = requestFor(roomId, 'easy');
  const candidates = candidateRoutes(request.graph, {
    seed: seedFor(request),
    tier: 'easy',
  });

  it('goes procedural with llm-invalid on UNKNOWN_ROUTE_ID (no second call)', async () => {
    const { chat, calls } = capturing(
      JSON.parse(mockDecorationJson(candidates, { routeId: 'r99' })) as unknown
    );
    const outcome = await runDirector(request, {
      primary: chat,
      placement: 'route',
      logger: silentLogger,
    });
    expect(calls).toHaveLength(1);
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.response.fallbackReason).toBe('llm-invalid');
    expect(outcome.failedAt).toBe('route-decoration');
    expect(outcome.validation.firstTry[0]?.code).toBe('UNKNOWN_ROUTE_ID');
    expect(validatePlan(outcome.response.plan, request.graph).ok).toBe(true);
  });

  it('goes procedural with llm-parse-failed on a malformed decoration', async () => {
    const { chat, calls } = capturing({ routeId: 'r0', theme: 42 });
    const outcome = await runDirector(request, {
      primary: chat,
      placement: 'route',
      logger: silentLogger,
    });
    expect(calls).toHaveLength(1);
    expect(outcome.response.fallbackReason).toBe('llm-parse-failed');
    expect(outcome.failedAt).toBe('route-decoration');
  });

  it('drops malformed lines and still serves the plan', async () => {
    const base = JSON.parse(mockDecorationJson(candidates)) as Record<
      string,
      unknown
    >;
    const { chat } = capturing({
      ...base,
      lines: [
        { beat: '0', text: 'Whoa,\u0007 the sofa\u0000 mountains!' },
        { beat: '1', text: '' },
        { beat: '1', text: 'x'.repeat(200) },
        { beat: '77', text: 'Unknown beat line' },
        { beat: '1', text: 42 },
        'not a line',
      ],
    });
    const outcome = await runDirector(request, {
      primary: chat,
      placement: 'route',
      logger: silentLogger,
    });
    const parsed = LevelResponse.parse(outcome.response);
    expect(['llm', 'llm_repaired']).toContain(parsed.source);
    expect(parsed.lines).toEqual([
      { beat: '0', text: 'Whoa, the sofa mountains!' },
    ]);
    expect(outcome.routeDecoration?.droppedLines).toBe(5);
  });

  it('goes procedural with no-route-candidates when level-core finds none', async () => {
    vi.mocked(levelCore.candidateRoutes).mockReturnValueOnce([]);
    const { chat, calls } = capturing({});
    const outcome = await runDirector(request, {
      primary: chat,
      placement: 'route',
      logger: silentLogger,
    });
    expect(calls).toHaveLength(0);
    expect(outcome.response.fallbackReason).toBe('no-route-candidates');
    expect(outcome.failedAt).toBe('route-candidates');
  });

  it('sends the converted Gemini-safe schema on the wire (no zod pass-through)', async () => {
    const model = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-route-arm-key',
    });
    expect(
      (model as unknown as { caller?: { maxRetries?: number } }).caller
        ?.maxRetries
    ).toBe(0);
    const captured: {
      generationConfig?: {
        responseSchema?: Record<string, unknown>;
        thinkingConfig?: unknown;
      };
      systemInstruction?: unknown;
      contents?: { role: string }[];
    }[] = [];
    const client = (
      model as unknown as {
        client: { generateContent: (r: unknown) => Promise<unknown> };
      }
    ).client;
    client.generateContent = (req: unknown) => {
      captured.push(req as (typeof captured)[number]);
      return Promise.resolve({
        response: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: mockDecorationJson(candidates) }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 900,
            candidatesTokenCount: 120,
            totalTokenCount: 1100,
          },
        },
      });
    };
    const outcome = await runDirector(request, {
      primary: wrapChatModel(model, 'google', DEFAULT_DIRECTOR_MODEL),
      placement: 'route',
      logger: silentLogger,
    });
    expect(captured).toHaveLength(1);
    const sent = captured[0]?.generationConfig?.responseSchema;
    expect(sent).toEqual(
      buildLevelDecorationGeminiSchema(decorationEnums(candidates))
    );
    expect(sent).not.toHaveProperty('safeParse');
    expect(sent).not.toHaveProperty('$schema');
    expect(JSON.stringify(sent)).not.toMatch(/"(anyOf|pattern|additionalProperties)"/);
    expect(captured[0]?.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'LOW',
    });
    expect(captured[0]?.systemInstruction).toBeDefined();
    expect(captured[0]?.contents?.map((c) => c.role)).toEqual([
      'user',
      'model',
      'user',
      'model',
      'user',
    ]);
    expect(outcome.response.source).toBe('llm');
    expect(outcome.telemetry[0]?.thoughtsTokenCount).toBe(80);
  });

  it('counts banned words as whole words only', () => {
    expect(
      countBannedWordHits([
        { text: 'This level was AI generated' },
        { text: 'Said the snail, plainly' },
      ])
    ).toBe(3);
  });
});
