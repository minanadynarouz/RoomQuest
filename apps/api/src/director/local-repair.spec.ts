import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { describe, expect, it } from 'vitest';
import { localRepairPlan, trySnapPlacementsToSlots } from './local-repair';

describe('localRepairPlan', () => {
  it('clones through snapPlacementsToSlots without moving a valid plan', () => {
    const plan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    const snapped = trySnapPlacementsToSlots(plan, SYNTHETIC_LIVING_ROOM);
    expect(snapped).toEqual(plan);
    expect(snapped).not.toBe(plan);
  });

  it('repairs a locally-fixable plan without needing snap', () => {
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
    expect(result.repairs).not.toContain('snap-to-slots');
  });
});
