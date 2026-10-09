import type { BufferGeometry, Object3D } from '@iwsdk/core';
import {
  cylinder,
  mergePainted,
  torus,
  type PieceFootprint,
} from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.12 × 0.04 m, height 0.14 m. Ring stands in the XY plane, facing Z. */
export const PORTAL_FOOTPRINT: PieceFootprint = {
  width: 0.12,
  depth: 0.04,
  height: 0.14,
};

export function createPortalGeometry(palette: ToyPalette): BufferGeometry {
  const ring = torus(0.045, 0.01, 0, 0.07, 0, palette.accent, 12, 8);
  ring.rotateY(Math.PI / 2);
  const inner = cylinder(0.032, 0.032, 0.008, 0, 0.07, 0, palette.dark, 12);
  inner.rotateX(Math.PI / 2);
  return mergePainted([
    cylinder(0.02, 0.024, 0.016, 0, 0.008, 0, palette.secondary, 8),
    ring,
    inner,
  ]);
}

export function createPortal(kit: GreyboxKit): Object3D {
  return kit.createMeshPiece('portal', PORTAL_FOOTPRINT);
}
