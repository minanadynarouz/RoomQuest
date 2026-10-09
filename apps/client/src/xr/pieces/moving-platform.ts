import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { box, mergePainted, type PieceFootprint } from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.18 × 0.12 m, height 0.04 m. Rail along X. */
export const MOVING_PLATFORM_FOOTPRINT: PieceFootprint = {
  width: 0.18,
  depth: 0.12,
  height: 0.04,
};

export function createMovingPlatformGeometry(
  palette: ToyPalette
): BufferGeometry {
  return mergePainted([
    box(0.18, 0.008, 0.02, 0, 0.004, 0.03, palette.dark),
    box(0.18, 0.008, 0.02, 0, 0.004, -0.03, palette.dark),
    box(0.12, 0.02, 0.1, 0, 0.026, 0, palette.primary),
    box(0.02, 0.012, 0.1, -0.055, 0.022, 0, palette.secondary),
    box(0.02, 0.012, 0.1, 0.055, 0.022, 0, palette.secondary),
  ]);
}

export function createMovingPlatform(kit: GreyboxKit): Object3D {
  return kit.createMeshPiece('moving_platform', MOVING_PLATFORM_FOOTPRINT);
}
