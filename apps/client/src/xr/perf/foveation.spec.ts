import { describe, expect, it, vi } from 'vitest';
import { applyFixedFoveation, bindFixedFoveation } from './foveation.js';

describe('applyFixedFoveation', () => {
  it('returns false when the XR host has no setFoveation', () => {
    expect(applyFixedFoveation({})).toBe(false);
    expect(applyFixedFoveation(null)).toBe(false);
  });

  it('calls setFoveation when the API exists', () => {
    const setFoveation = vi.fn();
    expect(applyFixedFoveation({ setFoveation }, 1)).toBe(true);
    expect(setFoveation).toHaveBeenCalledWith(1);
  });

  it('clamps the level to 0..1', () => {
    const setFoveation = vi.fn();
    applyFixedFoveation({ setFoveation }, 4);
    applyFixedFoveation({ setFoveation }, -1);
    expect(setFoveation).toHaveBeenNthCalledWith(1, 1);
    expect(setFoveation).toHaveBeenNthCalledWith(2, 0);
  });
});

describe('bindFixedFoveation', () => {
  it('applies immediately when already presenting and on sessionstart', () => {
    const setFoveation = vi.fn();
    const listeners: (() => void)[] = [];
    const xr = {
      isPresenting: true,
      setFoveation,
      addEventListener: (_type: string, listener: () => void) => {
        listeners.push(listener);
      },
    };
    expect(bindFixedFoveation(xr)).toBe(true);
    expect(setFoveation).toHaveBeenCalledTimes(1);
    listeners[0]?.();
    expect(setFoveation).toHaveBeenCalledTimes(2);
  });

  it('skips when the API is missing', () => {
    expect(bindFixedFoveation({})).toBe(false);
  });
});
