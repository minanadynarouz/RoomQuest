import { describe, expect, it } from 'vitest';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import type { SurfaceGraph, SurfaceNode } from '@roomquest/schema';
import { placementToPose } from '../placement/pose';
import {
  chooseLargestTable,
  chooseVillageAnchorPlacement,
  villageFallbackPose,
} from './fallback';
import { VILLAGE_ANCHOR_STORAGE_KEY, type VillageAnchorStorage } from './types';

const HANDLE = '11111111-2222-4333-8444-555555555555';

function memoryStore(
  initial: Record<string, string> = {}
): VillageAnchorStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function node(overrides: Partial<SurfaceNode> & Pick<SurfaceNode, 'id'>): SurfaceNode {
  return {
    label: 'table',
    kind: 'plane',
    topHeight: 0.75,
    centroid: [0, 0.75, 0],
    size: [1, 0.8],
    yaw: 0,
    area: 0.8,
    reach: 'hand',
    angleFromForward: 0,
    ...overrides,
  };
}

function graphOf(nodes: SurfaceNode[]): SurfaceGraph {
  return {
    version: 1,
    roomHash: 'aaaaaaaaaaaa',
    mode: 'scene',
    floorY: 0,
    nodes,
    edges: [],
  };
}

describe('chooseLargestTable', () => {
  it('picks the coffee table on the synthetic living room (tie-break by view angle)', () => {
    const table = chooseLargestTable(SYNTHETIC_LIVING_ROOM);
    expect(table?.id).toBe('s1');
    expect(table?.label).toBe('table');
  });

  it('prefers the larger table when areas differ', () => {
    const table = chooseLargestTable(
      graphOf([
        node({ id: 's1', area: 0.4 }),
        node({ id: 's2', area: 0.9 }),
        node({ id: 's3', label: 'couch', area: 2.0 }),
      ])
    );
    expect(table?.id).toBe('s2');
  });

  it('ignores tables that fail hut height / area, then still falls back to a table', () => {
    const onlyTiny = chooseLargestTable(
      graphOf([
        node({ id: 's1', area: 0.1, size: [0.3, 0.3] }),
        node({ id: 's2', label: 'floor', area: 12 }),
      ])
    );
    expect(onlyTiny?.id).toBe('s1');
  });

  it('returns null when the graph has no table or desk', () => {
    expect(
      chooseLargestTable(
        graphOf([
          node({ id: 's1', label: 'couch', area: 1.8 }),
          node({ id: 's2', label: 'floor', area: 10 }),
        ])
      )
    ).toBeNull();
  });

  it('treats a desk as a table-like surface', () => {
    const table = chooseLargestTable(
      graphOf([
        node({ id: 's1', label: 'desk', area: 0.7 }),
        node({ id: 's2', label: 'table', area: 0.35 }),
      ])
    );
    expect(table?.id).toBe('s1');
  });
});

describe('villageFallbackPose', () => {
  it('is the centre of the chosen table', () => {
    const pose = villageFallbackPose(SYNTHETIC_LIVING_ROOM);
    const expected = placementToPose(SYNTHETIC_LIVING_ROOM, {
      surface: 's1',
      u: 0.5,
      v: 0.5,
    });
    expect(pose).toEqual(expected);
  });
});

describe('chooseVillageAnchorPlacement', () => {
  it('restores when storage has a handle and anchors are supported', () => {
    const decision = chooseVillageAnchorPlacement({
      storage: memoryStore({ [VILLAGE_ANCHOR_STORAGE_KEY]: HANDLE }),
      persistentAnchorsSupported: true,
      graph: SYNTHETIC_LIVING_ROOM,
    });
    expect(decision).toEqual({
      kind: 'restore',
      handle: HANDLE,
      reason: null,
      surfaceId: 's1',
    });
  });

  it('falls back when there is no stored handle', () => {
    const decision = chooseVillageAnchorPlacement({
      storage: memoryStore(),
      persistentAnchorsSupported: true,
      graph: SYNTHETIC_LIVING_ROOM,
    });
    expect(decision.kind).toBe('fallback');
    expect(decision.reason).toBe('no-stored-handle');
    expect(decision.surfaceId).toBe('s1');
  });

  it('falls back when persistent anchors are unsupported', () => {
    const decision = chooseVillageAnchorPlacement({
      storage: memoryStore({ [VILLAGE_ANCHOR_STORAGE_KEY]: HANDLE }),
      persistentAnchorsSupported: false,
      graph: SYNTHETIC_LIVING_ROOM,
    });
    expect(decision.kind).toBe('fallback');
    expect(decision.reason).toBe('anchors-unsupported');
  });

  it('falls back when storage is unavailable (private mode)', () => {
    const storage: VillageAnchorStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    const decision = chooseVillageAnchorPlacement({
      storage,
      persistentAnchorsSupported: true,
      graph: SYNTHETIC_LIVING_ROOM,
    });
    expect(decision.kind).toBe('fallback');
    expect(decision.reason).toBe('storage-unavailable');
    expect(decision.surfaceId).toBe('s1');
  });
});
