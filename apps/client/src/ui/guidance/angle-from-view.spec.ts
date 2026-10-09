import { describe, expect, it } from 'vitest';
import {
  angleFromViewDeg,
  isLookingAtExplorer,
  isOutOfView,
  OUT_OF_VIEW_DEG,
  writeEdgeArrowPose,
} from './angle-from-view.js';

describe('angleFromViewDeg', () => {
  it('is 0° when the target sits on the view centre', () => {
    expect(
      angleFromViewDeg(0, 1.5, 0, 0, 0, -1, 0, 1.5, -1)
    ).toBeCloseTo(0, 5);
  });

  it('is 90° for a target on the right', () => {
    expect(
      angleFromViewDeg(0, 1.5, 0, 0, 0, -1, 1, 1.5, 0)
    ).toBeCloseTo(90, 5);
  });

  it('treats more than 50° as out of view', () => {
    const justInside = angleFromViewDeg(0, 1.5, 0, 0, 0, -1, 0.8, 1.5, -1);
    const justOutside = angleFromViewDeg(0, 1.5, 0, 0, 0, -1, 1.3, 1.5, -1);
    expect(justInside).toBeLessThanOrEqual(OUT_OF_VIEW_DEG);
    expect(isOutOfView(justInside)).toBe(false);
    expect(justOutside).toBeGreaterThan(OUT_OF_VIEW_DEG);
    expect(isOutOfView(justOutside)).toBe(true);
    expect(isOutOfView(50)).toBe(false);
    expect(isOutOfView(50.01)).toBe(true);
  });

  it('counts a small cone as looking at the explorer', () => {
    expect(isLookingAtExplorer(0)).toBe(true);
    expect(isLookingAtExplorer(12)).toBe(true);
    expect(isLookingAtExplorer(12.1)).toBe(false);
  });
});

describe('writeEdgeArrowPose', () => {
  it('writes into the caller buffer on the view-right when the target is right', () => {
    const out = { x: 0, y: 0, z: 0, roll: 0 };
    writeEdgeArrowPose(0, 1.5, 0, 0, 0, -1, 2, 1.5, 0, 0.7, 0.24, out);
    expect(out.z).toBeCloseTo(-0.7, 5);
    expect(out.x).toBeGreaterThan(0.2);
    expect(out.roll).toBeCloseTo(0, 5);
  });
});
