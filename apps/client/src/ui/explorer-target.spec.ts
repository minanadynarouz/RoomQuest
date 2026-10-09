import { describe, expect, it, beforeEach } from 'vitest';
import {
  asExplorerTarget,
  getExplorerTarget,
  resetExplorerTarget,
  setExplorerTarget,
  setFallbackExplorerTarget,
  type ExplorerVec3,
} from './explorer-target.js';

function fake(x: number, y: number, z: number) {
  return {
    getWorldPosition(out: ExplorerVec3): ExplorerVec3 {
      out.x = x;
      out.y = y;
      out.z = z;
      return out;
    },
  };
}

describe('ExplorerTarget registry', () => {
  beforeEach(() => {
    resetExplorerTarget();
  });

  it('lets X-05 replace the F-04 stub without HudSystem changes', () => {
    setFallbackExplorerTarget(asExplorerTarget(fake(0, 1, -1)));
    const out = { x: 0, y: 0, z: 0 };
    getExplorerTarget()?.getWorldPosition(out);
    expect(out).toEqual({ x: 0, y: 1, z: -1 });

    setExplorerTarget(fake(2, 0.4, 3));
    getExplorerTarget()?.getWorldPosition(out);
    expect(out).toEqual({ x: 2, y: 0.4, z: 3 });

    setExplorerTarget(null);
    getExplorerTarget()?.getWorldPosition(out);
    expect(out).toEqual({ x: 0, y: 1, z: -1 });
  });
});
