/**
 * F-04 HUD: UIKitML spatial panels driven by the F-02 game store.
 *
 * World-space only (no ScreenSpace / DOM overlay in XR). Poke + ray via
 * PokeInteractable and RayInteractable. Leashed to the head with Follower
 * (PivotY, ≤ 30° / 0.8 m, below eye). Dialogue billboards above a stub
 * explorer until X-05 provides a real anchor.
 */

import {
  createSystem,
  FollowBehavior,
  Follower,
  Group,
  PokeInteractable,
  RayInteractable,
  UIKitMLAsset,
  Vector3,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import type { GamePhase, GameStore } from '../game/index.js';
import type { HudActions } from './hud-actions.js';
import {
  asExplorerTarget,
  setExplorerTarget,
  setFallbackExplorerTarget,
} from './explorer-target.js';
import { readGuidanceOverlay } from './guidance/overlay.js';
import { createExplorerStub } from './explorer-stub.js';
import {
  DIALOGUE_HEIGHT_M,
  EXPLORER_STUB_DISTANCE_M,
  EXPLORER_STUB_DROP_M,
  HUD_CHIP_SCALE,
  HUD_DIALOGUE_SCALE,
  HUD_DISTANCE_M,
  HUD_DROP_M,
  HUD_FOLLOW_MAX_ANGLE_DEG,
  HUD_MODAL_SCALE,
} from './placement.js';
import { setObjectTreeVisible } from './tree-visible.js';
import {
  mapStoreToHud,
  snapshotGameStore,
  visiblePanelIds,
  type HudPanelContent,
  type HudPanelId,
} from './visibility.js';

let boundStore: GameStore | null = null;
let explorerAnchor: Object3D | null = null;
let hudActions: HudActions | null = null;

export type { HudActions };

export function bindHudStore(store: GameStore): void {
  boundStore = store;
}

export function bindHudActions(actions: HudActions | null): void {
  hudActions = actions;
}

/**
 * X-05 hook: billboard the dialogue bubble above this object instead of
 * the stub explorer. Pass `null` to restore the stub.
 */
export function setExplorerAnchor(object: Object3D | null): void {
  explorerAnchor = object;
  setExplorerTarget(object ? asExplorerTarget(object) : null);
}

interface TextLike {
  setProperties: (props: { text?: string }) => void;
}

interface ClickLike {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

interface MountedPanel {
  id: HudPanelId;
  entity: Entity;
  asset: UIKitMLAsset;
}

const PANEL_ASSETS: Record<HudPanelId, string> = {
  surveying: 'hud-surveying',
  dialogue: 'hud-dialogue',
  beatGoal: 'hud-beat',
  noSurfaces: 'hud-no-surfaces',
  pause: 'hud-pause',
  win: 'hud-win',
};

function panelScale(id: HudPanelId): number {
  if (id === 'dialogue') return HUD_DIALOGUE_SCALE;
  if (id === 'beatGoal') return HUD_CHIP_SCALE;
  return HUD_MODAL_SCALE;
}

function viewSignature(view: HudPanelContent): string {
  return [
    view.surveying.visible,
    view.surveying.body,
    view.dialogue.visible,
    view.dialogue.line,
    view.dialogue.skipVisible,
    view.beatGoal.visible,
    view.beatGoal.goal,
    view.beatGoal.beatLabel,
    view.noSurfaces.visible,
    view.pause.visible,
    view.win.visible,
    view.win.starsLabel,
    view.win.statsLabel,
    view.win.tomorrowLabel,
    view.win.title,
  ].join('|');
}

function setText(asset: UIKitMLAsset, id: string, text: string): void {
  const el = asset.getElementById(id) as TextLike | null;
  el?.setProperties({ text });
}

export class HudSystem extends createSystem({}) {
  private readonly tmpHead = new Vector3();
  private readonly tmpFwd = new Vector3();
  private readonly tmpPos = new Vector3();
  private hudRoot: Entity | null = null;
  private explorerEntity: Entity | null = null;
  private explorerObject: Object3D | null = null;
  private customExplorer: Object3D | null = null;
  private panels = new Map<HudPanelId, MountedPanel>();
  private mounted = false;
  private lastSignature = '';
  private usingStub = true;
  private stubPinned = false;
  private lastPhase: GamePhase | null = null;
  private lastBeat = -1;
  private lastEventCount = -1;
  private lastOverlayLine: string | null = null;
  private lastSkip = false;
  private lastStars = -1;
  private lastGems = -1;
  private lastTimeMs = -1;

  init(): void {
    this.cleanupFuncs.push(() => {
      this.hudRoot?.dispose({ disposeResources: false });
      this.explorerEntity?.dispose({ disposeResources: false });
      for (const panel of this.panels.values()) {
        panel.entity.dispose({ disposeResources: false });
      }
      this.panels.clear();
      this.mounted = false;
    });
    this.hideScaffoldWelcome();
    void this.mount();
  }

  applyExplorerAnchor(object: Object3D | null): void {
    this.customExplorer = object;
    this.usingStub = object === null;
    if (this.explorerObject) {
      this.explorerObject.visible = this.usingStub;
    }
    const target = object ?? this.explorerObject;
    const dialogue = this.panels.get('dialogue');
    if (target && dialogue?.entity.hasComponent(Follower)) {
      dialogue.entity.setValue(Follower, 'target', target);
    }
  }

  update(): void {
    if (!this.mounted || !boundStore) return;
    if (this.customExplorer !== explorerAnchor) {
      this.applyExplorerAnchor(explorerAnchor);
    }
    this.syncStubPose();
    this.billboardDialogue();
    if (!this.hudInputsChanged(boundStore)) return;
    const overlay = readGuidanceOverlay();
    const view = mapStoreToHud(snapshotGameStore(boundStore), {
      line: overlay.line,
      skipVisible: overlay.skipVisible,
    });
    const signature = viewSignature(view);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.applyView(view);
  }

  /** Primitive-field dirty check; allocates nothing. */
  private hudInputsChanged(store: GameStore): boolean {
    const overlay = readGuidanceOverlay();
    const result = store.result;
    const stars = result?.stars ?? -1;
    const gems = result?.gems ?? -1;
    const timeMs = result?.timeMs ?? -1;
    if (
      store.phase === this.lastPhase &&
      store.state.currentBeatIndex === this.lastBeat &&
      store.events.length === this.lastEventCount &&
      overlay.line === this.lastOverlayLine &&
      overlay.skipVisible === this.lastSkip &&
      stars === this.lastStars &&
      gems === this.lastGems &&
      timeMs === this.lastTimeMs
    ) {
      return false;
    }
    this.lastPhase = store.phase;
    this.lastBeat = store.state.currentBeatIndex;
    this.lastEventCount = store.events.length;
    this.lastOverlayLine = overlay.line;
    this.lastSkip = overlay.skipVisible;
    this.lastStars = stars;
    this.lastGems = gems;
    this.lastTimeMs = timeMs;
    return true;
  }

  private hideScaffoldWelcome(): void {
    const welcome = this.world.getSceneObject('welcome-panel');
    if (welcome) setObjectTreeVisible(welcome, false);
  }

  private async mount(): Promise<void> {
    const store = boundStore;
    if (!store) {
      console.warn('[HUD] bindHudStore() before registering HudSystem');
      return;
    }

    try {
      await this.mountPanels(store);
    } catch (error) {
      console.error('[HUD] Failed to mount spatial panels', error);
    }
  }

  private async mountPanels(store: GameStore): Promise<void> {
    const hudRootGroup = new Group();
    hudRootGroup.name = 'hud-root';
    const hudRootObject = this.world.createTransformEntity(hudRootGroup, {
      persistent: true,
    });
    this.hudRoot = hudRootObject;
    const followTarget = this.world.xrEnabled ? this.player.head : this.camera;
    hudRootObject.addComponent(Follower, {
      target: followTarget,
      offsetPosition: [0, -HUD_DROP_M, -HUD_DISTANCE_M],
      behavior: FollowBehavior.PivotY,
      speed: 2,
      tolerance: 0.35,
      maxAngle: HUD_FOLLOW_MAX_ANGLE_DEG,
    });

    const stub = createExplorerStub();
    this.explorerObject = stub;
    this.explorerEntity = this.world.createTransformEntity(stub, {
      persistent: true,
    });
    this.applyExplorerAnchor(explorerAnchor);
    stub.visible = this.usingStub;
    setFallbackExplorerTarget(asExplorerTarget(stub));

    const ids: HudPanelId[] = [
      'surveying',
      'beatGoal',
      'noSurfaces',
      'pause',
      'win',
      'dialogue',
    ];

    for (const id of ids) {
      const asset = await this.world.assets.instantiate<UIKitMLAsset>(
        PANEL_ASSETS[id]
      );
      asset.scale.setScalar(panelScale(id));
      const parent =
        id === 'dialogue'
          ? undefined
          : { parent: hudRootObject, persistent: true };
      const entity = this.world.createTransformEntity(
        asset,
        parent ?? { persistent: true }
      );
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      if (id === 'dialogue') {
        const target = this.customExplorer ?? stub;
        entity.addComponent(Follower, {
          target,
          offsetPosition: [0, DIALOGUE_HEIGHT_M, 0],
          behavior: FollowBehavior.NoRotation,
          speed: 8,
          tolerance: 0.02,
          maxAngle: 180,
        });
      }
      this.panels.set(id, { id, entity, asset });
      this.bindButtons(id, asset, store);
    }

    this.mounted = true;
    const view = mapStoreToHud(snapshotGameStore(store));
    this.lastSignature = viewSignature(view);
    this.applyView(view);
    console.log('[HUD] Spatial panels mounted', visiblePanelIds(view));
  }

  private bindButtons(
    id: HudPanelId,
    asset: UIKitMLAsset,
    store: GameStore
  ): void {
    const click = (elementId: string, handler: () => void): void => {
      const el = asset.getElementById(elementId) as ClickLike | null;
      if (!el) return;
      el.addEventListener('click', handler);
      this.cleanupFuncs.push(() => {
        el.removeEventListener('click', handler);
      });
    };

    if (id === 'dialogue') {
      click('dialogue-skip', () => {
        readGuidanceOverlay().skipOnboarding();
      });
    }
    if (id === 'beatGoal') {
      click('beat-pause', () => {
        if (hudActions) hudActions.pause();
        else store.pause();
      });
    }
    if (id === 'noSurfaces') {
      click('no-surfaces-retry', () => {
        store.startSurveying();
      });
    }
    if (id === 'pause') {
      click('pause-resume', () => {
        if (hudActions) hudActions.resume();
        else store.resume();
      });
      click('pause-restart', () => {
        if (hudActions) hudActions.replay();
        else store.replay();
      });
      click('pause-exit', () => {
        if (hudActions) hudActions.exit();
        else this.exitToLanding(store);
      });
    }
    if (id === 'win') {
      click('win-replay', () => {
        if (hudActions) hudActions.replay();
        else store.replay();
      });
      click('win-exit', () => {
        if (hudActions) hudActions.exit();
        else this.exitToLanding(store);
      });
    }
  }

  private exitToLanding(store: GameStore): void {
    store.exit();
    this.world.exitXR();
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = '';
  }

  private applyView(view: HudPanelContent): void {
    this.setPanelVisible('surveying', view.surveying.visible);
    this.setPanelVisible('dialogue', view.dialogue.visible);
    this.setPanelVisible('beatGoal', view.beatGoal.visible);
    this.setPanelVisible('noSurfaces', view.noSurfaces.visible);
    this.setPanelVisible('pause', view.pause.visible);
    this.setPanelVisible('win', view.win.visible);

    const surveying = this.panels.get('surveying');
    if (surveying && view.surveying.visible) {
      setText(surveying.asset, 'surveying-title', view.surveying.title);
      setText(surveying.asset, 'surveying-body', view.surveying.body);
    }

    const dialogue = this.panels.get('dialogue');
    if (dialogue && view.dialogue.visible) {
      setText(dialogue.asset, 'dialogue-line', view.dialogue.line);
      const skip = dialogue.asset.getElementById('dialogue-skip') as {
        setProperties: (props: { display?: string }) => void;
      } | null;
      skip?.setProperties({
        display: view.dialogue.skipVisible ? 'flex' : 'none',
      });
    }

    const beat = this.panels.get('beatGoal');
    if (beat && view.beatGoal.visible) {
      setText(beat.asset, 'beat-label', view.beatGoal.beatLabel);
      setText(beat.asset, 'beat-goal', view.beatGoal.goal);
    }

    const none = this.panels.get('noSurfaces');
    if (none && view.noSurfaces.visible) {
      setText(none.asset, 'no-surfaces-title', view.noSurfaces.title);
      setText(none.asset, 'no-surfaces-body', view.noSurfaces.body);
    }

    const pause = this.panels.get('pause');
    if (pause && view.pause.visible) {
      setText(pause.asset, 'pause-title', view.pause.title);
    }

    const win = this.panels.get('win');
    if (win && view.win.visible) {
      setText(win.asset, 'win-title', view.win.title);
      setText(win.asset, 'win-stars', view.win.starsLabel);
      setText(win.asset, 'win-stats', view.win.statsLabel);
      setText(win.asset, 'win-tomorrow', view.win.tomorrowLabel);
    }

    if (this.explorerObject) {
      this.explorerObject.visible =
        this.usingStub && (view.dialogue.visible || view.beatGoal.visible);
    }

    this.publishDebug(view);
  }

  private setPanelVisible(id: HudPanelId, visible: boolean): void {
    const panel = this.panels.get(id);
    const object = panel?.entity.object3D ?? panel?.asset;
    if (object) setObjectTreeVisible(object, visible);
  }

  private syncStubPose(): void {
    if (!this.usingStub || !this.explorerObject) return;
    const phase = boundStore?.phase;
    const playing = phase === 'playing' || phase === 'paused';
    if (playing && this.stubPinned) return;
    if (!playing) this.stubPinned = false;
    if (this.renderer.xr.isPresenting) {
      this.player.head.getWorldPosition(this.tmpHead);
      this.player.head.getWorldDirection(this.tmpFwd);
    } else {
      this.camera.getWorldPosition(this.tmpHead);
      this.camera.getWorldDirection(this.tmpFwd);
    }
    this.tmpPos.copy(this.tmpHead);
    this.tmpPos.addScaledVector(this.tmpFwd, EXPLORER_STUB_DISTANCE_M);
    this.tmpPos.y = this.tmpHead.y - EXPLORER_STUB_DROP_M;
    this.explorerObject.position.copy(this.tmpPos);
    if (playing) this.stubPinned = true;
  }

  private billboardDialogue(): void {
    const panel = this.panels.get('dialogue');
    const object = panel?.entity.object3D;
    if (!object?.visible) return;
    if (this.renderer.xr.isPresenting) {
      this.player.head.getWorldPosition(this.tmpHead);
    } else {
      this.camera.getWorldPosition(this.tmpHead);
    }
    object.getWorldPosition(this.tmpPos);
    const dx = this.tmpHead.x - this.tmpPos.x;
    const dz = this.tmpHead.z - this.tmpPos.z;
    object.rotation.y = Math.atan2(dx, dz);
  }

  private publishDebug(view: HudPanelContent): void {
    if (typeof window === 'undefined' || !window.__rq) return;
    window.__rq.hud = {
      ready: true,
      visible: visiblePanelIds(view),
    };
  }
}
