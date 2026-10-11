import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import * as levelCore from '@roomquest/level-core';
import { candidateRoutes, validatePlan } from '@roomquest/level-core';
import { LevelRequest, type LevelPlan } from '@roomquest/schema';
import { describe, expect, it, vi } from 'vitest';
import { makeDailySeed } from '../levels/daily-seed';
import * as localRepair from './local-repair';
import { runDirector } from './run-director';
import type { StructuredChat } from './structured-chat';

vi.mock('@roomquest/level-core', async (importOriginal) => {
  const actual = await importOriginal<typeof levelCore>();
  return { ...actual, applyDecoration: vi.fn(actual.applyDecoration) };
});
vi.mock('./local-repair', async (importOriginal) => {
  const actual = await importOriginal<typeof localRepair>();
  return { ...actual, localRepairPlan: vi.fn(actual.localRepairPlan) };
});

describe('route lines on the local-fixed success path', () => {
  it('logs route_lines and drops lines whose beat no longer exists after local repair', async () => {
    // A route with >= 3 beats so the repaired plan (one beat fewer) is valid.
    let found:
      | { request: LevelRequest; route: levelCore.CandidateRoute }
      | undefined;
    for (const roomId of IWER_ROOM_IDS) {
      for (const tier of ['easy', 'normal'] as const) {
        const request = LevelRequest.parse({
          graph: IWER_GRAPHS[roomId],
          date: '2026-10-14',
          tier,
        });
        const seed = makeDailySeed(request.graph.roomHash, request.date);
        const route = candidateRoutes(request.graph, { seed, tier }).find(
          (r) => r.plan.beats.length >= 3
        );
        if (route !== undefined && found === undefined) found = { request, route };
      }
    }
    if (found === undefined) throw new Error('no route with >= 3 beats');
    const { request, route } = found;
    const n = route.plan.beats.length;

    const actualApply = (await vi.importActual<typeof levelCore>('@roomquest/level-core'))
      .applyDecoration;
    // Decorated plan comes back invalid (no shrine) so local repair runs.
    vi.mocked(levelCore.applyDecoration).mockImplementationOnce((routes, deco) => {
      const out = actualApply(routes, deco);
      if (!out.ok) return out;
      const broken: LevelPlan = {
        ...out.plan,
        placements: out.plan.placements.filter((p) => p.piece !== 'crystal_shrine'),
      };
      return { ...out, plan: broken };
    });
    // Local repair "fixes" it into a plan with fewer beats.
    const repaired: LevelPlan = { ...route.plan, beats: route.plan.beats.slice(0, n - 1) };
    vi.mocked(localRepair.localRepairPlan).mockImplementationOnce(() => {
      const result = validatePlan(route.plan, request.graph);
      return {
        ok: true,
        plan: repaired,
        repairs: ['repair-plan'],
        result,
        relaxed: result.relaxed,
        fixedBy: 'repair-plan',
      };
    });

    const answer = {
      routeId: route.id,
      theme: 'Sofa dune trek',
      twistBeat: route.options.twistBeats[0] ?? '0',
      lines: [
        { beat: '0', text: 'Whoa, the sofa mountains look huge from down here!' },
        { beat: String(n - 1), text: 'We made it to the crystal! Best team ever!' },
      ],
    };
    const chat: StructuredChat = {
      provider: 'google',
      model: 'gemini-3.8-flash',
      invokeStructured: () => Promise.resolve({ parsed: answer }),
    };
    const logs: string[] = [];
    const outcome = await runDirector(request, {
      primary: chat,
      placement: 'route',
      logger: { log: (m) => logs.push(m), warn: (m) => logs.push(m), debug: () => undefined },
    });
    expect(outcome.response.source).toBe('llm_repaired');
    expect(outcome.stage).toBe('repair-plan');
    expect(outcome.response.lines).toEqual([answer.lines[0]]);
    const log = logs.find((l) => l.startsWith('director.route_lines'));
    expect(log).toContain('stage=repair-plan');
    expect(log).toContain('linesRaw=2');
    expect(log).toContain('linesKept=1');
    expect(log).toContain('droppedLines=1');
    expect(log).toContain(`beat-beyond-plan:${String(n - 1)}`);
  });
});
