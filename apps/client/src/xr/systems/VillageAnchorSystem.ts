/**
 * X-09: persist the village hut as an XRAnchor and restore it next session.
 *
 * Feature-checked throughout. Restore / persist failures and private-mode
 * storage all fall back to the largest table and never throw.
 */

import {
  createSystem,
  Quaternion,
  Vector3,
  XRAnchor,
  type Entity,
} from '@iwsdk/core';
import {
  chooseLargestTable,
  chooseVillageAnchorPlacement,
  isVillageAnchorStorageAvailable,
  villageFallbackPose,
  writeVillageAnchorHandle,
  type VillageAnchorFallbackReason,
  type VillageAnchorStorage,
} from '@roomquest/level-core';
import type { SurfaceGraph } from '@roomquest/schema';
import { inspectPersistentAnchorSupport } from '../anchor/support.js';
import type { LevelBuilderSystem } from './LevelBuilderSystem.js';

interface NativeXrAnchor {
  requestPersistentHandle?: () => Promise<string>;
  anchorSpace?: XRSpace;
}

interface NativeXrSession {
  restorePersistentAnchor?: (
    uuid: string
  ) => Promise<NativeXrAnchor | null>;
}

interface NativeXrFrame {
  createAnchor?: (
    pose: XRRigidTransform,
    space: XRSpace
  ) => Promise<NativeXrAnchor | null>;
  getPose?: (
    space: XRSpace,
    base: XRSpace
  ) => { transform: { position: DOMPointReadOnly } } | undefined;
}

export interface VillageAnchorHutPose {
  x: number;
  y: number;
  z: number;
}

export interface VillageAnchorStatus {
  ready: boolean;
  placement: 'idle' | 'restored' | 'fallback';
  reason: VillageAnchorFallbackReason | null;
  persisted: boolean;
  handle: string | null;
  surfaceId: string | null;
  persistentAnchorsSupported: boolean;
  storageAvailable: boolean;
  attached: boolean;
  hutPose: VillageAnchorHutPose | null;
}

export interface VillageAnchorDebugApi {
  status: () => VillageAnchorStatus;
}

const LOG = '[X-09]';

function warn(message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.warn(LOG, message);
    return;
  }
  console.warn(LOG, message, extra);
}

export class VillageAnchorSystem extends createSystem({}, {}) {
  private builder: LevelBuilderSystem | null = null;
  private storage: VillageAnchorStorage | null = null;
  private expectSession = false;
  private readonly tmpPos = new Vector3();
  private readonly tmpQuat = new Quaternion();
  private pending = false;
  private inFlight = false;
  private ready = false;
  private placement: VillageAnchorStatus['placement'] = 'idle';
  private reason: VillageAnchorFallbackReason | null = null;
  private persisted = false;
  private handle: string | null = null;
  private surfaceId: string | null = null;
  private persistentAnchorsSupported = false;
  private storageAvailable = false;
  private attached = false;
  private restoredNative: NativeXrAnchor | null = null;
  private poseWaitFrames = 0;

  configure(options: {
    builder: LevelBuilderSystem;
    storage: VillageAnchorStorage;
    expectSession?: boolean;
  }): void {
    this.builder = options.builder;
    this.storage = options.storage;
    this.expectSession = options.expectSession ?? false;
    this.builder.addEventListener('levelBuilt', () => {
      this.pending = true;
      this.ready = false;
      this.placement = 'idle';
      this.reason = null;
      this.persisted = false;
      this.handle = null;
      this.attached = false;
      this.restoredNative = null;
      this.poseWaitFrames = 0;
    });
  }

  init(): void {
    this.cleanupFuncs.push(() => {
      this.pending = false;
      this.inFlight = false;
    });
  }

  debugApi(): VillageAnchorDebugApi {
    return {
      status: () => this.status(),
    };
  }

  status(): VillageAnchorStatus {
    return {
      ready: this.ready,
      placement: this.placement,
      reason: this.reason,
      persisted: this.persisted,
      handle: this.handle,
      surfaceId: this.surfaceId,
      persistentAnchorsSupported: this.persistentAnchorsSupported,
      storageAvailable: this.storageAvailable,
      attached: this.attached,
      hutPose: this.readHutPose(),
    };
  }

