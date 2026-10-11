import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import * as levelCore from '@roomquest/level-core';
import { validatePlan } from '@roomquest/level-core';
import type { LevelPlan } from '@roomquest/schema';
import { describe, expect, it, vi } from 'vitest';
import {
  localRepairPlan,
  repairRoute,
  trySnapPlacementsToSlots,
} from './local-repair';

vi.mock('@roomquest/level-core', async (importOriginal) => {
  const actual = await importOriginal<typeof levelCore>();
  return {
    ...actual,
    snapPlacementsToSlots: vi.fn(actual.snapPlacementsToSlots),
    repairPlan: vi.fn(actual.repairPlan),
  };
});

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
    // Snap runs before repairPlan: the floor slime moves onto a legal
    // surface instead of being dropped.
    expect(result.fixedBy).toBe('snap');
    expect(result.repairs).toEqual(['snap-to-slots']);
    const slime = result.plan.placements.find((p) => p.id === 'p-slime');
    expect(slime?.surface).not.toBe('s5');
    expect(validatePlan(result.plan, SYNTHETIC_LIVING_ROOM).ok).toBe(true);
  });

  it('runs snap → repairRoute → repairPlan in order and reports the fixing stage', () => {
    const level = vi.mocked(levelCore);
    level.snapPlacementsToSlots.mockClear();
    level.repairPlan.mockClear();
    const dirty = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    // An unknown surface: snap cannot fix it, repairPlan drops the piece.
    dirty.placements.push({
      id: 'p-ghost',
      piece: 'gem',
      surface: 'nope',
      u: 0.5,
      v: 0.5,
      playerBuilt: false,
      links: [],
    });
    const result = localRepairPlan(dirty, SYNTHETIC_LIVING_ROOM);
    const snapOrder = level.snapPlacementsToSlots.mock.invocationCallOrder[0];
    const repairOrder = level.repairPlan.mock.invocationCallOrder[0];
    expect(snapOrder).toBeDefined();
    expect(repairOrder).toBeDefined();
    expect(snapOrder ?? 0).toBeLessThan(repairOrder ?? 0);
    expect(result.result.ok).toBe(true);
    expect(result.fixedBy).toBe('repair-plan');
    expect(result.plan.placements.some((p) => p.id === 'p-ghost')).toBe(false);
  });

  it('keeps repairRoute a pass-through until level-core ships one', () => {
    const plan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    const routed = repairRoute(plan, SYNTHETIC_LIVING_ROOM);
    expect(routed.plan).toBe(plan);
    expect(routed.repairs).toEqual([]);
  });

  it('skips snap for a non-LevelPlan candidate and lets repairPlan coerce it', () => {
    const result = localRepairPlan(
      { theme: 'forest', placements: 'nope' } as unknown as LevelPlan,
      SYNTHETIC_LIVING_ROOM
    );
    expect(result.result.ok).toBe(false);
    expect(result.fixedBy).toBeNull();
  });
});
