/**
 * 30-second first-run onboarding sequencer (F-06).
 * Shown once per device (localStorage) with an in-memory fallback.
 * Does not block play — the caller keeps the beat chip visible.
 */

import {
  HUD_COPY,
  ONBOARDING_DURATION_MS,
  ONBOARDING_STEPS,
} from '../copy.js';

export const ONBOARDING_STORAGE_KEY = 'rq.onboarding.v1';
export const ONBOARDING_SEEN_VALUE = '1';

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OnboardingState {
  elapsedMs: number;
  active: boolean;
  skipped: boolean;
}

export function createOnboardingState(): OnboardingState {
  return { elapsedMs: 0, active: false, skipped: false };
}

let memorySeen = false;

export function resetOnboardingMemory(): void {
  memorySeen = false;
}

export function readOnboardingSeen(storage: OnboardingStorage | null): boolean {
  if (memorySeen) return true;
  if (!storage) return false;
  try {
    return storage.getItem(ONBOARDING_STORAGE_KEY) === ONBOARDING_SEEN_VALUE;
  } catch {
    return memorySeen;
  }
}

export function persistOnboardingSeen(storage: OnboardingStorage | null): void {
  memorySeen = true;
  if (!storage) return;
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_SEEN_VALUE);
  } catch {
    // Private mode / quota: the in-memory flag still prevents a replay.
  }
}

export function beginOnboarding(
  state: OnboardingState,
  storage: OnboardingStorage | null
): boolean {
  if (readOnboardingSeen(storage)) {
    state.active = false;
    state.skipped = false;
    state.elapsedMs = 0;
    return false;
  }
  state.active = true;
  state.skipped = false;
  state.elapsedMs = 0;
  return true;
}

export function skipOnboarding(
  state: OnboardingState,
  storage: OnboardingStorage | null
): void {
  if (!state.active) return;
  state.active = false;
  state.skipped = true;
  persistOnboardingSeen(storage);
}

export function tickOnboarding(
  state: OnboardingState,
  dtMs: number,
  storage: OnboardingStorage | null,
  durationMs = ONBOARDING_DURATION_MS
): void {
  if (!state.active) return;
  const step = dtMs > 0 ? dtMs : 0;
  state.elapsedMs += step;
  if (state.elapsedMs >= durationMs) {
    state.active = false;
    persistOnboardingSeen(storage);
  }
}

export function currentOnboardingLine(
  state: OnboardingState,
  steps: readonly { atMs: number; line: string }[] = ONBOARDING_STEPS
): string | null {
  if (!state.active) return null;
  let line: string = HUD_COPY.onboardingFallback;
  for (const step of steps) {
    if (state.elapsedMs >= step.atMs) line = step.line;
  }
  return line;
}
