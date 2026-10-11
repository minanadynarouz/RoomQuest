import { describe, expect, it } from 'vitest';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { candidateRoutes } from '@roomquest/level-core';
import {
  buildLevelDecorationGeminiSchema,
  buildLevelDecorationSchema,
  DECORATION_LINE_MAX_CHARS,
} from '@roomquest/schema';
import {
  buildDecorationMessages,
  DECORATION_BANNED_WORDS,
  DECORATION_SYSTEM_PREFIX,
  decorationEnums,
} from './decoration';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing fixture value');
  return value;
}

const graph = must(IWER_GRAPHS[must(IWER_ROOM_IDS[0])]);

describe('decoration prompt', () => {
  it('keeps the system prefix and few-shots byte-identical across requests', () => {
    const a = buildDecorationMessages(candidateRoutes(graph, { seed: 'a', tier: 'easy' }), { seed: 'a', tier: 'easy' });
    const b = buildDecorationMessages(candidateRoutes(graph, { seed: 'b', tier: 'normal' }), { seed: 'b', tier: 'normal' });
    expect(a.slice(0, 5)).toEqual(b.slice(0, 5));
    expect(must(a[0]).content).toBe(DECORATION_SYSTEM_PREFIX);
    expect(must(a.at(-1)).role).toBe('user');
  });

  it('lists every candidate route id in the per-request message', () => {
    const routes = candidateRoutes(graph, { seed: 'x', tier: 'normal' });
    const last = must(buildDecorationMessages(routes, { seed: 'x', tier: 'normal' }).at(-1)).content;
    for (const r of routes) expect(last).toContain(`- ${r.id}: `);
  });

  it('few-shot answers parse under a schema built from their own options', () => {
    const msgs = buildDecorationMessages(candidateRoutes(graph, { seed: 'x', tier: 'easy' }), { seed: 'x', tier: 'easy' });
    const schema = buildLevelDecorationSchema({
      routeIds: ['r0', 'r1'],
      beats: ['0', '1', '2', '3'],
      hazardTypes: ['slime', 'gate', 'moving_platform'],
    });
    for (const i of [2, 4]) {
      const parsed = schema.parse(JSON.parse(must(msgs[i]).content));
      for (const line of parsed.lines ?? []) {
        expect(line.text.length).toBeLessThanOrEqual(DECORATION_LINE_MAX_CHARS);
        const words = line.text.toLowerCase().split(/[^a-z]+/);
        for (const banned of DECORATION_BANNED_WORDS) expect(words).not.toContain(banned);
      }
    }
  });

  it('builds Gemini-safe enums for every IWER room and tier', () => {
    for (const id of IWER_ROOM_IDS) {
      for (const tier of ['easy', 'normal'] as const) {
        const routes = candidateRoutes(must(IWER_GRAPHS[id]), { seed: 's', tier });
        const enums = decorationEnums(routes);
        expect(enums.routeIds).toEqual(routes.map((r) => r.id));
        expect(enums.beats.length).toBeGreaterThan(0);
        const json = JSON.stringify(buildLevelDecorationGeminiSchema(enums));
        expect(json).not.toMatch(/"(pattern|anyOf|const|exclusiveMinimum)"/);
      }
    }
  });
});
