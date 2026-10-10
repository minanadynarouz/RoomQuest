/**
 * F-05 debug/perf overlay. Loaded only when `?debug=1`.
 *
 * UIKitML panel leashed beside the HUD, plus a DOM panel when XR is not
 * presenting. Frame loop: ring-buffer FPS (no alloc) and a 250 ms UI throttle.
 */

import {
  createSystem,
  FollowBehavior,
  Follower,
  Group,
  PokeInteractable,
  RayInteractable,
  UIKitMLAsset,
  type Entity,
} from '@iwsdk/core';
import type { GameStore } from '../../game/index.js';
import type { SurfaceGraph } from '@roomquest/schema';
import { formatDebugBlock, formatDebugLines } from './format.js';
import { setOverlayReady, writeLatestPerfStats } from './hooks.js';
import {
  DEBUG_FOLLOW_MAX_ANGLE_DEG,
  DEBUG_PANEL_OFFSET,
  DEBUG_PANEL_SCALE,
  DEBUG_UI_THROTTLE_MS,
} from './placement.js';
import { RollingFps } from './rolling-fps.js';
import {
  EMPTY_PERF_STATS,
  perfSignature,
  readRendererInfo,
  type RqPerfStats,
} from './stats.js';
import {
  disposeDomDebugOverlay,
  syncDomDebugOverlay,
} from './dom-overlay.js';

interface TextLike {
  setProperties: (props: { text?: string }) => void;
}

export interface DebugOverlayBindings {
  store: GameStore;
  getGraph: () => SurfaceGraph | null;
  refreshHooks?: () => void;
}

let bindings: DebugOverlayBindings | null = null;

export function bindDebugOverlay(next: DebugOverlayBindings): void {
  bindings = next;
}

function setText(asset: UIKitMLAsset, id: string, text: string): void {
  const el = asset.getElementById(id) as TextLike | null;
  el?.setProperties({ text });
}

export class DebugOverlaySystem extends createSystem({}) {
  private readonly fps = new RollingFps();
  private readonly scratch: RqPerfStats = { ...EMPTY_PERF_STATS };
  private root: Entity | null = null;
  private panelEntity: Entity | null = null;
  private asset: UIKitMLAsset | null = null;
  private mounted = false;
  private lastUiMs = 0;
  private lastSignature = '';

  init(): void {
    this.cleanupFuncs.push(() => {
      this.panelEntity?.dispose({ disposeResources: false });
      this.root?.dispose({ disposeResources: false });
      this.panelEntity = null;
      this.root = null;
      this.asset = null;
      setOverlayReady(false);
      this.mounted = false;
      disposeDomDebugOverlay();
    });
    void this.mount();
  }

  update(): void {
    const now = performance.now();
    this.fps.push(now);
    if (now - this.lastUiMs < DEBUG_UI_THROTTLE_MS && this.lastSignature !== '') {
      return;
    }
    this.lastUiMs = now;
    this.sample(now);
  }

  private sample(nowMs: number): void {
    const store = bindings?.store;
    const graph = bindings?.getGraph() ?? null;
    const render = readRendererInfo(this.renderer);
    this.scratch.fps = this.fps.fps(nowMs);
    this.scratch.drawCalls = render.calls;
    this.scratch.triangles = render.triangles;
    this.scratch.surfaces = graph?.nodes.length ?? 0;
    this.scratch.source = store?.planSource ?? null;
    this.scratch.latencyMs = store?.directorLatencyMs ?? null;
    this.scratch.repairs = store?.repairs.length ?? 0;
    this.scratch.fallbackReason = store?.fallbackReason ?? null;
    this.scratch.validationIssues = store?.validationIssues.length ?? 0;
    this.scratch.directorStatus = store?.directorRequest.value.status ?? 'idle';
    this.scratch.requestId = store?.directorRequest.value.requestId ?? null;
    writeLatestPerfStats(this.scratch);

    const signature = perfSignature(this.scratch);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.apply(this.scratch);
    bindings?.refreshHooks?.();
  }

  private apply(stats: RqPerfStats): void {
    if (this.mounted && this.asset) {
      for (const line of formatDebugLines(stats)) {
        setText(this.asset, line.id, line.text);
      }
    }
    const presenting = this.renderer.xr.isPresenting;
    syncDomDebugOverlay(formatDebugBlock(stats), presenting);
  }

  private publishOverlayReady(): void {
    setOverlayReady(true);
  }

  private async mount(): Promise<void> {
    try {
      const asset = await this.world.assets.instantiate<UIKitMLAsset>(
        'debug-overlay'
      );
      asset.scale.setScalar(DEBUG_PANEL_SCALE);
      const rootGroup = new Group();
      rootGroup.name = 'debug-overlay-root';
      const root = this.world.createTransformEntity(rootGroup, {
        persistent: true,
      });
      this.root = root;
      const followTarget = this.world.xrEnabled ? this.player.head : this.camera;
      root.addComponent(Follower, {
        target: followTarget,
        offsetPosition: [
          DEBUG_PANEL_OFFSET[0],
          DEBUG_PANEL_OFFSET[1],
          DEBUG_PANEL_OFFSET[2],
        ],
        behavior: FollowBehavior.PivotY,
        speed: 2,
        tolerance: 0.35,
        maxAngle: DEBUG_FOLLOW_MAX_ANGLE_DEG,
      });

      const entity = this.world.createTransformEntity(asset, {
        parent: root,
        persistent: true,
      });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      this.panelEntity = entity;
      this.asset = asset;
      this.mounted = true;
      this.publishOverlayReady();
      this.sample(performance.now());
      console.log('[F-05] Debug overlay mounted');
    } catch (error) {
      console.error('[F-05] Failed to mount debug overlay', error);
    }
  }
}
