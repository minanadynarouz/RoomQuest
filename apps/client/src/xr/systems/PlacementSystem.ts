import {
  BoxGeometry,
  createSystem,
  Grabbed,
  GrabSystem,
  Mesh,
  MeshBasicMaterial,
  OneHandGrabbable,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import type { PieceId } from '@roomquest/schema';
import {
  PlacementController,
  type PlacementHand,
} from '../placement/controller.js';
import type { LevelBuilderSystem } from './LevelBuilderSystem.js';
import type { createGameStore } from '../../game/index.js';
import type { MountedPiece, SnapTarget } from '../level/types.js';

const EMPTY_TARGETS: readonly SnapTarget[] = [];

export interface PlacementDebugApi {
  grab: (placementId: string, hand: PlacementHand) => boolean;
  moveTo: (x: number, y: number, z: number) => boolean;
  moveToTarget: (placementId?: string) => boolean;
  release: () => 'snap' | 'return' | 'idle';
  ghostVisible: () => boolean;
  heldHand: () => PlacementHand | null;
  piecePose: (
    placementId: string
  ) => { x: number; y: number; z: number; yaw: number } | null;
  pieceWorldPose: (
    placementId: string
  ) => { x: number; y: number; z: number } | null;
  /**
   * True when a live WebXR session (IWER emulator hands) can drive grab.
   * Desktop `?fixture=` without `xr=1` stays false.
   */
  emulatorHandDriving: boolean;
  emulatorHandDrivingNote: string;
}

const GHOST_NOTE_DESKTOP =
  'IWER hand pinch cannot be driven on the desktop fixture path: World.create uses xr:false, so there is no XR session or emulated hands.';
const GHOST_NOTE_XR =
  'IWER hands are live. Drive window.IWER_DEVICE.hands with position.set and updatePinchValue.';

/**
 * Near-pinch placement for tray pieces. Runs after GrabSystem (-3) so the
 * held pose is current when the ghost is evaluated.
 *
 * Controllers still work: OneHandGrabbable maps squeeze by default;
 * `useHandPinchForGrab` only adds hand pinch, it does not replace squeeze.
 */
export class PlacementSystem extends createSystem(
  {
    held: { required: [Grabbed, OneHandGrabbable] },
  },
  {}
) {
  private builder: LevelBuilderSystem | null = null;
  private store: ReturnType<typeof createGameStore> | null = null;
  private controller: PlacementController | null = null;
  private readonly ghostMaterial = new MeshBasicMaterial({
    color: 0x88ddff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly placeholderGeo = new BoxGeometry(0.01, 0.01, 0.01);
  private readonly ghost: Mesh = new Mesh(
    this.placeholderGeo,
    this.ghostMaterial
  );
  private ghostPiece: PieceId | null = null;
  private readonly tmpHeld = new Set<Entity>();
  private readonly worldPos = new Vector3();

  configure(options: {
    builder: LevelBuilderSystem;
    store: ReturnType<typeof createGameStore>;
  }): void {
    this.builder = options.builder;
    this.store = options.store;
    this.controller = new PlacementController({
      getTargets: () => this.builder?.getSnapTargets() ?? EMPTY_TARGETS,
      getPiece: (id) => this.findPiece(id),
      getTray: () => this.builder?.getTray() ?? null,
      getLevelRoot: () => this.builder?.getLevelRoot() ?? null,
      getMount: () => this.builder?.getLevelRoot()?.parent ?? null,
      onPieceBuilt: (id) => {
        this.store?.pieceBuilt(id);
      },
      onDisableGrab: (id) => {
        this.disableGrab(id);
      },
    });
  }

  init(): void {
    this.ghost.name = 'snapGhost';
    this.ghost.visible = false;
    this.ghost.castShadow = false;
    this.ghost.receiveShadow = false;
    this.ghost.frustumCulled = false;
    this.scene.add(this.ghost);

    this.queries.held.subscribe('qualify', (entity) => {
      this.onGrabbed(entity);
    });
    this.queries.held.subscribe('disqualify', (entity) => {
      this.onReleased(entity);
    });

    this.cleanupFuncs.push(() => {
      this.ghost.removeFromParent();
      this.ghostMaterial.dispose();
      this.placeholderGeo.dispose();
      this.controller?.reset();
    });
  }

  update(_delta: number, _time: number): void {
    this.controller?.tick();
    this.syncGhostVisual();
  }

  onLevelRebuilt(): void {
    this.controller?.reset();
    this.ghost.visible = false;
    this.ghostPiece = null;
  }

  debugApi(): PlacementDebugApi {
    return {
      grab: (placementId, hand) => {
        const ok = this.controller?.grab(placementId, hand, true) ?? false;
        this.syncGhostVisual();
        return ok;
      },
      moveTo: (x, y, z) => {
        const ok = this.controller?.moveTo(x, y, z) ?? false;
        this.syncGhostVisual();
        return ok;
      },
      moveToTarget: (placementId) => {
        const ok = this.controller?.moveToTarget(placementId) ?? false;
        this.syncGhostVisual();
        return ok;
      },
      release: () => {
        const result = this.controller?.release() ?? 'idle';
        this.syncGhostVisual();
        return result;
      },
      ghostVisible: () => this.controller?.isGhostVisible ?? false,
      heldHand: () => this.controller?.heldPlacementHand ?? null,
      piecePose: (placementId) => {
        const piece = this.findPiece(placementId);
        if (!piece) return null;
        return {
          x: piece.object.position.x,
          y: piece.object.position.y,
          z: piece.object.position.z,
          yaw: piece.object.rotation.y,
        };
      },
      pieceWorldPose: (placementId) => {
        const piece = this.findPiece(placementId);
        if (!piece) return null;
        piece.object.getWorldPosition(this.worldPos);
        return {
          x: this.worldPos.x,
          y: this.worldPos.y,
          z: this.worldPos.z,
        };
      },
      emulatorHandDriving: this.renderer.xr.isPresenting,
      emulatorHandDrivingNote: this.renderer.xr.isPresenting
        ? GHOST_NOTE_XR
        : GHOST_NOTE_DESKTOP,
    };
  }

  private onGrabbed(entity: Entity): void {
    const placementId = this.placementIdOf(entity);
    if (!placementId || !this.controller) return;
    this.tmpHeld.add(entity);
    const grab = this.world.getSystem(GrabSystem);
    const raw = grab?.getHolderHand(entity);
    const hand: PlacementHand = raw === 'left' ? 'left' : 'right';
    this.controller.grab(placementId, hand, false);
  }

  private onReleased(entity: Entity): void {
    if (!this.tmpHeld.has(entity)) return;
    this.tmpHeld.delete(entity);
    this.controller?.release();
    this.syncGhostVisual();
  }

  private disableGrab(placementId: string): void {
    const entity = this.builder?.getPieceEntity(placementId);
    if (!entity) return;
    const grab = this.world.getSystem(GrabSystem);
    grab?.forceRelease(entity);
    if (entity.hasComponent(OneHandGrabbable)) {
      entity.removeComponent(OneHandGrabbable);
    }
    if (entity.object3D) {
      entity.object3D.pointerEvents = 'none';
    }
  }

  private findPiece(placementId: string): MountedPiece | undefined {
    return this.builder
      ?.getMounted()
      ?.pieces.find((piece) => piece.placement.id === placementId);
  }

  private placementIdOf(entity: Entity): string | null {
    const id = entity.object3D?.userData.placementId;
    return typeof id === 'string' ? id : null;
  }

  private syncGhostVisual(): void {
    const target = this.controller?.activeGhostTarget ?? null;
    if (!target) {
      this.ghost.visible = false;
      return;
    }
    const kit = this.builder?.getMounted()?.kit;
    if (kit && this.ghostPiece !== target.piece) {
      this.ghost.geometry = kit.geometry(target.piece);
      this.ghostPiece = target.piece;
    }
    const p = target.pose.position;
    this.ghost.position.set(p[0], p[1], p[2]);
    this.ghost.rotation.set(0, target.pose.yaw, 0);
    this.ghost.visible = true;
  }
}
