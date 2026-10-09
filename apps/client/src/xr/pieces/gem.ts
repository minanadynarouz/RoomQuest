import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { mergePainted, octahedron, type PieceFootprint } from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.04 × 0.04 m, height 0.05 m. Origin at the crystal base. */
export const GEM_FOOTPRINT: PieceFootprint = {
  width: 0.04,
  depth: 0.04,
  height: 0.05,
};

export function createGemGeometry(palette: ToyPalette): BufferGeometry {
  return mergePainted([
    octahedron(0.018, 0, 0.02, 0, palette.accent),
    octahedron(0.01, 0, 0.02, 0, palette.secondary),
  ]);
}

export function createGem(kit: GreyboxKit): Object3D {
  return kit.createInstancedPiece('gem', GEM_FOOTPRINT);
}
