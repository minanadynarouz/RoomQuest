import { describe, expect, it } from 'vitest';
import {
  createDwellState,
  DWELL_COOLDOWN_MS,
  DWELL_HIDE_MS,
  DWELL_MS,
  resetDwell,
  tickDwell,
} from './dwell-timer.js';

describe('tickDwell', () => {
  it('fires after 1 s of continuous looking', () => {
    const state = createDwellState();
    expect(tickDwell(state, 400, true)).toBe(false);
    expect(tickDwell(state, 400, true)).toBe(false);
    expect(tickDwell(state, 200, true)).toBe(true);
    expect(state.showing).toBe(true);
  });

  it('resets progress when the player looks away before 1 s', () => {
    const state = createDwellState();
    tickDwell(state, 800, true);
    expect(tickDwell(state, 16, false)).toBe(false);
    expect(state.elapsedMs).toBe(0);
    expect(tickDwell(state, DWELL_MS - 1, true)).toBe(false);
  });

  it('does not re-fire during cooldown (no flicker)', () => {
    const state = createDwellState();
    tickDwell(state, DWELL_MS, true);
    expect(state.showing).toBe(true);
    tickDwell(state, DWELL_HIDE_MS, false);
    expect(state.showing).toBe(false);
    expect(tickDwell(state, DWELL_MS, true)).toBe(false);
    tickDwell(state, DWELL_COOLDOWN_MS, false);
    expect(tickDwell(state, DWELL_MS, true)).toBe(true);
  });

  it('keeps the hint up briefly after a glance away', () => {
    const state = createDwellState();
    tickDwell(state, DWELL_MS, true);
    expect(tickDwell(state, DWELL_HIDE_MS - 1, false)).toBe(true);
    expect(tickDwell(state, 2, false)).toBe(false);
  });

  it('resetDwell clears the machine', () => {
    const state = createDwellState();
    tickDwell(state, DWELL_MS, true);
    resetDwell(state);
    expect(state.showing).toBe(false);
    expect(state.elapsedMs).toBe(0);
  });
});
