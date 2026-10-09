import { describe, expect, it } from 'vitest';
import {
  SLIME_GROGGY_SCALE_Y,
  SLIME_GROGGY_STAR_FADE_S,
  SLIME_GROGGY_STAR_MIN_SCALE,
  SLIME_MIN_SURFACE_AREA_M2,
  SLIME_STAR_COUNT,
  SLIME_STUN_DURATION_S,
  SLIME_SQUISH_SCALE_Y,
} from './constants';
import {
  canExplorerPassSlime,
  createSlimeRuntime,
  explorerInSlimePatrolZone,
  isSlimeAwake,
  isSlimeGroggy,
  slimeBodyScaleY,
  slimePatrolConfig,
  slimeStarScale,
  slimeStarsVisible,
  stunSlime,
  tickSlime,
  writePatrolLocalOffset,
  writeSlimeBodyScale,
  writeStarPose,
} from './patrol';
import type {
  SlimeBodyScale,
  SlimeExplorerLocal,
  SlimeStarPose,
} from './types';

const IN_ZONE: SlimeExplorerLocal = { x: 0, y: 0, z: 0 };
const OUT_ZONE: SlimeExplorerLocal = { x: 4, y: 0, z: 4 };

describe('slimePatrolConfig', () => {
  it('patrols the longer axis of a ≥ 0.5 m² surface', () => {
    expect(SLIME_MIN_SURFACE_AREA_M2).toBe(0.5);
    const wide = slimePatrolConfig(1.2, 0.5);
    expect(wide.axis).toBe('u');
    expect(wide.halfLengthM).toBeGreaterThan(0.08);
    expect(wide.halfLengthM).toBeLessThanOrEqual(0.32);
    expect(wide.surfaceWidthM).toBe(1.2);
    expect(wide.surfaceDepthM).toBe(0.5);

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
    expect(isSlimeGroggy(state)).toBe(false);
    expect(canExplorerPassSlime(state)).toBe(false);
    expect(state.stunRemainingS).toBe(0);

    tickSlime(state, 0.5, config);
    expect(state.offsetM).not.toBe(frozen);
  });

  it('stays groggy after slimeWoke until occupancy leaves the patrol zone', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    const state = createSlimeRuntime('pslime');
    tickSlime(state, 0.5, config);
    const frozen = state.offsetM;
    stunSlime(state);

    const occupancy: SlimeExplorerLocal = { x: 0.05, y: 0, z: 0.02 };
    const dt = 0.5;
    let last: ReturnType<typeof tickSlime> = 'stunned';
    let remaining = SLIME_STUN_DURATION_S;
    while (remaining > dt) {
      last = tickSlime(state, dt, config, occupancy);
      remaining -= dt;
      expect(last).toBe('stunned');
    }
    last = tickSlime(state, dt, config, occupancy);
    expect(last).toBe('woke');
    expect(isSlimeGroggy(state)).toBe(true);
    expect(isSlimeAwake(state)).toBe(false);
    expect(canExplorerPassSlime(state)).toBe(true);
    expect(slimeBodyScaleY(state)).toBe(SLIME_GROGGY_SCALE_Y);
    expect(slimeStarsVisible(state)).toBe(true);

    last = tickSlime(state, dt, config, occupancy);
    expect(last).toBe('groggy');
    expect(state.offsetM).toBe(frozen);
    expect(state.groggyElapsedS).toBeCloseTo(dt, 10);

    occupancy.x = 4;
    occupancy.z = 4;
    last = tickSlime(state, dt, config, occupancy);
    expect(last).toBe('cleared');
    expect(isSlimeGroggy(state)).toBe(false);
    expect(isSlimeAwake(state)).toBe(true);
    expect(canExplorerPassSlime(state)).toBe(false);
    expect(slimeBodyScaleY(state)).toBe(1);

    tickSlime(state, 0.5, config, occupancy);
    expect(state.offsetM).not.toBe(frozen);
  });

  it('clears groggy on the next tick when occupancy is already outside', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    const state = createSlimeRuntime('pslime');
    stunSlime(state);
    tickSlime(state, SLIME_STUN_DURATION_S, config, OUT_ZONE);
    expect(isSlimeGroggy(state)).toBe(true);
    const result = tickSlime(state, 1 / 72, config, OUT_ZONE);
    expect(result).toBe('cleared');
    expect(isSlimeAwake(state)).toBe(true);
  });

  it('refreshes groggy into a new stun without a second newly-stunned flag if still in the 4 s timer', () => {
    const state = createSlimeRuntime('pslime');
    expect(stunSlime(state, 1)).toBe(true);
    expect(stunSlime(state, SLIME_STUN_DURATION_S)).toBe(false);
    expect(state.stunRemainingS).toBe(SLIME_STUN_DURATION_S);
  });

  it('lets a groggy poke start a fresh stun', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    const state = createSlimeRuntime('pslime');
    stunSlime(state);
    tickSlime(state, SLIME_STUN_DURATION_S, config, IN_ZONE);
    expect(isSlimeGroggy(state)).toBe(true);
    expect(stunSlime(state)).toBe(true);
    expect(isSlimeGroggy(state)).toBe(false);
    expect(state.stunRemainingS).toBe(SLIME_STUN_DURATION_S);
  });

  it('ignores non-positive dt', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    const state = createSlimeRuntime('pslime');
    expect(tickSlime(state, 0, config)).toBe('awake');
    expect(tickSlime(state, -1, config)).toBe('awake');
    expect(state.offsetM).toBe(0);
    stunSlime(state);
    expect(tickSlime(state, 0, config)).toBe('stunned');
    tickSlime(state, SLIME_STUN_DURATION_S, config, IN_ZONE);
    expect(tickSlime(state, 0, config, IN_ZONE)).toBe('groggy');
  });
});