  update(_delta: number, _time: number): void {
    if (this.restoredNative && !this.ready) {
      this.finishRestoredPose();
      return;
    }
    if (!this.pending || this.inFlight) return;
    if (this.expectSession && (!this.getSession() || !this.getFrame())) return;
    this.inFlight = true;
    void this.placeVillage()
      .catch((error: unknown) => {
        warn('village placement failed; using largest-table fallback', error);
        this.applyFallback('restore-failed');
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  private async placeVillage(): Promise<void> {
    const graph = this.builder?.getGraph() ?? null;
    const hut = this.builder?.getVillageHutEntity() ?? null;
    if (!graph || !hut?.object3D) {
      this.pending = false;
      this.ready = true;
      this.placement = 'fallback';
      this.reason = 'no-table';
      return;
    }

    const session = this.getSession();
    const frame = this.getFrame();
    const support = inspectPersistentAnchorSupport(session, frame);
    this.persistentAnchorsSupported = support.restorePersistentAnchor;
    this.storageAvailable = isVillageAnchorStorageAvailable(this.storage);

    const decision = chooseVillageAnchorPlacement({
      storage: this.storage,
      persistentAnchorsSupported: this.persistentAnchorsSupported,
      graph,
    });
    this.surfaceId = decision.surfaceId;
    this.handle = decision.handle;

    if (decision.kind === 'restore' && session && decision.handle) {
      const restored = await this.restoreHandle(session, decision.handle);
      if (restored) {
        this.restoredNative = restored;
        this.placement = 'restored';
        this.reason = null;
        this.handle = decision.handle;
        this.poseWaitFrames = 0;
        this.pending = false;
        this.finishRestoredPose();
        return;
      }
      this.reason = 'restore-failed';
      warn('restorePersistentAnchor failed; falling back to largest table');
    } else {
      this.reason = decision.reason;
    }

    this.applyFallbackPose(hut, graph);
    this.placement = 'fallback';
    this.attachHut(hut);
    await this.persistHutAnchor(hut, session, frame);
    this.pending = false;
    this.ready = true;
    console.log(LOG, 'village hut on largest-table fallback', {
      reason: this.reason,
      surfaceId: this.surfaceId,
      persisted: this.persisted,
    });
  }

  private finishRestoredPose(): void {
    const hut = this.builder?.getVillageHutEntity();
    const graph = this.builder?.getGraph();
    if (!hut?.object3D) {
      this.ready = true;
      this.restoredNative = null;
      return;
    }
    const pose = this.poseFromNativeAnchor(this.restoredNative, this.getFrame());
    if (pose) {
      this.applyWorldPose(hut, pose);
      this.attached = true;
      this.ready = true;
      this.restoredNative = null;
      console.log(LOG, 'restored village hut from persistent anchor');
      return;
    }
    this.poseWaitFrames += 1;
    if (this.poseWaitFrames < 30) return;
    warn('restored anchor had no pose; keeping hut on largest table');
    if (graph) this.applyFallbackPose(hut, graph);
    this.attached = true;
    this.ready = true;
    this.restoredNative = null;
    console.log(LOG, 'restored village hut handle; pose unavailable this session');
  }

  private applyFallback(reason: VillageAnchorFallbackReason): void {
    const graph = this.builder?.getGraph() ?? null;
    const hut = this.builder?.getVillageHutEntity() ?? null;
    this.placement = 'fallback';
    this.reason = reason;
    if (graph && hut?.object3D) {
      this.surfaceId = chooseLargestTable(graph)?.id ?? null;
      this.applyFallbackPose(hut, graph);
      this.attachHut(hut);
    } else {
      this.surfaceId = null;
      this.reason = 'no-table';
    }
    this.pending = false;
    this.ready = true;
  }

  private applyFallbackPose(hut: Entity, graph: SurfaceGraph): void {
    const pose = villageFallbackPose(graph);
    if (!pose) return;
    this.applyWorldPose(hut, {
      x: pose.position[0],
      y: pose.position[1],
      z: pose.position[2],
    });
    this.surfaceId = chooseLargestTable(graph)?.id ?? this.surfaceId;
  }

  private applyWorldPose(hut: Entity, pose: VillageAnchorHutPose): void {
    const object = hut.object3D;
    if (!object) return;
    this.tmpPos.set(pose.x, pose.y, pose.z);
    const parent = object.parent;
    if (parent) {
      parent.worldToLocal(this.tmpPos);
    }
    object.position.copy(this.tmpPos);
  }

  private attachHut(hut: Entity): void {
    try {
      if (!hut.hasComponent(XRAnchor)) {
        hut.addComponent(XRAnchor);
      }
      this.attached = true;
    } catch (error: unknown) {
      warn('XRAnchor component not available', error);
      this.attached = false;
    }
  }

  private async persistHutAnchor(
    hut: Entity,
    session: NativeXrSession | null,
    frame: NativeXrFrame | null
  ): Promise<void> {
    if (!session || !frame) {
      return;
    }
    const native = await this.createNativeAnchor(hut, frame);
    if (!native) return;
    const handle = await this.requestHandle(native);
    if (!handle) return;
    const wrote = writeVillageAnchorHandle(this.storage, handle);
    this.persisted = wrote;
    this.handle = wrote ? handle : this.handle;
    if (!wrote) {
      this.storageAvailable = false;
      if (this.reason === null || this.reason === 'no-stored-handle') {
        this.reason = 'storage-unavailable';
      }
    }
  }

  private async restoreHandle(
    session: NativeXrSession,
    handle: string
  ): Promise<NativeXrAnchor | null> {
    if (typeof session.restorePersistentAnchor !== 'function') return null;
    try {
      const restored = await session.restorePersistentAnchor(handle);
      return restored ?? null;
    } catch (error: unknown) {
      warn('restorePersistentAnchor rejected', error);
      return null;
    }
  }

  private async createNativeAnchor(
    hut: Entity,
    frame: NativeXrFrame
  ): Promise<NativeXrAnchor | null> {
    const space = this.getReferenceSpace();
    const object = hut.object3D;
    if (!space || !object || typeof frame.createAnchor !== 'function') {
      return null;
    }
    const transform = this.hutTransform(object);
    if (!transform) return null;
    try {
      const created = await frame.createAnchor(transform, space);
      return created ?? null;
    } catch (error: unknown) {
      warn('frame.createAnchor failed', error);
      return null;
    }
  }

  private async requestHandle(anchor: NativeXrAnchor): Promise<string | null> {
    if (typeof anchor.requestPersistentHandle !== 'function') return null;
    try {
      const handle = await anchor.requestPersistentHandle();
      return typeof handle === 'string' ? handle : null;
    } catch (error: unknown) {
      warn('requestPersistentHandle failed', error);
      return null;
    }
  }

  private poseFromNativeAnchor(
    anchor: NativeXrAnchor | null,
    frame: NativeXrFrame | null
  ): VillageAnchorHutPose | null {
    const space = this.getReferenceSpace();
    if (!anchor || !frame || !space || !anchor.anchorSpace) return null;
    if (typeof frame.getPose !== 'function') return null;
    try {
      const pose = frame.getPose(anchor.anchorSpace, space);
      const position = pose?.transform.position;
      if (!position) return null;
      return { x: position.x, y: position.y, z: position.z };
    } catch {
      return null;
    }
  }

  private hutTransform(object: {
    updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void;
    getWorldPosition: (target: Vector3) => Vector3;
    getWorldQuaternion: (target: Quaternion) => Quaternion;
  }): XRRigidTransform | null {
    try {
      const Ctor = (
        globalThis as { XRRigidTransform?: typeof XRRigidTransform }
      ).XRRigidTransform;
      if (typeof Ctor !== 'function') return null;
      object.updateWorldMatrix(true, false);
      object.getWorldPosition(this.tmpPos);
      object.getWorldQuaternion(this.tmpQuat);
      return new Ctor(
        { x: this.tmpPos.x, y: this.tmpPos.y, z: this.tmpPos.z },
        {
          x: this.tmpQuat.x,
          y: this.tmpQuat.y,
          z: this.tmpQuat.z,
          w: this.tmpQuat.w,
        }
      );
    } catch {
      return null;
    }
  }

  private getSession(): NativeXrSession | null {
    try {
      return this.renderer.xr.getSession();
    } catch {
      return null;
    }
  }

  private getFrame(): NativeXrFrame | null {
    try {
      return this.renderer.xr.getFrame();
    } catch {
      return null;
    }
  }

  private getReferenceSpace(): XRSpace | null {
    try {
      return this.renderer.xr.getReferenceSpace();
    } catch {
      return null;
    }
  }

  private readHutPose(): VillageAnchorHutPose | null {
    const hut = this.builder?.getVillageHutEntity();
    const object = hut?.object3D;
    if (!object) return null;
    object.getWorldPosition(this.tmpPos);
    return { x: this.tmpPos.x, y: this.tmpPos.y, z: this.tmpPos.z };
  }
}
