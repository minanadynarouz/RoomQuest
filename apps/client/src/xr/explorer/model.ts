import { Color, Group, Mesh, type Object3D } from '@iwsdk/core';
import { box, mergePainted } from '../pieces/geometry.js';
import { sharedVertexColorMaterial } from '../pieces/shared-material.js';

export const EXPLORER_NAME = 'explorer';

const BODY = new Color(0xe8a87c);
const CLOTH = new Color(0x3d6b4f);
const DARK = new Color(0x2a4030);
const ACCENT = new Color(0xe8d48a);

/**
 * Small greybox explorer. Origin at the feet so it sits on a surface top.
 */
export function createExplorerModel(): Object3D {
  const geometry = mergePainted([
    box(0.046, 0.05, 0.028, 0, 0.055, 0, CLOTH),
    box(0.03, 0.03, 0.03, 0, 0.1, 0.002, BODY),
    box(0.012, 0.038, 0.012, -0.012, 0.019, 0, DARK),
    box(0.012, 0.038, 0.012, 0.012, 0.019, 0, DARK),
    box(0.01, 0.028, 0.01, -0.03, 0.06, 0, BODY),
    box(0.01, 0.028, 0.01, 0.03, 0.06, 0, BODY),
    box(0.008, 0.008, 0.008, -0.008, 0.108, 0.014, ACCENT),
    box(0.008, 0.008, 0.008, 0.008, 0.108, 0.014, ACCENT),
  ]);
  const mesh = new Mesh(geometry, sharedVertexColorMaterial());
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'explorer-mesh';
  const root = new Group();
  root.name = EXPLORER_NAME;
  root.add(mesh);
  return root;
}
