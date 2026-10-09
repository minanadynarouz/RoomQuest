import { describe, expect, it } from 'vitest';
import {
  angleBetweenDeg,
  checkHudPose,
  HUD_DISTANCE_M,
  HUD_DROP_M,
  HUD_FOLLOW_MAX_ANGLE_DEG,
  HUD_MAX_ANGLE_FROM_FORWARD_DEG,
  HUD_MAX_DISTANCE_M,
  HUD_MIN_DISTANCE_M,
  leashedHudOffset,
} from './placement.js';

describe('HUD placement', () => {
  it('keeps the leashed offset inside the 0.6–1 m / 50° / below-eye envelope', () => {
    const eye: [number, number, number] = [0, 1.5, 0];
    const forward: [number, number, number] = [0, 0, -1];
    const offset = leashedHudOffset();
    const panel: [number, number, number] = [
      eye[0] + offset[0],
      eye[1] + offset[1],
      eye[2] + offset[2],
    ];
    const check = checkHudPose(eye, forward, panel);
    expect(check.ok).toBe(true);
    expect(check.belowEye).toBe(true);
    expect(check.distanceM).toBeGreaterThanOrEqual(HUD_MIN_DISTANCE_M);
    expect(check.distanceM).toBeLessThanOrEqual(HUD_MAX_DISTANCE_M);
    expect(check.angleDeg).toBeLessThanOrEqual(HUD_MAX_ANGLE_FROM_FORWARD_DEG);
    expect(HUD_DISTANCE_M).toBeGreaterThanOrEqual(HUD_MIN_DISTANCE_M);
    expect(HUD_DISTANCE_M).toBeLessThanOrEqual(HUD_MAX_DISTANCE_M);
    expect(HUD_DROP_M).toBeGreaterThan(0);
    expect(HUD_FOLLOW_MAX_ANGLE_DEG).toBeLessThanOrEqual(
      HUD_MAX_ANGLE_FROM_FORWARD_DEG
    );
  });

  it('rejects a panel more than 50° from forward', () => {
    const eye: [number, number, number] = [0, 1.5, 0];
    const forward: [number, number, number] = [0, 0, -1];
    const panel: [number, number, number] = [0.8, 1.4, 0];
    const check = checkHudPose(eye, forward, panel);
    expect(check.angleDeg).toBeGreaterThan(HUD_MAX_ANGLE_FROM_FORWARD_DEG);
    expect(check.ok).toBe(false);
  });

  it('rejects a panel above the eye line', () => {
    const eye: [number, number, number] = [0, 1.5, 0];
    const forward: [number, number, number] = [0, 0, -1];
    const panel: [number, number, number] = [0, 1.7, -0.8];
    const check = checkHudPose(eye, forward, panel);
    expect(check.belowEye).toBe(false);
    expect(check.ok).toBe(false);
  });

  it('measures a right angle as 90°', () => {
    expect(angleBetweenDeg([0, 0, -1], [1, 0, 0])).toBeCloseTo(90, 5);
  });
});
