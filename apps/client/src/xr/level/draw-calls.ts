import { InstancedMesh, Mesh, type Object3D } from '@iwsdk/core';

/**
 * Count draw calls as Mesh + InstancedMesh nodes. InstancedMesh extends Mesh,
 * so it is counted once regardless of instance count.
 */
export function countDrawCalls(root: Object3D): number {
  let count = 0;
  root.traverse((obj) => {
    if (obj instanceof Mesh || obj instanceof InstancedMesh) {
      if (obj.visible) count += 1;
    }
  });
  return count;
}
