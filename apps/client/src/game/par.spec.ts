/**
 * Par time helper tests - F-02
 */

import { describe, it, expect } from 'vitest';
import { defaultParTimeMs } from './par.js';

describe('defaultParTimeMs', () => {
  it('returns 180000ms (3 minutes)', () => {
    expect(defaultParTimeMs()).toBe(180000);
  });

  it('ignores plan parameter for now (placeholder)', () => {
    const mockPlan = { seed: 'test' };
    expect(defaultParTimeMs(mockPlan)).toBe(180000);
  });

  it('returns consistent value', () => {
    expect(defaultParTimeMs()).toBe(defaultParTimeMs());
  });
});
