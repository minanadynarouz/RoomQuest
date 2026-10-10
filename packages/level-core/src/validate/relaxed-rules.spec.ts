import { describe, expect, it } from 'vitest';
import { IWER_GRAPHS, type IwerRoomId } from '@roomquest/fixtures';
import type { RelaxedRule } from '@roomquest/schema';
import { generatePlanResult } from '../generate/generate-plan';
import { repairPlan } from '../repair/repair-plan';
import { relaxedRulesFor } from './relaxed-rules';
import { validatePlan } from './validate-plan';

const SEED = 'waiver-ids-2026-10-10';

const EXPECTED: Record<IwerRoomId, readonly RelaxedRule[]> = {
  living_room: ['hutTable', 'portalFov'],
  meeting_room: ['minPath'],
  music_room: ['hutTable'],
  office_large: ['hutTable'],
  office_small: [],
};

describe('relaxedRulesFor IWER waiver ids', () => {
  it.each(
    (Object.keys(EXPECTED) as IwerRoomId[]).map((room) => ({
      room,
      expected: [...EXPECTED[room]],
    }))
  )('$room reports $expected', ({ room, expected }) => {
    const graph = IWER_GRAPHS[room];
    const generated = generatePlanResult(graph, SEED, 'easy');
    const validated = validatePlan(generated.plan, graph);
    const repaired = repairPlan(generated.plan, graph);

    expect(relaxedRulesFor(graph)).toEqual(expected);
    expect(generated.relaxed).toEqual(expected);
    expect(validated.relaxed).toEqual(expected);
    expect(repaired.relaxed).toEqual(expected);
    expect(repaired.result.relaxed).toEqual(expected);
    expect(validated.ok).toBe(true);
    expect(repaired.result.ok).toBe(true);
  });

  it('orders waiver ids deterministically regardless of helper call order', () => {
    expect(relaxedRulesFor(IWER_GRAPHS.living_room)).toEqual([
      'hutTable',
      'portalFov',
    ]);
    expect(validatePlan(generatePlanResult(IWER_GRAPHS.living_room, SEED, 'normal').plan, IWER_GRAPHS.living_room).relaxed).toEqual(
      ['hutTable', 'portalFov']
    );
  });
});
