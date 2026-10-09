import { describe, expect, it, beforeEach } from 'vitest';
import { HUD_COPY, ONBOARDING_DURATION_MS, ONBOARDING_STEPS } from '../copy.js';
import {
  beginOnboarding,
  createOnboardingState,
  currentOnboardingLine,
  ONBOARDING_STORAGE_KEY,
  persistOnboardingSeen,
  readOnboardingSeen,
  resetOnboardingMemory,
  skipOnboarding,
  tickOnboarding,
  type OnboardingStorage,
} from './onboarding.js';

function memoryStore(initial: Record<string, string> = {}): OnboardingStorage {
  const data = { ...initial };
  return {
    getItem(key) {
      return data[key] ?? null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

describe('onboarding sequencer', () => {
  beforeEach(() => {
    resetOnboardingMemory();
  });

  it('advances explorer lines across 30 seconds', () => {
    const storage = memoryStore();
    const state = createOnboardingState();
    expect(beginOnboarding(state, storage)).toBe(true);
    expect(currentOnboardingLine(state)).toBe(ONBOARDING_STEPS[0]?.line);
    tickOnboarding(state, 8_000, storage);
    expect(currentOnboardingLine(state)).toBe(ONBOARDING_STEPS[1]?.line);
    tickOnboarding(state, 8_000, storage);
    expect(currentOnboardingLine(state)).toBe(ONBOARDING_STEPS[2]?.line);
    tickOnboarding(state, 8_000, storage);
    expect(currentOnboardingLine(state)).toBe(ONBOARDING_STEPS[3]?.line);
    tickOnboarding(state, ONBOARDING_DURATION_MS, storage);
    expect(state.active).toBe(false);
    expect(currentOnboardingLine(state)).toBeNull();
    expect(readOnboardingSeen(storage)).toBe(true);
  });

  it('is skippable and remembered per device', () => {
    const storage = memoryStore();
    const first = createOnboardingState();
    beginOnboarding(first, storage);
    skipOnboarding(first, storage);
    expect(first.active).toBe(false);
    expect(first.skipped).toBe(true);
    expect(storage.getItem(ONBOARDING_STORAGE_KEY)).toBe('1');

    const second = createOnboardingState();
    expect(beginOnboarding(second, storage)).toBe(false);
    expect(second.active).toBe(false);
    expect(currentOnboardingLine(second)).toBeNull();
  });

  it('falls back to in-memory when storage throws', () => {
    const broken: OnboardingStorage = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    };
    const first = createOnboardingState();
    expect(beginOnboarding(first, broken)).toBe(true);
    persistOnboardingSeen(broken);
    const second = createOnboardingState();
    expect(beginOnboarding(second, broken)).toBe(false);
  });

  it('uses the copy fallback if a step is missing', () => {
    const state = createOnboardingState();
    state.active = true;
    expect(currentOnboardingLine(state, [])).toBe(HUD_COPY.onboardingFallback);
  });
});
