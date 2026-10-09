import {
  BoxGeometry,
  Group,
  Mesh,
  type BufferGeometry,
  type Object3D,
} from '@iwsdk/core';
import { SLIME_STAR_COUNT } from '@roomquest/level-core';
import {
  box,
  mergePainted,
  octahedron,
  sphere,
  type PieceFootprint,
} from './geometry.js';
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

/** Merged star used for the stunned orbit (vertex colours, shared geometry). */
export function createSlimeStarGeometry(palette: ToyPalette): BufferGeometry {
  return mergePainted([
    octahedron(0.012, 0, 0.01, 0, palette.accent),
    box(0.004, 0.022, 0.004, 0, 0.01, 0, palette.accent),
    box(0.022, 0.004, 0.004, 0, 0.01, 0, palette.accent),
  ]);
}

export function createSlime(kit: GreyboxKit): Object3D {
  const root = kit.createMeshPiece('slime', SLIME_FOOTPRINT);
  const body = root.children[0];
  if (body) {
    body.name = 'slime-body';
    root.userData.body = body;
  }
  const stars = new Group();
  stars.name = 'slime-stars';
  stars.visible = false;
  const starGeo = kit.cachedGeometry('slime-star', createSlimeStarGeometry);
  for (let i = 0; i < SLIME_STAR_COUNT; i += 1) {
    const star = new Mesh(starGeo, kit.material);
    star.name = `slime-star-${String(i)}`;
    star.castShadow = false;
    star.receiveShadow = false;
    stars.add(star);
  }
  root.add(stars);
  root.userData.stars = stars;

  const hitGeo = kit.cachedGeometry('slime-hit', () => {
    const geo = new BoxGeometry(0.2, 0.14, 0.2);
    geo.translate(0, 0.07, 0);
    return geo;
  });
  const hit = new Mesh(hitGeo, kit.interactHitMaterial());
  hit.name = 'slime-hit';
  hit.visible = false;
  hit.castShadow = false;
  hit.receiveShadow = false;
  hit.pointerEvents = 'auto';
  root.add(hit);
  root.userData.hit = hit;
  return root;
}