describe('pass-check, occupancy, and squish', () => {
  it('blocks the explorer only while awake', () => {
    const state = createSlimeRuntime('pslime');
    expect(canExplorerPassSlime(state)).toBe(false);
    stunSlime(state);
    expect(canExplorerPassSlime(state)).toBe(true);
  });

  it('stays squashed for the whole stun and groggy window', () => {
    const state = createSlimeRuntime('pslime');
    expect(slimeBodyScaleY(state)).toBe(1);
    stunSlime(state);
    expect(slimeBodyScaleY(state)).toBe(SLIME_SQUISH_SCALE_Y);
    state.stunRemainingS = SLIME_STUN_DURATION_S / 2;
    expect(slimeBodyScaleY(state)).toBe(SLIME_SQUISH_SCALE_Y);
    state.stunRemainingS = 0;
    state.groggy = true;
    expect(slimeBodyScaleY(state)).toBe(SLIME_GROGGY_SCALE_Y);
    expect(slimeBodyScaleY(state)).toBeLessThan(1);
    expect(slimeBodyScaleY(state)).toBeGreaterThan(SLIME_SQUISH_SCALE_Y);
  });

  it('writes groggy slump into a caller-owned scale object', () => {
    const state = createSlimeRuntime('pslime');
    const out: SlimeBodyScale = { x: 0, y: 0, z: 0, tiltX: 9 };
    expect(writeSlimeBodyScale(state, out)).toBe(out);
    expect(out).toEqual({ x: 1, y: 1, z: 1, tiltX: 0 });
    stunSlime(state);
    writeSlimeBodyScale(state, out);
    expect(out.y).toBe(SLIME_SQUISH_SCALE_Y);
    expect(out.tiltX).toBe(0);
    state.stunRemainingS = 0;
    state.groggy = true;
    writeSlimeBodyScale(state, out);
    expect(out.y).toBe(SLIME_GROGGY_SCALE_Y);
    expect(out.tiltX).toBeGreaterThan(0);
  });

  it('treats the surface top-face as the patrol zone', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    expect(explorerInSlimePatrolZone(config, IN_ZONE)).toBe(true);
    expect(explorerInSlimePatrolZone(config, { x: 0.4, y: 0, z: 0.1 })).toBe(
      true
    );
    expect(explorerInSlimePatrolZone(config, OUT_ZONE)).toBe(false);
    expect(explorerInSlimePatrolZone(config, { x: 0, y: 1, z: 0 })).toBe(false);
  });
});

describe('groggy star fade (injected dt)', () => {
  it('keeps stars at 1 while stunned and fades them while groggy', () => {
    const config = slimePatrolConfig(1.0, 0.6);
    const state = createSlimeRuntime('pslime');
    expect(slimeStarScale(state)).toBe(0);
    expect(slimeStarsVisible(state)).toBe(false);
    stunSlime(state);
    expect(slimeStarScale(state)).toBe(1);
    tickSlime(state, SLIME_STUN_DURATION_S, config, IN_ZONE);
    expect(slimeStarScale(state)).toBe(1);
    tickSlime(state, SLIME_GROGGY_STAR_FADE_S / 2, config, IN_ZONE);
    const mid = slimeStarScale(state);
    expect(mid).toBeGreaterThan(SLIME_GROGGY_STAR_MIN_SCALE);
    expect(mid).toBeLessThan(1);
    tickSlime(state, SLIME_GROGGY_STAR_FADE_S, config, IN_ZONE);
    expect(slimeStarScale(state)).toBe(SLIME_GROGGY_STAR_MIN_SCALE);
    expect(slimeStarsVisible(state)).toBe(true);
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
