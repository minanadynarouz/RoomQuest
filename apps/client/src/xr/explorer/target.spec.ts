import { describe, expect, it } from 'vitest';
import { Vector3 } from '@iwsdk/core';
import type { ExplorerTarget } from './target.js';

describe('ExplorerTarget', () => {
  it('exposes object3D and a reusable world-position write', () => {
    const object3D = { position: { x: 0.4, y: 0.1, z: -1.2 } };
    const target: ExplorerTarget = {
      object3D: object3D as ExplorerTarget['object3D'],
      worldPosition: (out) => {
        out.x = object3D.position.x;
        out.y = object3D.position.y;
        out.z = object3D.position.z;
        return out;
      },
    };

    const out = new Vector3();
    target.worldPosition(out);
    expect(target.object3D).toBe(object3D);
    expect(out.x).toBe(0.4);
    expect(out.y).toBe(0.1);
    expect(out.z).toBe(-1.2);
  });
});
