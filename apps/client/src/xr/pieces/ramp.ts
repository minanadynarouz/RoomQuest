import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { box, mergePainted, type PieceFootprint } from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.10 × 0.24 m, height 0.08 m. Run along Z, rise toward +Z. */
export const RAMP_FOOTPRINT: PieceFootprint = {
  width: 0.1,
  depth: 0.24,
  height: 0.08,
};

export function createRampGeometry(palette: ToyPalette): BufferGeometry {
  const slope = -Math.atan2(0.07, 0.2);
  const deck = box(0.09, 0.016, 0.22, 0, 0.04, 0, palette.primary);
  deck.rotateX(slope);
  const base = box(0.1, 0.012, 0.24, 0, 0.006, 0, palette.dark);
  const railL = box(0.01, 0.03, 0.2, -0.045, 0.04, 0, palette.secondary);
  railL.rotateX(slope);
  const railR = box(0.01, 0.03, 0.2, 0.045, 0.04, 0, palette.secondary);
  railR.rotateX(slope);
  return mergePainted([base, deck, railL, railR]);
}

export function createRamp(kit: GreyboxKit): Object3D {
  return kit.createMeshPiece('ramp', RAMP_FOOTPRINT);
}
