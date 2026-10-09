import { describe, expect, it } from 'vitest';
import { Mesh } from '@iwsdk/core';
import { createExplorerModel } from '../explorer/model.js';
import { createGreyboxKit, createPiece } from './index.js';
import { sharedVertexColorMaterial } from './shared-material.js';

describe('sharedVertexColorMaterial', () => {
  it('is a singleton MeshStandardMaterial with vertex colours', () => {
    const a = sharedVertexColorMaterial();
    const b = sharedVertexColorMaterial();
    expect(a).toBe(b);
    expect(a.vertexColors).toBe(true);
  });

  it('is shared by the greybox kit and the explorer', () => {
    const kit = createGreyboxKit('forest');
    const explorer = createExplorerModel();
    const shrine = createPiece('crystal_shrine', kit);
    expect(kit.material).toBe(sharedVertexColorMaterial());
    let explorerMat: unknown;
    explorer.traverse((obj) => {
      if (obj instanceof Mesh) explorerMat = obj.material;
    });
    let shrineMat: unknown;
    shrine.traverse((obj) => {
      if (obj instanceof Mesh) shrineMat = obj.material;
    });
    expect(explorerMat).toBe(kit.material);
    expect(shrineMat).toBe(kit.material);
    kit.dispose();
    expect(sharedVertexColorMaterial()).toBe(kit.material);
  });
});
