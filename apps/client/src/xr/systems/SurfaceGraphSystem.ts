import {
  createSystem,
  XRPlane,
  XRMesh,
  Types,
  Vector3,
  Quaternion,
} from '@iwsdk/core';
import type { SurfaceGraph, SurfaceLabel } from '@roomquest/schema';
import type { SurfaceDescriptor } from '@roomquest/level-core';
import { buildSurfaceGraph } from '@roomquest/level-core';

/**
 * Normalize native semantic label to schema SurfaceLabel
 */
function normalizeSurfaceLabel(nativeLabel: string): string {
  const lower = nativeLabel.toLowerCase();
  const validLabels: SurfaceLabel[] = [
    'table',
    'desk',
    'couch',
    'bed',
    'shelf',
    'storage',
    'floor',
    'seat_like',
    'other',
  ];

  for (const valid of validLabels) {
    if (lower === valid) {
      return valid;
    }
  }

  if (lower.includes('table') || lower === 'coffee table') return 'table';
  if (lower.includes('desk')) return 'desk';
  if (lower.includes('couch') || lower === 'sofa') return 'couch';
  if (lower.includes('bed')) return 'bed';
  if (lower.includes('shelf')) return 'shelf';
  if (lower.includes('storage') || lower === 'cabinet') return 'storage';
  if (lower === 'floor' || lower === 'ground') return 'floor';
  if (lower === 'chair' || lower === 'seat') return 'seat_like';

  return 'other';
}

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
  },
) {
  private graph: SurfaceGraph | null = null;
  private startTime = 0;
  private stabilized = false;
  private eventEmitter = new EventTarget();
  private captureAttempted = false;
  private inFlight = false;

  init() {
    this.startTime = performance.now();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('exportGraph') === '1') {
        this.setupExport();
      }
    }
  }

  update(_delta: number, _time: number) {
    if (this.stabilized || this.inFlight) return;

    const elapsed = performance.now() - this.startTime;

    if (elapsed < this.config.stabilizationTimeMs.value) {
      return;
    }

    const planeCount = this.queries.planes.entities.size;
    const meshCount = this.queries.meshes.entities.size;

    if (planeCount === 0 && meshCount === 0 && !this.captureAttempted) {
      this.captureAttempted = true;
      this.inFlight = true;
      this.initiateRoomCapture()
        .then(() => {
          this.startTime = performance.now();
        })
        .finally(() => {
          this.inFlight = false;
        });
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

    this.inFlight = true;
    const buildStart = performance.now();

    buildSurfaceGraph(descriptors, floorY, startPose)
      .then((graph) => {
        this.graph = graph;
        const buildTime = performance.now() - buildStart;

        console.log(`[SurfaceGraphSystem] Built graph in ${buildTime.toFixed(1)}ms:`, {
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          roomHash: graph.roomHash,
          size: JSON.stringify(graph).length,
        });

        this.stabilized = true;
        this.eventEmitter.dispatchEvent(
          new CustomEvent('graphReady', { detail: graph }),
        );
      })
      .catch((error: unknown) => {
        console.error('[SurfaceGraphSystem] Failed to build graph:', error);
        this.stabilized = true;
        this.eventEmitter.dispatchEvent(new CustomEvent('noSurfaces'));
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  private extractDescriptors(): SurfaceDescriptor[] {
    const descriptors: SurfaceDescriptor[] = [];
    const tmpVec = new Vector3();
    const tmpQuat = new Quaternion();

    for (const entity of this.queries.planes.entities) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const planeData = entity.getValue(XRPlane, '_plane') as any;
      if (!planeData) continue;

      const obj = entity.object3D;
      if (!obj) continue;

      obj.getWorldPosition(tmpVec);
      obj.getWorldQuaternion(tmpQuat);

      const pos = tmpVec.toArray();
      const quat = tmpQuat.toArray();

      let label = 'other';
      if (planeData.semanticLabel) {
        label = normalizeSurfaceLabel(String(planeData.semanticLabel));
      } else if (planeData.orientation === 'horizontal') {
        const heightAboveFloor = pos[1];
        if (heightAboveFloor < 0.1) {
          label = 'floor';
        }
      }

      descriptors.push({
        type: 'plane',
        label,
        orientation: planeData.orientation ?? 'horizontal',
        pose: { position: pos, orientation: quat },
        polygon: planeData.polygon
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          ? Array.from(planeData.polygon).map((p: any) => [
              p.x,
              p.y,
              p.z,
            ])
          : undefined,
      });
    }

    for (const entity of this.queries.meshes.entities) {
      const isBounded = Boolean(entity.getValue(XRMesh, 'isBounded3D'));
      const semanticLabel = entity.getValue(XRMesh, 'semanticLabel') ?? 'other';
      const min = entity.getValue(XRMesh, 'min');
      const max = entity.getValue(XRMesh, 'max');

      const obj = entity.object3D;
      if (!obj) continue;

      obj.getWorldPosition(tmpVec);
      obj.getWorldQuaternion(tmpQuat);

      const pos = tmpVec.toArray();
      const quat = tmpQuat.toArray();

      let adjustedPos = pos;
      if (isBounded && max) {
        adjustedPos = [pos[0], pos[1] + max[1], pos[2]];
      }

      descriptors.push({
        type: 'mesh',
        label: normalizeSurfaceLabel(semanticLabel),
        isBounded,
        pose: { position: adjustedPos, orientation: quat },
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
    const pos = camera.position.toArray();

    const tmpVec = new Vector3();
    camera.getWorldDirection(tmpVec);
    const forward = tmpVec.toArray();

    return { position: pos, forward };
  }

  private async initiateRoomCapture(): Promise<void> {
    const session = this.renderer.xr.getSession();
    if (!session) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionAny = session as any;
    if (
      'initiateRoomCapture' in sessionAny &&
      typeof sessionAny.initiateRoomCapture === 'function'
    ) {
      try {
        console.log('[SurfaceGraphSystem] Initiating room capture...');
        await sessionAny.initiateRoomCapture();
      } catch (error) {
        console.warn('[SurfaceGraphSystem] Room capture failed or not supported:', error);
      }
    }
  }

  private setupExport() {
    this.addEventListener('graphReady', (event: Event) => {
      const graph = (event as CustomEvent<SurfaceGraph>).detail;
      const blob = new Blob([JSON.stringify(graph, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `surface-graph-${graph.roomHash}.json`;
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
    });
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
