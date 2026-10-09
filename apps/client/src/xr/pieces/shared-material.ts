import { MeshStandardMaterial } from '@iwsdk/core';

/**
 * One vertex-colour MeshStandardMaterial for every greybox piece and the
 * explorer. Colours live in geometry, so the material is theme-independent.
 * Process-lifetime singleton: kits must not dispose it.
 */
let vertexColorMaterial: MeshStandardMaterial | null = null;

export function sharedVertexColorMaterial(): MeshStandardMaterial {
  if (!vertexColorMaterial) {
    vertexColorMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.08,
    });
    vertexColorMaterial.name = 'rq-shared-vertex-color';
  }
  return vertexColorMaterial;
}

/** Test helper: drop the singleton so a later call rebuilds it. */
export function resetSharedVertexColorMaterial(): void {
  vertexColorMaterial?.dispose();
  vertexColorMaterial = null;
}
