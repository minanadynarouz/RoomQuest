import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { candidateRoutes } from '@roomquest/level-core';
import { LevelRequest, type Tier } from '@roomquest/schema';
import { describe, expect, it } from 'vitest';
import { makeDailySeed } from '../levels/daily-seed';
import { runDirector } from './run-director';
import type { StructuredChat } from './structured-chat';
import type { DirectorLogger } from './telemetry';

const TIERS: readonly Tier[] = ['easy', 'normal'];
const SENTENCES = [
  'Whoa, the sofa mountains look huge from down here!',
  'The sofa dunes are hot! Help me sneak past this slime.',
  'Can you lift the bridge for me? I am too small!',
  'Wait, the gap is so wide... hold my hand?',
  'Gems everywhere! The table plateau is sparkling!',
  'We made it to the crystal! Best team ever!',
];

function capturingLogger(): DirectorLogger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    log: (m: string) => lines.push(m),
    warn: (m: string) => lines.push(m),
    debug: (m: string) => lines.push(m),
  };
}

describe('route arm keeps realistic Gemini lines', () => {
  for (const roomId of IWER_ROOM_IDS) {
    for (const tier of TIERS) {
      it(`${roomId} × ${tier}`, async () => {
        const request = LevelRequest.parse({
          graph: IWER_GRAPHS[roomId],
          date: '2026-10-14',
          tier,
        });
        const seed = makeDailySeed(request.graph.roomHash, request.date);
        const candidates = candidateRoutes(request.graph, { seed, tier });
        if (candidates.length === 0) return;
        const route = candidates[candidates.length - 1];
        if (route === undefined) return;
        const n = route.plan.beats.length;
        const beats = [...new Set([0, Math.floor(n / 2), n - 1])];
        const answer = {
          routeId: route.id,
          theme: 'Sofa dune trek',
          twistBeat: route.options.twistBeats[0] ?? '0',
          hazards: route.options.hazards
            .filter((h) => h.types.length > 0)
            .slice(0, 1)
            .map((h) => ({ beat: h.beat, type: h.types[0] })),
          lines: beats.map((b, i) => ({
            beat: String(b),
            text: SENTENCES[i % SENTENCES.length] ?? 'Hi!',
          })),
        };
        const chat: StructuredChat = {
          provider: 'google',
          model: 'gemini-3.8-flash',
          invokeStructured: () => Promise.resolve({ parsed: answer }),
        };
        const logger = capturingLogger();
        const outcome = await runDirector(request, {
          primary: chat,
          placement: 'route',
          logger,
        });
        expect(outcome.response.source).not.toBe('procedural');
        expect(outcome.response.routeId).toBe(route.id);
        expect(outcome.response.lines?.map((l) => l.beat)).toEqual(
          answer.lines.map((l) => l.beat)
        );
        expect(outcome.response.lines?.map((l) => l.text)).toEqual(
          answer.lines.map((l) => l.text)
        );
        const log = logger.lines.find((l) => l.startsWith('director.route_lines'));
        expect(log).toBeDefined();
        expect(log).toContain(`routeId=${route.id}`);
        expect(log).toContain(`linesRaw=${String(answer.lines.length)}`);
        expect(log).toContain(`linesKept=${String(answer.lines.length)}`);
        expect(log).toContain('droppedLines=0');
      });
    }
  }
});
