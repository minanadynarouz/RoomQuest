import { describe, expect, it } from 'vitest';
import { isXrHiddenOrBlurred } from './visibility-pause.js';

describe('isXrHiddenOrBlurred', () => {
  it('treats WebXR hidden and visible-blurred as pause', () => {
    expect(isXrHiddenOrBlurred('hidden')).toBe(true);
    expect(isXrHiddenOrBlurred('visible-blurred')).toBe(true);
    expect(isXrHiddenOrBlurred('VisibleBlurred')).toBe(true);
  });

  it('does not pause visible or 2D non-immersive', () => {
    expect(isXrHiddenOrBlurred('visible')).toBe(false);
    expect(isXrHiddenOrBlurred('Visible')).toBe(false);
    expect(isXrHiddenOrBlurred('NonImmersive')).toBe(false);
    expect(isXrHiddenOrBlurred(undefined)).toBe(false);
  });
});
