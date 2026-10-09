import { describe, expect, it } from 'vitest';
import {
  EXPLORER_OUT_OF_VIEW_DEG,
  isExplorerOutOfView,
} from './out-of-view.js';

describe('isExplorerOutOfView', () => {
  it('is 60 degrees', () => {
    expect(EXPLORER_OUT_OF_VIEW_DEG).toBe(60);
  });

  it('is false when the explorer is straight ahead', () => {
    expect(isExplorerOutOfView([0, 1.6, 0], [0, 0, -1], [0, 1.2, -1.5])).toBe(
      false
    );
  });

  it('is true when the explorer is behind the camera', () => {
    expect(isExplorerOutOfView([0, 1.6, 0], [0, 0, -1], [0, 1.6, 1])).toBe(
      true
    );
  });

  it('is true just beyond 60 degrees and false just inside', () => {
    // Forward −Z. A point at 61° in XZ: tan(61°) ≈ 1.804.
    expect(isExplorerOutOfView([0, 0, 0], [0, 0, -1], [1.804, 0, -1])).toBe(
      true
    );
    // 45° is inside the cone.
    expect(isExplorerOutOfView([0, 0, 0], [0, 0, -1], [1, 0, -1])).toBe(false);
  });
});
