import {
  Group,
  InstancedMesh,
  Matrix4,
  type BufferGeometry,
  type Material,
  type Object3D,
} from '@iwsdk/core';

/**
 * Shared InstancedMesh pool. Proxies are empty Object3Ds whose world
 * matrices are copied into the InstancedMesh in {@link InstancePool.sync}.
 * sync() allocates nothing.
 */
export class InstancePool {
  readonly mesh: InstancedMesh;
  private readonly maxCount: number;
  private readonly proxies: Object3D[] = [];
  private readonly tmpMatrix = new Matrix4();
  private used = 0;

  constructor(geometry: BufferGeometry, material: Material, maxCount: number) {
    this.maxCount = maxCount;
    this.mesh = new InstancedMesh(geometry, material, maxCount);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrix.identity();
  }

  alloc(): Object3D {
    if (this.used >= this.maxCount) {
      throw new Error(`InstancePool exhausted (${String(this.maxCount)})`);
    }
    const proxy = new Group();
    proxy.userData.instanceIndex = this.used;
    this.proxies.push(proxy);
    this.used += 1;
    this.mesh.count = this.used;
    return proxy;
  }

  sync(): void {
    for (let i = 0; i < this.used; i++) {
      const proxy = this.proxies[i];
      if (!proxy) continue;
      proxy.updateWorldMatrix(true, false);
      this.tmpMatrix.copy(proxy.matrixWorld);
      this.mesh.setMatrixAt(i, this.tmpMatrix);
    }
    this.mesh.visible = this.used > 0;
    if (this.used > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  reset(): void {
    this.proxies.length = 0;
    this.used = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.reset();
    this.mesh.dispose();
  }
}
