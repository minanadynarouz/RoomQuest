import { createSystem, Vector3, type Entity, type Object3D } from '@iwsdk/core';
import { explorerPath } from '@roomquest/level-core';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import type { GameStore } from '../../game/index.js';
import { setExplorerTarget } from '../../ui/explorer-target.js';
import { setExplorerAnchor } from '../../ui/HudSystem.js';
import { createExplorerModel } from '../explorer/model.js';
import { isExplorerOutOfView } from '../explorer/out-of-view.js';
import {
  ExplorerWalker,
  type ExplorerPose,
  type ExplorerStateName,
} from '../explorer/walker.js';
import type { LevelBuilderSystem } from './LevelBuilderSystem.js';

export interface ExplorerDebugApi {
  state: () => ExplorerStateName;
  reason: () => string | undefined;
  pose: () => ExplorerPose;
  getWorldPosition: (out: {
    x: number;
    y: number;
    z: number;
  }) => { x: number; y: number; z: number };
}

/**
 * Kinematic explorer walker. No physics, no per-frame allocations.
 */
export class ExplorerSystem extends createSystem({}, {}) {
  private readonly walker = new ExplorerWalker();
  private readonly pose: ExplorerPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly tmpHead = new Vector3();
  private readonly tmpFwd = new Vector3();
  private readonly camPos: [number, number, number] = [0, 0, 0];
  private readonly camFwd: [number, number, number] = [0, 0, -1];
  private readonly explorerPos: [number, number, number] = [0, 0, 0];
  private builder: LevelBuilderSystem | null = null;
  private store: GameStore | null = null;
  private model: Object3D | null = null;
  private entity: Entity | null = null;
  private started = false;
  private gemHideCursor = 0;

  configure(options: { builder: LevelBuilderSystem; store: GameStore }): void {
    this.builder = options.builder;
    this.store = options.store;
  }

  init(): void {
    const model = createExplorerModel();
    this.model = model;
    this.entity = this.world.createTransformEntity(model, { persistent: true });
    setExplorerAnchor(model);
    this.cleanupFuncs.push(() => {
      setExplorerAnchor(null);
      setExplorerTarget(null);
      this.entity?.dispose({ disposeResources: false });
      this.entity = null;
      this.model = null;
    });
  }

  begin(plan: LevelPlan, graph: SurfaceGraph): void {
    const path = explorerPath(plan, graph);
    this.gemHideCursor = 0;
    if (this.store) {
      this.walker.begin(path, plan, this.store);
    }
    this.started = true;
    this.syncModel(0);
  }

  getWorldPosition(out: { x: number; y: number; z: number }): {
    x: number;
    y: number;
    z: number;
  } {
    return this.walker.getWorldPosition(out);
  }

  debugApi(): ExplorerDebugApi {
    return {
      state: () => this.walker.state,
      reason: () => this.walker.reason,
      pose: () => this.walker.pose,
      getWorldPosition: (out) => this.getWorldPosition(out),
    };
  }

  update(delta: number, time: number): void {
    if (!this.started || !this.store) return;
    this.walker.update(delta, time);
    this.syncModel(time);
    this.emitOutOfView();
    this.hideCollectedGems();
  }

  private syncModel(time: number): void {
    const model = this.model;
    if (!model) return;
    this.walker.writePose(this.pose);
    model.position.set(
      this.pose.x,
      this.pose.y + this.walker.bobOffset(time),
      this.pose.z
    );
    model.rotation.set(0, this.pose.yaw, 0);
  }

  private emitOutOfView(): void {
    if (this.renderer.xr.isPresenting) {
      this.player.head.getWorldPosition(this.tmpHead);
      this.player.head.getWorldDirection(this.tmpFwd);
    } else {
      this.camera.getWorldPosition(this.tmpHead);
      this.camera.getWorldDirection(this.tmpFwd);
    }
    this.camPos[0] = this.tmpHead.x;
    this.camPos[1] = this.tmpHead.y;
    this.camPos[2] = this.tmpHead.z;
    this.camFwd[0] = this.tmpFwd.x;
    this.camFwd[1] = this.tmpFwd.y;
    this.camFwd[2] = this.tmpFwd.z;
    this.explorerPos[0] = this.pose.x;
    this.explorerPos[1] = this.pose.y;
    this.explorerPos[2] = this.pose.z;
    this.walker.checkOutOfView(
      isExplorerOutOfView(this.camPos, this.camFwd, this.explorerPos)
    );
  }

  private hideCollectedGems(): void {
    const store = this.store;
    const builder = this.builder;
    if (!store || !builder) return;
    const events = store.events;
    while (this.gemHideCursor < events.length) {
      const event = events[this.gemHideCursor];
      this.gemHideCursor += 1;
      if (event?.type !== 'gemCollected') continue;
      const mounted = builder.getMounted();
      if (!mounted) continue;
      for (const piece of mounted.pieces) {
        if (piece.placement.id === event.placementId) {
          piece.object.visible = false;
          break;
        }
      }
    }
  }
}
