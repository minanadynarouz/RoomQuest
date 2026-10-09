import { describe, it, expect } from 'vitest';
import type { PieceId } from '@roomquest/schema';
import { SNAP_RADIUS_M } from './constants';
import { isSnapCompatible } from './compatible';
import { findNearestSnapTarget } from './find-nearest';
import type { SnapSearchTarget } from './types';

function target(
  overrides: Partial<SnapSearchTarget> &
    Pick<SnapSearchTarget, 'placementId' | 'piece'>
): SnapSearchTarget {
  const { pose, ...rest } = overrides;
  return {
    filled: false,
    pose: { position: pose?.position ?? [0, 0, 0] },
    ...rest,
  };
}

describe('SNAP_RADIUS_M', () => {
  it('is 10 cm', () => {
    expect(SNAP_RADIUS_M).toBe(0.1);
  });
});

describe('isSnapCompatible', () => {
  it('matches a piece to its own type', () => {
    expect(isSnapCompatible('plank_bridge', 'plank_bridge')).toBe(true);
    expect(isSnapCompatible('ramp', 'ramp')).toBe(true);
  });

  it('rejects a different piece type (catalog has no substitutes)', () => {
    expect(isSnapCompatible('plank_bridge', 'ramp')).toBe(false);
    expect(isSnapCompatible('ramp', 'plank_bridge')).toBe(false);
  });
});

describe('findNearestSnapTarget', () => {
  it('returns the compatible unfilled target when in range', () => {
    const plank = target({
      placementId: 'p-plank',
      piece: 'plank_bridge',
      pose: { position: [1, 0.5, -2] },
    });
    const found = findNearestSnapTarget(
      'plank_bridge',
      1.05,
      0.5,
      -2,
      [plank]
    );
    expect(found).toBe(plank);
  });

  it('returns null when the nearest compatible target is out of range', () => {
    const plank = target({
      placementId: 'p-plank',
      piece: 'plank_bridge',
      pose: { position: [0, 0, 0] },
    });
    // 11 cm along X, just outside 10 cm.
    const found = findNearestSnapTarget('plank_bridge', 0.11, 0, 0, [plank]);
    expect(found).toBeNull();
  });

  it('includes a target exactly on the radius', () => {
    const plank = target({
      placementId: 'p-plank',
      piece: 'plank_bridge',
      pose: { position: [0, 0, 0] },
    });
    const found = findNearestSnapTarget('plank_bridge', SNAP_RADIUS_M, 0, 0, [
      plank,
    ]);
    expect(found).toBe(plank);
  });

  it('ignores a nearby target of the wrong piece type', () => {
    const ramp = target({
      placementId: 'p-ramp',
      piece: 'ramp',
      pose: { position: [0, 0, 0] },
    });
    const found = findNearestSnapTarget('plank_bridge', 0, 0, 0, [ramp]);
    expect(found).toBeNull();
  });

  it('ignores an already filled compatible target', () => {
    const filled = target({
      placementId: 'p-plank',
      piece: 'plank_bridge',
      filled: true,
      pose: { position: [0, 0, 0] },
    });
    const found = findNearestSnapTarget('plank_bridge', 0, 0, 0, [filled]);
    expect(found).toBeNull();
  });

  it('tie-breaks by world-space distance (closer wins)', () => {
    const farther = target({
      placementId: 'p-far',
      piece: 'plank_bridge',
      pose: { position: [0.08, 0, 0] },
    });
    const closer = target({
      placementId: 'p-near',
      piece: 'plank_bridge',
      pose: { position: [0.03, 0, 0] },
    });
    const found = findNearestSnapTarget('plank_bridge', 0, 0, 0, [
      farther,
      closer,
    ]);
    expect(found).toBe(closer);
  });

  it('skips filled and wrong-type targets when picking the nearest', () => {
    const filled = target({
      placementId: 'p-filled',
      piece: 'plank_bridge',
      filled: true,
      pose: { position: [0, 0, 0] },
    });
    const wrong: SnapSearchTarget = target({
      placementId: 'p-ramp',
      piece: 'ramp' satisfies PieceId,
      pose: { position: [0.01, 0, 0] },
    });
    const ok = target({
      placementId: 'p-ok',
      piece: 'plank_bridge',
      pose: { position: [0.06, 0, 0] },
    });
    const found = findNearestSnapTarget('plank_bridge', 0, 0, 0, [
      filled,
      wrong,
      ok,
    ]);
    expect(found).toBe(ok);
  });
});
