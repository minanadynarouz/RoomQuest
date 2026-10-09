import { Group, Mesh, type BufferGeometry, type Object3D } from '@iwsdk/core';
import { box, mergePainted, type PieceFootprint } from './geometry.js';
import type { ToyPalette } from './palette.js';
import type { GreyboxKit } from './kit.js';

/** Footprint: 0.12 × 0.04 m, height 0.11 m. Bars in the XZ plane, facing Z. */
export const GATE_FOOTPRINT: PieceFootprint = {
  width: 0.12,
  depth: 0.04,
  height: 0.11,
};

/** Posts + lintel. Cached as `kit.geometry('gate')`. */
export function createGateGeometry(palette: ToyPalette): BufferGeometry {
  return mergePainted([
    box(0.018, 0.1, 0.018, -0.05, 0.05, 0, palette.dark),
    box(0.018, 0.1, 0.018, 0.05, 0.05, 0, palette.dark),
    box(0.12, 0.016, 0.018, 0, 0.102, 0, palette.secondary),
  ]);
}

export function createGateLeafGeometry(palette: ToyPalette): BufferGeometry {
  return mergePainted([
    box(0.008, 0.08, 0.008, -0.02, 0.05, 0, palette.primary),
    box(0.008, 0.08, 0.008, 0.02, 0.05, 0, palette.primary),
    box(0.09, 0.008, 0.008, 0, 0.07, 0, palette.accent),
  ]);
}

export function createGate(kit: GreyboxKit): Object3D {
  const root = new Group();
  root.name = 'gate';
  root.userData.footprint = GATE_FOOTPRINT;
  root.userData.piece = 'gate';

  const frame = new Mesh(kit.geometry('gate'), kit.material);
  frame.name = 'gate-frame';
  frame.castShadow = false;
  frame.receiveShadow = false;
  root.add(frame);

  const leaf = new Group();
  leaf.name = 'gate-leaf';
  const bars = new Mesh(
    kit.cachedGeometry('gate-leaf', createGateLeafGeometry),
    kit.material
  );
  bars.name = 'gate-bars';
  bars.castShadow = false;
  bars.receiveShadow = false;
  leaf.add(bars);
  root.add(leaf);
  root.userData.leaf = leaf;
  return root;
}
