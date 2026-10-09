import type { BufferGeometry, Object3D } from '@iwsdk/core';
import {
  box,
  mergePainted,
  octahedron,
  type PieceFootprint,
} from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.10 × 0.10 m, height 0.16 m. Origin at the plinth floor. */
export const CRYSTAL_SHRINE_FOOTPRINT: PieceFootprint = {
  width: 0.1,
  depth: 0.1,
  height: 0.16,
};

export function createCrystalShrineGeometry(
  palette: ToyPalette
): BufferGeometry {
  return mergePainted([
    box(0.1, 0.02, 0.1, 0, 0.01, 0, palette.dark),
    box(0.07, 0.02, 0.07, 0, 0.03, 0, palette.secondary),
    box(0.03, 0.05, 0.03, 0, 0.065, 0, palette.primary),
    octahedron(0.035, 0, 0.125, 0, palette.accent),
  ]);
}

export function createCrystalShrine(kit: GreyboxKit): Object3D {
  return kit.createMeshPiece('crystal_shrine', CRYSTAL_SHRINE_FOOTPRINT);
}
