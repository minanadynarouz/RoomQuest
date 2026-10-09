import { describe, expect, it } from 'vitest';
import { copyVec3 } from './SurfaceGraphSystem.js';

describe('copyVec3', () => {
  it('copies a finite xyz view', () => {
    expect(copyVec3({ 0: 1, 1: 0.5, 2: -2 })).toEqual([1, 0.5, -2]);
    expect(copyVec3([0, 1.2, 3])).toEqual([0, 1.2, 3]);
  });

  it('returns undefined for missing or non-finite components', () => {
    expect(copyVec3(undefined)).toBeUndefined();
    expect(copyVec3(null)).toBeUndefined();
    expect(copyVec3({ 0: 1, 1: 2 })).toBeUndefined();
    expect(copyVec3([1, Number.NaN, 0])).toBeUndefined();
  });
});
