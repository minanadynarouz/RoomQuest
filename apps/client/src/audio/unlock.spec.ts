import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAudioContext, isAudioBlocked, resetAudioUnlock, unlockAudio } from './unlock.js';

interface Ctx {
  state: string;
  resume: () => Promise<void>;
}

function setAudioCtor(ctor: (new () => Ctx) | undefined): void {
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    writable: true,
    value: ctor,
  });
  Object.defineProperty(window, 'webkitAudioContext', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

describe('unlockAudio', () => {
  const originalAudio = window.AudioContext;
  const originalWebkit = (
    window as typeof window & { webkitAudioContext?: unknown }
  ).webkitAudioContext;

  beforeEach(() => {
    resetAudioUnlock();
    setAudioCtor(undefined);
  });

  afterEach(() => {
    resetAudioUnlock();
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: originalAudio,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      writable: true,
      value: originalWebkit,
    });
  });

  it('resumes a suspended AudioContext created on the gesture', async () => {
    const ctx: Ctx = {
      state: 'suspended',
      resume: vi.fn(() => {
        ctx.state = 'running';
        return Promise.resolve();
      }),
    };
    setAudioCtor(function AudioContext() {
      return ctx;
    } as unknown as new () => Ctx);

    expect(unlockAudio()).toBe(true);
    expect(ctx.resume).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(getAudioContext()?.state).toBe('running');
    expect(isAudioBlocked()).toBe(false);
  });

  it('fails silently when AudioContext is missing', () => {
    expect(unlockAudio()).toBe(false);
    expect(getAudioContext()).toBeNull();
    expect(isAudioBlocked()).toBe(true);
  });

  it('fails silently when the constructor throws', () => {
    setAudioCtor(function AudioContext() {
      throw new Error('blocked');
    } as unknown as new () => Ctx);

    expect(() => unlockAudio()).not.toThrow();
    expect(unlockAudio()).toBe(false);
    expect(isAudioBlocked()).toBe(true);
  });
});
