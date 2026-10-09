/**
 * Placeholder explorer until X-05 lands. Dialogue billboards above this.
 */

import {
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Object3D,
} from '@iwsdk/core';

export const EXPLORER_STUB_NAME = 'explorer-stub';

export function createExplorerStub(): Object3D {
  const geometry = new SphereGeometry(0.045, 12, 10);
  const material = new MeshStandardMaterial({
    color: 0xe8a87c,
    roughness: 0.7,
    metalness: 0.05,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = EXPLORER_STUB_NAME;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
