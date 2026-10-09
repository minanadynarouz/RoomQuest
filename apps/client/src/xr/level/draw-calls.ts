import { InstancedMesh, Mesh, type Object3D } from '@iwsdk/core';

/** X-10 / NFR-1: visible Mesh + InstancedMesh draw calls. */
export const DRAW_CALL_BUDGET = 100;
/** X-10 / NFR-1: visible triangles (instanced = geo tris × instance count). */
export const TRIANGLE_BUDGET = 200_000;

/**
 * Count draw calls as Mesh + InstancedMesh nodes. InstancedMesh extends Mesh,
 * so it is counted once regardless of instance count.
 */
export function countDrawCalls(root: Object3D): number {
  let count = 0;
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      if (obj.visible) count += 1;
    }
  });
  return count;
}

/**
 * Visible triangle count. InstancedMesh contributes geometry triangles ×
 * `mesh.count` (the live instance count, not the pool capacity).
 */
export function countTriangles(root: Object3D): number {
  let triangles = 0;
  root.traverse((obj) => {
    if (!(obj instanceof Mesh) || !obj.visible) return;
    const geo = obj.geometry;
    const index = geo.index;
    const perInstance = index
      ? index.count / 3
      : geo.getAttribute('position').count / 3;
    if (obj instanceof InstancedMesh) {
      triangles += perInstance * obj.count;
      return;
    }
    triangles += perInstance;
  });
  return triangles;
}
