import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { lookupRepairRoute, tryRepairRoute } from './repair-route';

describe('tryRepairRoute', () => {
  it('is a no-op until level-core exports repairRoute', () => {
    expect(lookupRepairRoute()).toBeUndefined();
    const plan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    const result = tryRepairRoute(plan, SYNTHETIC_LIVING_ROOM);
    expect(result.plan).toBe(plan);
    expect(result.repairs).toEqual([]);
  });

  it('calls a present repairRoute after snap and before repairPlan', () => {
    const next = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
    next.title = 'routed';
    const result = tryRepairRoute(
      SYNTHETIC_LIVING_ROOM_PLAN,
      SYNTHETIC_LIVING_ROOM,
      () => () => ({ plan: next, repairs: ['route-links'] })
    );
    expect(result.plan.title).toBe('routed');
    expect(result.repairs).toEqual(['route-links']);
  });
});
