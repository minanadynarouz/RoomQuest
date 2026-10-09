import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { box, mergePainted, type PieceFootprint } from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.40 × 0.07 m, height 0.025 m. Length along X. Origin at board floor. */
export const PLANK_BRIDGE_FOOTPRINT: PieceFootprint = {
  width: 0.4,
  depth: 0.07,
  height: 0.025,
};

export function createPlankBridgeGeometry(palette: ToyPalette): BufferGeometry {
  return mergePainted([
    box(0.4, 0.012, 0.055, 0, 0.006, 0, palette.secondary),
    box(0.4, 0.02, 0.008, 0, 0.016, 0.028, palette.dark),
    box(0.4, 0.02, 0.008, 0, 0.016, -0.028, palette.dark),
  ]);
}

export function createPlankBridge(kit: GreyboxKit): Object3D {
  return kit.createInstancedPiece('plank_bridge', PLANK_BRIDGE_FOOTPRINT);
}
