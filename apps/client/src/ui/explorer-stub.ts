/**
 * Placeholder explorer until X-05 lands. Dialogue billboards above this.
 */

import { Color, Mesh, SphereGeometry, type Object3D } from '@iwsdk/core';
import { paint } from '../xr/pieces/geometry.js';
import { sharedVertexColorMaterial } from '../xr/pieces/shared-material.js';

export const EXPLORER_STUB_NAME = 'explorer-stub';

export function createExplorerStub(): Object3D {
  const geometry = paint(new SphereGeometry(0.045, 8, 6), new Color(0xe8a87c));
  const mesh = new Mesh(geometry, sharedVertexColorMaterial());
  mesh.name = EXPLORER_STUB_NAME;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
