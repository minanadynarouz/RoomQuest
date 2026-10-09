/**
 * 1 s head-gaze dwell with cooldown so the hint does not flicker (F-06).
 * Mutates a reusable state object; no per-tick allocation.
 */

export const DWELL_MS = 1000;
export const DWELL_COOLDOWN_MS = 2500;
export const DWELL_HIDE_MS = 250;

export interface DwellState {
  elapsedMs: number;
  cooldownMs: number;
  hideMs: number;
  showing: boolean;
}

export function createDwellState(): DwellState {
  return { elapsedMs: 0, cooldownMs: 0, hideMs: 0, showing: false };
}

export function resetDwell(state: DwellState): void {
  state.elapsedMs = 0;
  state.cooldownMs = 0;
  state.hideMs = 0;
  state.showing = false;
}

/**
 * Advance the dwell machine.
 * @returns whether the hint should be visible this tick
 */
export function tickDwell(
  state: DwellState,
  dtMs: number,
  looking: boolean,
  dwellMs = DWELL_MS,
  cooldownMs = DWELL_COOLDOWN_MS,
  hideMs = DWELL_HIDE_MS
): boolean {
  const step = dtMs > 0 ? dtMs : 0;
  if (state.cooldownMs > 0) {
    state.cooldownMs -= step;
    if (state.cooldownMs < 0) state.cooldownMs = 0;
  }

  if (looking) {
    state.hideMs = 0;
    if (state.showing) return true;
    if (state.cooldownMs > 0) {
      state.elapsedMs = 0;
      return false;
    }
    state.elapsedMs += step;
    if (state.elapsedMs >= dwellMs) {
      state.showing = true;
      state.elapsedMs = 0;
      state.cooldownMs = cooldownMs;
      return true;
    }
    return false;
  }

  state.elapsedMs = 0;
  if (!state.showing) return false;
  state.hideMs += step;
  if (state.hideMs >= hideMs) {
    state.showing = false;
    state.hideMs = 0;
    return false;
  }
  return true;
}
