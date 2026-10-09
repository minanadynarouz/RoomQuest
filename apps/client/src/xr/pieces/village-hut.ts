import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { box, cone, mergePainted, type PieceFootprint } from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.14 × 0.14 m, height 0.12 m. Origin at the floor of the plinth. */
export const VILLAGE_HUT_FOOTPRINT: PieceFootprint = {
  width: 0.14,
  depth: 0.14,
  height: 0.12,
};

export function createVillageHutGeometry(palette: ToyPalette): BufferGeometry {
  return mergePainted([
    box(0.14, 0.02, 0.14, 0, 0.01, 0, palette.dark),
    box(0.12, 0.06, 0.12, 0, 0.05, 0, palette.primary),
    cone(0.1, 0.06, 0, 0.11, 0, palette.secondary, 4),
    box(0.03, 0.04, 0.012, 0, 0.04, 0.06, palette.dark),
    box(0.012, 0.012, 0.012, 0.03, 0.07, 0.061, palette.accent),
  ]);
}

export function createVillageHut(kit: GreyboxKit): Object3D {
  return kit.createMeshPiece('village_hut', VILLAGE_HUT_FOOTPRINT);
}
