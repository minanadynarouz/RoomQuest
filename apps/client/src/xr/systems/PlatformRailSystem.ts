import {
  createSystem,
  DistanceGrabbable,
  Grabbed,
  MovementMode,
  RayInteractable,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import {
  buildPlatformRail,
  clampToRail,
  emptyRail,
  emptyRailSample,
  railPoint,
  type PlatformRail,
  type RailSample,
  type Vec3Mut,
} from '@roomquest/level-core';
import type { SurfaceGraph } from '@roomquest/schema';
import type { GameStore } from '../../game/index.js';
import type { ExplorerPose } from '../explorer/walker.js';
import type { LevelBuilderSystem } from './LevelBuilderSystem.js';
import type { ExplorerSystem } from './ExplorerSystem.js';

const MAX_PLATFORMS = 2;

interface PlatformSlot {
  used: boolean;
  placementId: string;
  entity: Entity | null;
  rail: PlatformRail;
  sample: RailSample;
  grabbed: boolean;
  aligned: boolean;
  emittedAligned: boolean;
}

export interface PlatformDebugApi {
  align: (placementId?: string) => boolean;
  moveToT: (t: number, placementId?: string) => boolean;
  railT: (placementId?: string) => number | null;
  aligned: (placementId?: string) => boolean;
  grabbed: (placementId?: string) => boolean;
  worldPose: (
    placementId?: string
  ) => { x: number; y: number; z: number } | null;
}

/**
 * Distance-grab platforms, clamped to a ≤ 1 m rail. X-01's local-space
 * translateMin/Max needs a rail-aligned parent; this system always clamps
 * in world space so ray + pinch drag cannot leave the rail.
 */
export class PlatformRailSystem extends createSystem(
  {
    grabbed: { required: [Grabbed] },
  },
  {}
) {
  private builder: LevelBuilderSystem | null = null;
  private store: GameStore | null = null;
  private explorer: ExplorerSystem | null = null;
  private readonly slots: PlatformSlot[] = [
    makeSlot(),
    makeSlot(),
  ];
  private readonly worldPos = new Vector3();
  private readonly tmpPoint: Vec3Mut = [0, 0, 0];
  private readonly explorerPose: ExplorerPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private boundGraph: SurfaceGraph | null = null;
  private mountedGen = 0;

  configure(options: {
    builder: LevelBuilderSystem;
    store: GameStore;
    explorer: ExplorerSystem;
  }): void {
    this.builder = options.builder;
    this.store = options.store;
    this.explorer = options.explorer;
  }

  init(): void {
    this.cleanupFuncs.push(() => {
      this.clearSlots();
    });
  }

  debugApi(): PlatformDebugApi {
    return {
      align: (placementId) => this.snapToAlign(placementId),
      moveToT: (t, placementId) => this.snapToT(t, placementId),
      railT: (placementId) => this.slotOf(placementId)?.sample.t ?? null,
      aligned: (placementId) => this.slotOf(placementId)?.aligned ?? false,
      grabbed: (placementId) => this.slotOf(placementId)?.grabbed ?? false,
      worldPose: (placementId) => {
        const slot = this.slotOf(placementId);
        if (!slot?.used) return null;
        return { x: slot.sample.x, y: slot.sample.y, z: slot.sample.z };
      },
    };
  }

  update(_delta: number, _time: number): void {
    this.maybeBind();
    this.syncGrabbed();
    this.clampAll();
    this.rideWithExplorer();
  }

  private maybeBind(): void {
    const mounted = this.builder?.getMounted();
    const gen = mounted ? mounted.pieces.length : 0;
    if (gen === this.mountedGen) return;
    this.mountedGen = gen;
    this.bindRails();
  }

  private bindRails(): void {
    this.clearSlots();
    const mounted = this.builder?.getMounted();
    const plan = this.store?.plan;
    const graph = this.boundGraph;
    if (!mounted || !plan || !graph) return;

    let slotIndex = 0;
    for (const piece of mounted.pieces) {
      if (piece.placement.piece !== 'moving_platform') continue;
      if (slotIndex >= MAX_PLATFORMS) break;
      const entity = this.builder?.getPieceEntity(piece.placement.id);
      if (!entity) continue;
      const slot = this.slots[slotIndex];
      if (!slot) break;
      slotIndex += 1;
      const rail = buildPlatformRail(graph, piece.placement, slot.rail);
      if (!rail) continue;
      slot.used = true;
      slot.placementId = piece.placement.id;
      slot.entity = entity;
      slot.grabbed = false;
      slot.aligned = false;
      slot.emittedAligned = false;
      this.enableGrab(entity, rail.length);
      railPoint(rail, rail.farT, this.tmpPoint);
      this.writeSlotPose(slot, this.tmpPoint[0], this.tmpPoint[1], this.tmpPoint[2]);
    }
  }

  bindGraph(graph: SurfaceGraph | null): void {
    this.boundGraph = graph;
    this.mountedGen = -1;
  }

  private enableGrab(entity: Entity, railLength: number): void {
    if (!entity.hasComponent(RayInteractable)) {
      entity.addComponent(RayInteractable);
    }
    if (!entity.hasComponent(DistanceGrabbable)) {
      entity.addComponent(DistanceGrabbable, {
        translate: true,
        rotate: false,
        scale: false,
        returnToOrigin: false,
        movementMode: MovementMode.MoveAtSource,
      });
    }
    applyLocalRailLimits(entity, railLength);
    const object3D = entity.object3D;
    if (object3D) {
      object3D.pointerEvents = 'auto';
    }
  }

  private syncGrabbed(): void {
    for (const slot of this.slots) {
      if (!slot.used || !slot.entity) continue;
      const now = slot.entity.hasComponent(Grabbed);
      if (slot.grabbed && !now) {
        this.emitMove(slot);
      }
      slot.grabbed = now;
    }
  }

  private clampAll(): void {
    for (const slot of this.slots) {
      if (!slot.used || !slot.entity?.object3D) continue;
      if (this.isRiding(slot.placementId)) continue;
      slot.entity.object3D.getWorldPosition(this.worldPos);
      this.writeSlotPose(slot, this.worldPos.x, this.worldPos.y, this.worldPos.z);
    }
  }

  private rideWithExplorer(): void {
    const explorer = this.explorer;
    if (explorer?.currentState() !== 'riding') return;
    const id = explorer.currentPlacementId();
    if (!id) return;
    const slot = this.slotOf(id);
    if (!slot?.used) return;
    explorer.copyPose(this.explorerPose);
    this.writeSlotPose(
      slot,
      this.explorerPose.x,
      this.explorerPose.y,
      this.explorerPose.z,
      false
    );
  }

  private isRiding(placementId: string): boolean {
    const explorer = this.explorer;
    return (
      explorer?.currentState() === 'riding' &&
      explorer.currentPlacementId() === placementId
    );
  }

  private writeSlotPose(
    slot: PlatformSlot,
    x: number,
    y: number,
    z: number,
    emit = true
  ): void {
    clampToRail(x, y, z, slot.rail, slot.sample);
    const object3D = slot.entity?.object3D;
    if (object3D) {
      object3D.position.set(slot.sample.x, slot.sample.y, slot.sample.z);
    }
    if (!emit) return;
    const was = slot.aligned;
    slot.aligned = slot.sample.aligned;
    if (slot.aligned && !was) {
      this.emitAligned(slot);
    } else if (!slot.aligned && was) {
      slot.emittedAligned = false;
      this.emitMove(slot);
    }
  }

  private emitMove(slot: PlatformSlot): void {
    this.store?.pieceMoved(slot.placementId, slot.aligned);
    if (slot.aligned) {
      this.emitAligned(slot);
    }
  }

  private emitAligned(slot: PlatformSlot): void {
    if (slot.emittedAligned) return;
    slot.emittedAligned = true;
    this.store?.platformAligned(slot.placementId);
  }

  private snapToAlign(placementId?: string): boolean {
    const slot = this.slotOf(placementId);
    if (!slot?.used) return false;
    railPoint(slot.rail, slot.rail.alignT, this.tmpPoint);
    this.writeSlotPose(slot, this.tmpPoint[0], this.tmpPoint[1], this.tmpPoint[2]);
    this.emitMove(slot);
    return slot.aligned;
  }

  private snapToT(t: number, placementId?: string): boolean {
    const slot = this.slotOf(placementId);
    if (!slot?.used) return false;
    railPoint(slot.rail, t, this.tmpPoint);
    this.writeSlotPose(slot, this.tmpPoint[0], this.tmpPoint[1], this.tmpPoint[2]);
    this.emitMove(slot);
    return true;
  }

  private slotOf(placementId?: string): PlatformSlot | undefined {
    if (placementId) {
      for (const slot of this.slots) {
        if (slot.used && slot.placementId === placementId) return slot;
      }
      return undefined;
    }
    for (const slot of this.slots) {
      if (slot.used) return slot;
    }
    return undefined;
  }

  private clearSlots(): void {
    for (const slot of this.slots) {
      slot.used = false;
      slot.entity = null;
      slot.placementId = '';
      slot.grabbed = false;
      slot.aligned = false;
      slot.emittedAligned = false;
    }
  }
}

function makeSlot(): PlatformSlot {
  return {
    used: false,
    placementId: '',
    entity: null,
    rail: emptyRail(),
    sample: emptyRailSample(),
    grabbed: false,
    aligned: false,
    emittedAligned: false,
  };
}

function applyLocalRailLimits(entity: Entity, length: number): void {
  try {
    const min = entity.getVectorView(DistanceGrabbable, 'translateMin');
    const max = entity.getVectorView(DistanceGrabbable, 'translateMax');
    min[0] = 0;
    min[1] = 0;
    min[2] = 0;
    max[0] = length;
    max[1] = 0;
    max[2] = 0;
  } catch {
    // X-01 fallback: world-space clamp in update().
  }
}
