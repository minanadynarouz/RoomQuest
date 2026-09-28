import {
  createSystem,
  XRPlane,
  XRMesh,
  Types,
} from '@iwsdk/core';
import type { SurfaceGraph } from '@roomquest/schema';
import type { SurfaceDescriptor } from '@roomquest/level-core';
import { buildSurfaceGraph } from '@roomquest/level-core';

/**
 * SurfaceGraphSystem - Queries XRPlane and XRMesh entities to build a SurfaceGraph
 * 
 * Emits events:
 * - 'graphReady': graph is built and stable
 * - 'noSurfaces': fewer than 2 usable surfaces found
 * 
 * Design Doc §5, Architecture §7
 */
export class SurfaceGraphSystem extends createSystem(
  {
    planes: { required: [XRPlane] },
    meshes: { required: [XRMesh] },
  },
  {
    stabilizationTimeMs: { type: Types.Float32, default: 2500 },
    captureAttempted: { type: Types.Boolean, default: false },
  },
) {
  private graph: SurfaceGraph | null = null;
  private startTime: number = 0;
  private stabilized: boolean = false;
  private eventEmitter: EventTarget = new EventTarget();

  init() {
    this.startTime = performance.now();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('exportGraph') === '1') {
        this.setupExport();
      }
    }
  }

  async update(_delta: number, _time: number) {
    if (this.stabilized) return;

    const elapsed = performance.now() - this.startTime;

    if (elapsed < this.config.stabilizationTimeMs.value) {
      return;
    }

    const planeCount = this.queries.planes.entities.size;
    const meshCount = this.queries.meshes.entities.size;

    if (planeCount === 0 && meshCount === 0 && !this.config.captureAttempted.value) {
      await this.initiateRoomCapture();
      this.config.captureAttempted.value = true;
      this.startTime = performance.now();
      return;
    }

    if (planeCount + meshCount < 2) {
      this.stabilized = true;
      this.eventEmitter.dispatchEvent(new CustomEvent('noSurfaces'));
      return;
    }

    const descriptors = this.extractDescriptors();

    if (descriptors.length < 2) {
      this.stabilized = true;
      this.eventEmitter.dispatchEvent(new CustomEvent('noSurfaces'));
      return;
    }

    const floorY = this.computeFloorY(descriptors);
    const startPose = this.getStartPose();

    const buildStart = performance.now();
    try {
      this.graph = await buildSurfaceGraph(descriptors, floorY, startPose);
      const buildTime = performance.now() - buildStart;

      if (this.graph) {
        console.log(`[SurfaceGraphSystem] Built graph in ${buildTime.toFixed(1)}ms:`, {
          nodes: this.graph.nodes.length,
          edges: this.graph.edges.length,
          roomHash: this.graph.roomHash,
          size: JSON.stringify(this.graph).length,
        });
      }

      this.stabilized = true;
      this.eventEmitter.dispatchEvent(
        new CustomEvent('graphReady', { detail: this.graph }),
      );
    } catch (error) {
      console.error('[SurfaceGraphSystem] Failed to build graph:', error);
      this.stabilized = true;
      this.eventEmitter.dispatchEvent(new CustomEvent('noSurfaces'));
    }
  }

  private extractDescriptors(): SurfaceDescriptor[] {
    const descriptors: SurfaceDescriptor[] = [];

    for (const entity of this.queries.planes.entities) {
      const planeData = entity.getValue(XRPlane, '_plane') as any;
      if (!planeData) continue;

      const obj = entity.object3D;
      if (!obj) continue;

      const pos = obj.position.toArray() as [number, number, number];
      const quat = obj.quaternion.toArray() as [number, number, number, number];

      let label = 'other';
      if (planeData.orientation === 'horizontal') {
        const heightAboveFloor = pos[1];
        if (heightAboveFloor < 0.1) {
          label = 'floor';
        }
      }

      descriptors.push({
        type: 'plane',
        label,
        orientation: planeData.orientation || 'horizontal',
        pose: { position: pos, orientation: quat },
        polygon: planeData.polygon ? Array.from(planeData.polygon as any[]).map((p: any) => [p.x as number, p.y as number, p.z as number] as [number, number, number]) : undefined,
      });
    }

    for (const entity of this.queries.meshes.entities) {
      const isBounded = entity.getValue(XRMesh, 'isBounded3D') || false;
      const semanticLabel = entity.getValue(XRMesh, 'semanticLabel') || 'other';
      const min = entity.getValue(XRMesh, 'min');
      const max = entity.getValue(XRMesh, 'max');

      const obj = entity.object3D;
      if (!obj) continue;

      const pos = obj.position.toArray() as [number, number, number];
      const quat = obj.quaternion.toArray() as [number, number, number, number];

      descriptors.push({
        type: 'mesh',
        label: semanticLabel,
        isBounded,
        pose: { position: pos, orientation: quat },
        bounds: min && max ? { min, max } : undefined,
      });
    }

    return descriptors;
  }

  private computeFloorY(descriptors: SurfaceDescriptor[]): number {
    let minY = Infinity;

    for (const desc of descriptors) {
      const y = desc.pose.position[1];
      if (desc.type === 'plane' && desc.orientation === 'horizontal' && y < 0.2) {
        minY = Math.min(minY, y);
      }
    }

    return minY === Infinity ? 0 : minY;
  }

  private getStartPose(): {
    position: [number, number, number];
    forward: [number, number, number];
  } {
    const camera = this.camera;
    const pos = camera.position.toArray() as [number, number, number];

    camera.getWorldDirection(this.world.globals.tmp.vec3_0);
    const forward = this.world.globals.tmp.vec3_0.toArray() as [number, number, number];

    return { position: pos, forward };
  }

  private async initiateRoomCapture() {
    const session = this.renderer.xr.getSession();
    if (!session) return;

    const sessionAny = session as any;
    if ('initiateRoomCapture' in sessionAny && typeof sessionAny.initiateRoomCapture === 'function') {
      try {
        console.log('[SurfaceGraphSystem] Initiating room capture...');
        await sessionAny.initiateRoomCapture();
      } catch (error) {
        console.warn('[SurfaceGraphSystem] Room capture failed or not supported:', error);
      }
    }
  }

  private setupExport() {
    this.addEventListener('graphReady', ((event: Event) => {
      const graph = (event as CustomEvent<SurfaceGraph>).detail;
      const blob = new Blob([JSON.stringify(graph, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `surface-graph-${graph.roomHash}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }) as EventListener);
  }

  public getGraph(): SurfaceGraph | null {
    return this.graph;
  }

  public addEventListener(
    type: 'graphReady' | 'noSurfaces',
    listener: EventListener,
  ): void {
    this.eventEmitter.addEventListener(type, listener);
  }

  public removeEventListener(
    type: 'graphReady' | 'noSurfaces',
    listener: EventListener,
  ): void {
    this.eventEmitter.removeEventListener(type, listener);
  }
}
