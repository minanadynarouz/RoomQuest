/**
 * Profile server work before the first Gemini call (no network: the model's
 * transport is stubbed). Usage: tsx scripts/profile-precall.ts
 */
import { performance } from 'node:perf_hooks';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { candidateRoutes } from '@roomquest/level-core';
import {
  buildLevelDecorationGeminiSchema,
  LevelRequest,
} from '@roomquest/schema';
import { makeDailySeed } from '../src/levels/daily-seed';
import { defaultDirectorChatFactory, wrapChatModel } from '../src/director/models';
import { buildDecorationMessages, decorationEnums } from '../src/director/prompts/decoration';
import { routeCallOptions, toLangchainMessages } from '../src/director/route-arm';
import { runDirector } from '../src/director/run-director';

process.env.RQ_ALLOW_LIVE_LLM ??= '';

type Row = Record<string, number | string>;
const t = (fn: () => unknown): number => {
  const s = performance.now();
  fn();
  return performance.now() - s;
};

async function main(): Promise<void> {
  const rows: Row[] = [];
  for (const pass of ['cold', 'warm'] as const) {
    for (const roomId of IWER_ROOM_IDS) {
      const body = { graph: IWER_GRAPHS[roomId], date: '2026-10-14', tier: 'easy' };
      let request!: LevelRequest;
      const parseMs = t(() => {
        request = LevelRequest.parse(JSON.parse(JSON.stringify(body)));
      });
      const seed = makeDailySeed(request.graph.roomHash, request.date);
      let candidates!: ReturnType<typeof candidateRoutes>;
      const candMs = t(() => {
        candidates = candidateRoutes(request.graph, { seed, tier: 'easy' });
      });
      let enums!: ReturnType<typeof decorationEnums>;
      const enumsMs = t(() => {
        enums = decorationEnums(candidates);
      });
      const schemaMs = t(() => buildLevelDecorationGeminiSchema(enums));
      const promptMs = t(() =>
        toLangchainMessages(buildDecorationMessages(candidates, { seed, tier: 'easy' }))
      );
      let model!: ReturnType<typeof defaultDirectorChatFactory.createPrimary>;
      const modelMs = t(() => {
        model = defaultDirectorChatFactory.createPrimary({
          model: 'gemini-3.8-flash',
          apiKey: 'test-profile',
          thinking: { thinkingLevel: 'LOW' },
        });
      });
      const structuredMs = t(() =>
        model.withStructuredOutput(routeCallOptions(enums).responseSchema ?? {}, {
          includeRaw: true,
          method: 'jsonSchema',
          name: 'LevelDecoration',
        })
      );
      // End-to-end runDirector until the first invoke (stub transport).
      let firstInvokeAt = 0;
      const chat = wrapChatModel(model, 'google', 'gemini-3.8-flash');
      const started = performance.now();
      await runDirector(request, {
        primary: {
          ...chat,
          invokeStructured: () => {
            firstInvokeAt = performance.now();
            return Promise.reject(new Error('stub: no network'));
          },
        },
        placement: 'route',
        logger: { log: () => undefined, warn: () => undefined, debug: () => undefined },
      });
      rows.push({
        pass,
        room: roomId,
        parse: parseMs.toFixed(1),
        candidateRoutes: candMs.toFixed(1),
        enums: enumsMs.toFixed(2),
        geminiSchema: schemaMs.toFixed(2),
        prompt: promptMs.toFixed(2),
        chatModelNew: modelMs.toFixed(2),
        withStructured: structuredMs.toFixed(2),
        runDirectorToInvoke: (firstInvokeAt - started).toFixed(1),
      });
    }
  }
  console.table(rows);
}

void main();
