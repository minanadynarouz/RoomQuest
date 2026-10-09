import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { box, mergePainted, type PieceFootprint } from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.12 × 0.04 m, height 0.11 m. Bars in the XZ plane, facing Z. */
export const GATE_FOOTPRINT: PieceFootprint = {
  width: 0.12,
  depth: 0.04,
  height: 0.11,
};

export function createGateGeometry(palette: ToyPalette): BufferGeometry {
  return mergePainted([
    box(0.018, 0.1, 0.018, -0.05, 0.05, 0, palette.dark),
    box(0.018, 0.1, 0.018, 0.05, 0.05, 0, palette.dark),
    box(0.12, 0.016, 0.018, 0, 0.102, 0, palette.secondary),
    box(0.008, 0.08, 0.008, -0.02, 0.05, 0, palette.primary),
    box(0.008, 0.08, 0.008, 0.02, 0.05, 0, palette.primary),
    box(0.09, 0.008, 0.008, 0, 0.07, 0, palette.accent),
  ]);
}

export function createGate(kit: GreyboxKit): Object3D {
  return kit.createMeshPiece('gate', GATE_FOOTPRINT);
}
