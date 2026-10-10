import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { validatePlan } from '@roomquest/level-core';
import { describe, expect, it } from 'vitest';
import { localRepairPlan, trySnapPlacementsToSlots } from './local-repair';

describe('localRepairPlan', () => {
  it('clones through snapPlacementsToSlots and keeps a valid plan', () => {
    const plan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    const snapped = trySnapPlacementsToSlots(plan, SYNTHETIC_LIVING_ROOM);
    expect(snapped).not.toBe(plan);
    expect(snapped.placements.map((item) => item.id)).toEqual(
      plan.placements.map((item) => item.id)
    );
    expect(validatePlan(snapped, SYNTHETIC_LIVING_ROOM).ok).toBe(true);
  });

  it('drops extra pieces and may snap remaining placements onto slots', () => {
    const dirty = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    dirty.placements.push({
      id: 'p-slime',
      piece: 'slime',
      surface: 's5',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    const result = localRepairPlan(dirty, SYNTHETIC_LIVING_ROOM);
    expect(result.result.ok).toBe(true);
    expect(result.plan.placements.some((p) => p.id === 'p-slime')).toBe(false);
    expect(validatePlan(result.plan, SYNTHETIC_LIVING_ROOM).ok).toBe(true);
  });
});
