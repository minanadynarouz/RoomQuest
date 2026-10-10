import { describe, expect, it } from 'vitest';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { wanderPath, wanderPathFromIds } from './wander';

describe('wanderPath', () => {
  it('walks adjacent surfaces using explorer-path waypoints', () => {
    const path = wanderPath(SYNTHETIC_LIVING_ROOM, 's5', 's4');
    expect(path).not.toBeNull();
    expect(path?.waypoints.map((w) => w.surfaceId)).toEqual(['s5', 's2', 's4']);
    expect(path?.segments).toEqual([
      { fromIndex: 0, toIndex: 1, kind: 'walk' },
      { fromIndex: 1, toIndex: 2, kind: 'walk' },
    ]);
  });

  it('returns null when only plank/ramp edges connect the pair', () => {
    expect(wanderPath(SYNTHETIC_LIVING_ROOM, 's5', 's1')).toBeNull();
    expect(wanderPath(SYNTHETIC_LIVING_ROOM, 's1', 's3')).toBeNull();
  });

  it('returns a single waypoint when already on the target', () => {
    const path = wanderPath(SYNTHETIC_LIVING_ROOM, 's2', 's2');
    expect(path?.waypoints).toHaveLength(1);
    expect(path?.segments).toEqual([]);
    expect(path?.waypoints[0]?.surfaceId).toBe('s2');
  });

  it('returns null for unknown ids', () => {
    expect(wanderPath(SYNTHETIC_LIVING_ROOM, 's1', 's99')).toBeNull();
    expect(wanderPath(SYNTHETIC_LIVING_ROOM, 's99', 's1')).toBeNull();
  });
});

describe('wanderPathFromIds', () => {
  it('builds an empty path from no ids', () => {
    expect(wanderPathFromIds(SYNTHETIC_LIVING_ROOM, [])).toEqual({
      waypoints: [],
      segments: [],
    });
  });
});
