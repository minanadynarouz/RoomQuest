import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { describe, expect, it } from 'vitest';
import {
  jaccard,
  meanPairwiseJaccard,
  planVariety,
  unionSetsByRoom,
} from './variety';

describe('eval plan variety', () => {
  it('counts distinct surfaces and piece types on the fixture plan', () => {
    const variety = planVariety(
      SYNTHETIC_LIVING_ROOM_PLAN,
      SYNTHETIC_LIVING_ROOM
    );
    expect(variety.distinctSurfaces).toBeGreaterThanOrEqual(2);
    expect(variety.distinctPieceTypes).toBeGreaterThanOrEqual(2);
    expect(variety.pieceTypes).toContain('village_hut');
    expect(variety.surfaceLabels.length).toBeGreaterThan(0);
  });

  it('computes Jaccard and mean pairwise overlap', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(
      1 / 3
    );
    expect(jaccard(new Set(), new Set())).toBe(1);
    const mean = meanPairwiseJaccard([
      new Set(['hut', 'plank']),
      new Set(['hut', 'slime']),
      new Set(['hut', 'plank']),
    ]);
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThanOrEqual(1);
  });

  it('unions piece-type and surface-label sets per room', () => {
    const { pieceTypeSets, surfaceLabelSets } = unionSetsByRoom([
      {
        roomId: 'a',
        pieceTypes: ['village_hut', 'plank_bridge'],
        surfaceLabels: ['table'],
      },
      {
        roomId: 'a',
        pieceTypes: ['crystal_shrine'],
        surfaceLabels: ['couch'],
      },
      {
        roomId: 'b',
        pieceTypes: ['village_hut'],
        surfaceLabels: ['table'],
      },
    ]);
    expect(pieceTypeSets).toHaveLength(2);
    expect(pieceTypeSets[0]?.has('crystal_shrine')).toBe(true);
    expect(surfaceLabelSets[0]?.has('couch')).toBe(true);
  });
});
