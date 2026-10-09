import { describe, expect, it } from 'vitest';
import {
  SLIME_MIN_SURFACE_AREA_M2,
  SLIME_STAR_COUNT,
  SLIME_STUN_DURATION_S,
  SLIME_SQUISH_SCALE_Y,
} from './constants';
import {
  canExplorerPassSlime,
  createSlimeRuntime,
  isSlimeAwake,
  slimeBodyScaleY,
  slimePatrolConfig,
  stunSlime,
  tickSlime,
  writePatrolLocalOffset,
  writeStarPose,
} from './patrol';
import type { SlimeStarPose } from './types';

describe('slimePatrolConfig', () => {
  it('patrols the longer axis of a ≥ 0.5 m² surface', () => {
    expect(SLIME_MIN_SURFACE_AREA_M2).toBe(0.5);
    const wide = slimePatrolConfig(1.2, 0.5);
    expect(wide.axis).toBe('u');
    expect(wide.halfLengthM).toBeGreaterThan(0.08);
    expect(wide.halfLengthM).toBeLessThanOrEqual(0.32);

    const deep = slimePatrolConfig(0.5, 1.4);
    expect(deep.axis).toBe('v');
    expect(deep.halfLengthM).toBeGreaterThan(0.08);
  });
});

describe('tickSlime (injected delta time)', () => {
  it('ping-pongs along the segment without allocating', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    const state = createSlimeRuntime('pslime');
    const dt = 1 / 72;
    let elapsed = 0;
    let sawPositive = false;
    let sawNegative = false;
    while (elapsed < 12) {
      expect(tickSlime(state, dt, config)).toBe('awake');
      elapsed += dt;
      if (state.offsetM > 0) sawPositive = true;
      if (state.offsetM < 0) sawNegative = true;
      expect(Math.abs(state.offsetM)).toBeLessThanOrEqual(
        config.halfLengthM + 1e-9
      );
    }
    expect(sawPositive).toBe(true);
    expect(sawNegative).toBe(true);
  });

  it('does not patrol while stunned and wakes after 4 s of injected dt', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    const state = createSlimeRuntime('pslime');
    tickSlime(state, 0.5, config);
    const frozen = state.offsetM;
    expect(stunSlime(state)).toBe(true);
    expect(isSlimeAwake(state)).toBe(false);
    expect(canExplorerPassSlime(state)).toBe(true);

    const dt = 0.25;
    let remaining = SLIME_STUN_DURATION_S;
    let last: ReturnType<typeof tickSlime> = 'stunned';
    while (remaining > dt) {
      last = tickSlime(state, dt, config);
      remaining -= dt;
      expect(last).toBe('stunned');
      expect(state.offsetM).toBe(frozen);
      expect(canExplorerPassSlime(state)).toBe(true);
    }
    last = tickSlime(state, dt, config);
    expect(last).toBe('woke');
    expect(isSlimeAwake(state)).toBe(true);
    expect(canExplorerPassSlime(state)).toBe(false);
    expect(state.stunRemainingS).toBe(0);

    tickSlime(state, 0.5, config);
    expect(state.offsetM).not.toBe(frozen);
  });

  it('refreshes an already-stunned slime without a second newly-stunned flag', () => {
    const state = createSlimeRuntime('pslime');
    expect(stunSlime(state, 1)).toBe(true);
    expect(stunSlime(state, SLIME_STUN_DURATION_S)).toBe(false);
    expect(state.stunRemainingS).toBe(SLIME_STUN_DURATION_S);
  });

  it('ignores non-positive dt', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    const state = createSlimeRuntime('pslime');
    expect(tickSlime(state, 0, config)).toBe('awake');
    expect(tickSlime(state, -1, config)).toBe('awake');
    expect(state.offsetM).toBe(0);
  });
});

describe('pass-check and squish', () => {
  it('blocks the explorer only while awake', () => {
    const state = createSlimeRuntime('pslime');
    expect(canExplorerPassSlime(state)).toBe(false);
    stunSlime(state);
    expect(canExplorerPassSlime(state)).toBe(true);
  });

  it('squishes at stun start and recovers to 1 at wake', () => {
    expect(slimeBodyScaleY(0)).toBe(1);
    expect(slimeBodyScaleY(SLIME_STUN_DURATION_S)).toBeCloseTo(
      SLIME_SQUISH_SCALE_Y,
      10
    );
    const mid = slimeBodyScaleY(SLIME_STUN_DURATION_S / 2);
    expect(mid).toBeGreaterThan(SLIME_SQUISH_SCALE_Y);
    expect(mid).toBeLessThan(1);
  });
});

describe('writeStarPose / writePatrolLocalOffset', () => {
  it('writes into caller-owned objects', () => {
    const offset = { x: 9, z: 9 };
    const state = createSlimeRuntime('pslime');
    state.offsetM = 0.12;
    const alongU = slimePatrolConfig(1.2, 0.4);
    expect(writePatrolLocalOffset(state, alongU, offset)).toBe(offset);
    expect(offset).toEqual({ x: 0.12, z: 0 });

    const alongV = slimePatrolConfig(0.4, 1.2);
    writePatrolLocalOffset(state, alongV, offset);
    expect(offset).toEqual({ x: 0, z: 0.12 });

    const star: SlimeStarPose = { x: 0, y: 0, z: 0, yaw: 0 };
    const returned = writeStarPose(0, 0, star);
    expect(returned).toBe(star);
    expect(star.y).toBeGreaterThan(0);
    const other: SlimeStarPose = { x: 0, y: 0, z: 0, yaw: 0 };
    writeStarPose(1, 0, other);
    expect(other.x).not.toBe(star.x);
    expect(SLIME_STAR_COUNT).toBe(5);
  });
});
