import {
  createSystem,
  Entity,
  Group,
  LineBasicMaterial,
  OneHandGrabbable,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import { mountGreyboxLevel, type MountedLevel } from '../level/mount-level.js';
import {
  createSurfaceDebugOverlay,
  disposeSurfaceDebugOverlay,
} from '../debug/surface-debug.js';
import type { LevelBuiltDetail, SnapTarget } from '../level/types.js';

const TRAY_FORWARD_M = 0.4;
const TRAY_DROP_M = 0.32;
const TRAY_MAX_DISTANCE_M = 0.6;
const EMPTY_SNAP_TARGETS: readonly SnapTarget[] = [];

/**
 * Consumes a LevelPlan + SurfaceGraph and creates one entity per placement
 * under a level root. Player-built pieces start in a head-following tray
 * (≤ 0.6 m from the head, below eye line, facing up). Surface poses of
 * player-built pieces are snap targets for X-04.
 *
 * `update` only writes into preallocated vectors/quaternions/matrices.
 */
export class LevelBuilderSystem extends createSystem({}, {}) {
  private readonly events = new EventTarget();
  private readonly tmpHead = new Vector3();
  private readonly tmpFwd = new Vector3();
  private readonly tmpTray = new Vector3();
  private readonly tmpOffset = new Vector3();
  private readonly tmpUp = new Vector3(0, 1, 0);
  private readonly tmpRight = new Vector3();
  private readonly tmpQuat = new Quaternion();
  private readonly debugLineMaterial = new LineBasicMaterial({
    color: 0x7ec8e3,
    toneMapped: false,
  });
  private mounted: MountedLevel | null = null;
  private levelRootEntity: Entity | null = null;
  private trayEntity: Entity | null = null;
  private placementEntities: Entity[] = [];
  private readonly entitiesByPlacement = new Map<string, Entity>();
  private debugGraph: SurfaceGraph | null = null;
  private debugRoot: Group | null = null;
  private lastGraph: SurfaceGraph | null = null;

  init(): void {
    this.cleanupFuncs.push(() => {
      this.clear();
      this.debugLineMaterial.dispose();
    });
  }

  /** Build (or rebuild) the level from a plan and surface graph. */
  build(plan: LevelPlan, graph: SurfaceGraph): void {
    this.lastGraph = graph;
    this.clearPieces();

    const mountParent = new Group();
    mountParent.name = 'levelMount';
    this.levelRootEntity = this.world.createTransformEntity(mountParent);

    const mounted = mountGreyboxLevel(mountParent, plan, graph, {
      debug: false,
    });
    this.mounted = mounted;

    this.trayEntity = this.world.createTransformEntity(mounted.tray, {
      parent: this.levelRootEntity,
    });

    for (const piece of mounted.pieces) {
      const parentEntity = piece.inTray
        ? this.trayEntity
        : this.levelRootEntity;
      const saved = {
        x: piece.object.position.x,
        y: piece.object.position.y,
        z: piece.object.position.z,
        yaw: piece.object.rotation.y,
      };
      const entity = this.world.createTransformEntity(piece.object, {
        parent: parentEntity,
      });
      piece.object.position.set(saved.x, saved.y, saved.z);
      piece.object.rotation.set(0, saved.yaw, 0);
      this.placementEntities.push(entity);
      this.entitiesByPlacement.set(piece.placement.id, entity);
      if (piece.inTray) {
        entity.addComponent(OneHandGrabbable, {
          rotate: true,
          translate: true,
        });
      }
    }

    if (this.debugGraph) {
      this.rebuildDebug(this.debugGraph);
    }

    mounted.syncInstances();

    const detail: LevelBuiltDetail = {
      pieceCount: mounted.pieces.length,
      snapTargets: mounted.snapTargets,
    };
    this.events.dispatchEvent(new CustomEvent('levelBuilt', { detail }));
  }

  /** Remove placed pieces, tray contents and debug overlays. */
  clear(): void {
    this.clearPieces();
    this.clearDebug();
  }

  getSnapTargets(): readonly SnapTarget[] {
    return this.mounted?.snapTargets ?? EMPTY_SNAP_TARGETS;
  }

  getTray(): Group | null {
    return this.mounted?.tray ?? null;
  }

  getLevelRoot(): Group | null {
    return this.mounted?.root ?? null;
  }

  getMounted(): MountedLevel | null {
    return this.mounted;
  }

  getPieceEntity(placementId: string): Entity | null {
    return this.entitiesByPlacement.get(placementId) ?? null;
  }

  getGraph(): SurfaceGraph | null {
    return this.lastGraph;
  }

  getVillageHutEntity(): Entity | null {
    if (!this.mounted) return null;
    for (const piece of this.mounted.pieces) {
      if (piece.placement.piece === 'village_hut') {
        return this.entitiesByPlacement.get(piece.placement.id) ?? null;
      }
    }
    return null;
  }

  /**
   * Draw surface outlines and labels for every graph node (`?debug=1`).
   * One line material is shared across all loops.
   */
  setDebugGraph(graph: SurfaceGraph | null): void {
    this.debugGraph = graph;
    if (!graph) {
      this.clearDebug();
      return;
    }
    this.rebuildDebug(graph);
  }

  addEventListener(type: 'levelBuilt', listener: EventListener): void {
    this.events.addEventListener(type, listener);
  }

  removeEventListener(type: 'levelBuilt', listener: EventListener): void {
    this.events.removeEventListener(type, listener);
  }

  update(_delta: number, _time: number): void {
    this.updateTrayPose();
    this.mounted?.syncInstances();
  }

  private updateTrayPose(): void {
    const tray = this.mounted?.tray;
    if (!tray) return;

    if (this.renderer.xr.isPresenting) {
      this.player.head.getWorldPosition(this.tmpHead);
      this.player.head.getWorldDirection(this.tmpFwd);
    } else {
      this.camera.getWorldPosition(this.tmpHead);
      this.camera.getWorldDirection(this.tmpFwd);
    }

    this.tmpTray.copy(this.tmpHead);
    this.tmpTray.addScaledVector(this.tmpFwd, TRAY_FORWARD_M);
    if (!this.renderer.xr.isPresenting) {
      this.tmpRight.crossVectors(this.tmpFwd, this.tmpUp).normalize();
      this.tmpTray.addScaledVector(this.tmpRight, 0.16);
    }
    this.tmpTray.y = this.tmpHead.y - TRAY_DROP_M;

    this.tmpOffset.copy(this.tmpTray).sub(this.tmpHead);
    const dist = this.tmpOffset.length();
    if (dist > TRAY_MAX_DISTANCE_M && dist > 0) {
      this.tmpOffset.multiplyScalar(TRAY_MAX_DISTANCE_M / dist);
      this.tmpTray.copy(this.tmpHead).add(this.tmpOffset);
    }

    if (this.tmpTray.y > this.tmpHead.y - 0.12) {
      this.tmpTray.y = this.tmpHead.y - 0.12;
    }

    tray.position.copy(this.tmpTray);
    const yaw = Math.atan2(this.tmpFwd.x, this.tmpFwd.z);
    this.tmpQuat.setFromAxisAngle(this.tmpUp, yaw);
    tray.quaternion.copy(this.tmpQuat);
  }

  private rebuildDebug(graph: SurfaceGraph): void {
    this.clearDebug();
    const material =
      this.mounted?.kit.debugLineMaterial ?? this.debugLineMaterial;
    this.debugRoot = createSurfaceDebugOverlay(graph, material);
    this.scene.add(this.debugRoot);
  }

  private clearDebug(): void {
    if (this.debugRoot) {
      disposeSurfaceDebugOverlay(this.debugRoot);
      this.debugRoot = null;
    }
  }

  private clearPieces(): void {
    for (const entity of this.placementEntities) {
      entity.dispose({ disposeResources: false });
    }
    this.placementEntities.length = 0;
    this.entitiesByPlacement.clear();

    if (this.trayEntity) {
      this.trayEntity.dispose({ disposeResources: false });
      this.trayEntity = null;
    }

    this.mounted?.dispose();
    this.mounted = null;

    if (this.levelRootEntity) {
      this.levelRootEntity.dispose({ disposeResources: false });
      this.levelRootEntity = null;
    }
  }
}
