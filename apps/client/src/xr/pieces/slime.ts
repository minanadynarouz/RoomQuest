import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { box, mergePainted, sphere, type PieceFootprint } from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.10 × 0.10 m, height 0.07 m. Squishy blob, 10+ friendly. */
export const SLIME_FOOTPRINT: PieceFootprint = {
  width: 0.1,
  depth: 0.1,
  height: 0.07,
};

export function createSlimeGeometry(palette: ToyPalette): BufferGeometry {
  const body = sphere(0.045, 0, 0.03, 0, palette.primary, 8, 6);
  body.scale(1, 0.7, 1);
  return mergePainted([
    body,
    box(0.012, 0.014, 0.008, -0.016, 0.05, 0.028, palette.dark),
    box(0.012, 0.014, 0.008, 0.016, 0.05, 0.028, palette.dark),
    box(0.008, 0.008, 0.008, -0.016, 0.054, 0.032, palette.accent),
    box(0.008, 0.008, 0.008, 0.016, 0.054, 0.032, palette.accent),
    box(0.03, 0.006, 0.006, 0, 0.028, 0.04, palette.dark),
  ]);
}

export function createSlime(kit: GreyboxKit): Object3D {
  return kit.createMeshPiece('slime', SLIME_FOOTPRINT);
}
