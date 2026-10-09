import { Vector3, type Object3D } from '@iwsdk/core';
import {
  findNearestSnapTarget,
  SNAP_RADIUS_M,
} from '@roomquest/level-core';
import type { MountedPiece, SnapTarget } from '../level/types.js';

export type PlacementHand = 'left' | 'right';
export type ReleaseResult = 'snap' | 'return' | 'idle';

export const TRAY_RETURN_MS = 250;

export interface PlacementClock {
  now(): number;
}

export interface PlacementControllerOptions {
  getTargets: () => readonly SnapTarget[];
  getPiece: (placementId: string) => MountedPiece | undefined;
  getTray: () => Object3D | null;
  getLevelRoot: () => Object3D | null;
  getMount: () => Object3D | null;
  clock?: PlacementClock;
  radiusM?: number;
  onPieceBuilt?: (placementId: string) => void;
  onDisableGrab?: (placementId: string) => void;
  onGrab?: (placementId: string, hand: PlacementHand) => void;
}

/**
 * Grab / ghost / snap / tray-return state machine. No per-frame allocation:
 * vectors are class fields. Used by PlacementSystem and by the system-level
 * tests that simulate left/right grab without a live GrabSystem.
 */
export class PlacementController {
  private heldId: string | null = null;
  private heldHand: PlacementHand | null = null;
  private ghostTarget: SnapTarget | null = null;
  private tweening = false;
  private tweenStartMs = 0;
  private tweenObject: Object3D | null = null;
  private readonly tweenFrom = new Vector3();
  private tweenFromYaw = 0;
  private tweenFromXRot = 0;
  private tweenFromZRot = 0;
  private readonly tweenTo = new Vector3();
  private readonly tmpWorld = new Vector3();
  private readonly clock: PlacementClock;
  private readonly radiusM: number;
  private releasing = false;

  constructor(private readonly opts: PlacementControllerOptions) {
    this.clock = opts.clock ?? { now: () => performance.now() };
    this.radiusM = opts.radiusM ?? SNAP_RADIUS_M;
  }

  get heldPlacementId(): string | null {
    return this.heldId;
  }

  get heldPlacementHand(): PlacementHand | null {
    return this.heldHand;
  }

  get activeGhostTarget(): SnapTarget | null {
    return this.ghostTarget;
  }

  get isGhostVisible(): boolean {
    return this.ghostTarget !== null;
  }

  get isTweening(): boolean {
    return this.tweening;
  }

  reset(): void {
    this.heldId = null;
    this.heldHand = null;
    this.ghostTarget = null;
    this.tweening = false;
    this.tweenObject = null;
    this.releasing = false;
  }

  /**
   * Begin a hold. `simulate` reparents onto the level mount so tests and
   * `__rq` hooks can set a world-space pose without GrabSystem.
   */
  grab(
    placementId: string,
    hand: PlacementHand,
    simulate = false
  ): boolean {
    const piece = this.opts.getPiece(placementId);
    if (!piece?.inTray) return false;

    if (this.heldId && this.heldId !== placementId) return false;

    if (this.tweenObject === piece.object) {
      this.tweening = false;
      this.tweenObject = null;
    }

    this.heldId = placementId;
    this.heldHand = hand;
    this.ghostTarget = null;
    this.opts.onGrab?.(placementId, hand);

    if (simulate) {
      const mount = this.opts.getMount();
      if (mount) {
        mount.attach(piece.object);
      }
    }

    this.refreshGhost();
    return true;
  }

  moveTo(x: number, y: number, z: number): boolean {
    if (!this.heldId) return false;
    const piece = this.opts.getPiece(this.heldId);
    if (!piece) return false;
    piece.object.position.set(x, y, z);
    this.refreshGhost();
    return true;
  }

  moveToTarget(placementId?: string): boolean {
    if (!this.heldId) return false;
    const piece = this.opts.getPiece(this.heldId);
    if (!piece) return false;
    const target =
      this.opts.getTargets().find((t) =>
        placementId
          ? t.placementId === placementId
          : t.placementId === this.heldId && !t.filled
      ) ?? null;
    if (!target) return false;
    const p = target.pose.position;
    return this.moveTo(p[0], p[1], p[2]);
  }

  release(): ReleaseResult {
    if (this.releasing) return 'idle';
    if (!this.heldId) return 'idle';

    this.releasing = true;
    const placementId = this.heldId;
    const piece = this.opts.getPiece(placementId);
    const target = this.ghostTarget;
    this.heldId = null;
    this.heldHand = null;
    this.ghostTarget = null;

    if (!piece) {
      this.releasing = false;
      return 'idle';
    }

    if (target) {
      this.applySnap(piece, target);
      this.releasing = false;
      return 'snap';
    }

    this.beginTrayReturn(piece);
    this.releasing = false;
    return 'return';
  }

  tick(): void {
    if (this.heldId) {
      this.refreshGhost();
    }
    this.advanceTween();
  }

  private refreshGhost(): void {
    if (!this.heldId) {
      this.ghostTarget = null;
      return;
    }
    const piece = this.opts.getPiece(this.heldId);
    if (!piece) {
      this.ghostTarget = null;
      return;
    }
    piece.object.getWorldPosition(this.tmpWorld);
    this.ghostTarget = findNearestSnapTarget(
      piece.placement.piece,
      this.tmpWorld.x,
      this.tmpWorld.y,
      this.tmpWorld.z,
      this.opts.getTargets(),
      this.radiusM
    );
  }

  private applySnap(piece: MountedPiece, target: SnapTarget): void {
    const root = this.opts.getLevelRoot();
    if (root) {
      root.attach(piece.object);
    }
    const p = target.pose.position;
    piece.object.position.set(p[0], p[1], p[2]);
    piece.object.rotation.set(0, target.pose.yaw, 0);
    piece.inTray = false;
    target.filled = true;
    this.opts.onDisableGrab?.(piece.placement.id);
    this.opts.onPieceBuilt?.(piece.placement.id);
  }

  private beginTrayReturn(piece: MountedPiece): void {
    const tray = this.opts.getTray();
    if (tray) {
      tray.attach(piece.object);
    }
    this.tweenObject = piece.object;
    this.tweenFrom.copy(piece.object.position);
    this.tweenFromYaw = piece.object.rotation.y;
    this.tweenFromXRot = piece.object.rotation.x;
    this.tweenFromZRot = piece.object.rotation.z;
    this.tweenTo.set(piece.traySlot.x, piece.traySlot.y, piece.traySlot.z);
    this.tweenStartMs = this.clock.now();
    this.tweening = true;
    piece.inTray = true;
  }

  private advanceTween(): void {
    if (!this.tweening || !this.tweenObject) return;
    const elapsed = this.clock.now() - this.tweenStartMs;
    const u = elapsed >= TRAY_RETURN_MS ? 1 : elapsed / TRAY_RETURN_MS;
    const object = this.tweenObject;
    object.position.set(
      this.tweenFrom.x + (this.tweenTo.x - this.tweenFrom.x) * u,
      this.tweenFrom.y + (this.tweenTo.y - this.tweenFrom.y) * u,
      this.tweenFrom.z + (this.tweenTo.z - this.tweenFrom.z) * u
    );
    object.rotation.set(
      this.tweenFromXRot * (1 - u),
      this.tweenFromYaw * (1 - u),
      this.tweenFromZRot * (1 - u)
    );
    if (u >= 1) {
      this.tweening = false;
      this.tweenObject = null;
    }
  }
}
