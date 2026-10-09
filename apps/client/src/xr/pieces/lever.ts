import type { BufferGeometry, Object3D } from '@iwsdk/core';
import {
  box,
  cylinder,
  mergePainted,
  sphere,
  type PieceFootprint,
} from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.05 × 0.05 m, height 0.09 m. Stick leans toward +Z. */
export const LEVER_FOOTPRINT: PieceFootprint = {
  width: 0.05,
  depth: 0.05,
  height: 0.09,
};

export function createLeverGeometry(palette: ToyPalette): BufferGeometry {
  const stick = cylinder(
    0.006,
    0.006,
    0.07,
    0,
    0.055,
    0.015,
    palette.secondary,
    6
  );
  stick.rotateX(-0.4);
  return mergePainted([
    cylinder(0.022, 0.024, 0.016, 0, 0.008, 0, palette.dark, 8),
    box(0.04, 0.006, 0.04, 0, 0.003, 0, palette.primary),
    stick,
    sphere(0.012, 0, 0.088, 0.03, palette.accent, 8, 6),
  ]);
}

export function createLever(kit: GreyboxKit): Object3D {
  return kit.createMeshPiece('lever', LEVER_FOOTPRINT);
}
