/**
 * F-06: onboarding sequencer, head-gaze hint, FoV edge arrow + chirp.
 *
 * Prefers IWSDK GazeSystem's pointer (`input.xr.gazePointer`) when it can
 * target; otherwise a viewer-pose ray from the head / camera. Explorer
 * position comes from `ExplorerTarget` (F-04 stub today, X-05 walker later).
 */

import {
  ConeGeometry,
  GazeSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import type { GameStore } from '../game/index.js';
import { getExplorerTarget, setExplorerTarget } from './explorer-target.js';
import {
  isLookingAtExplorer,
  isOutOfView,
  writeEdgeArrowPose,
  angleFromViewDeg,
  type EdgeArrowPose,
} from './guidance/angle-from-view.js';
import { playExplorerChirp } from './guidance/chirp.js';
import {
  createDwellState,
  resetDwell,
  tickDwell,
} from './guidance/dwell-timer.js';
import {
  beginOnboarding,
  createOnboardingState,
  currentOnboardingLine,
  skipOnboarding,
  tickOnboarding,
  type OnboardingStorage,
} from './guidance/onboarding.js';
import {
  bindSkipOnboarding,
  readGuidanceOverlay,
  writeGuidanceOverlay,
} from './guidance/overlay.js';
import { selectGazeHint } from './visibility.js';

const ARROW_DISTANCE_M = 0.7;
const ARROW_RADIUS_M = 0.24;
const CHIRP_COOLDOWN_MS = 4000;
const MAX_DT_MS = 100;

interface GazePointerLike {
  canTarget?: () => boolean;
  getOrigin?: () => { x: number; y: number; z: number };
  getDirection?: () => { x: number; y: number; z: number };
}

let boundStore: GameStore | null = null;
let boundStorage: OnboardingStorage | null = null;

export function bindGuidanceStore(
  store: GameStore,
  storage: OnboardingStorage | null = null
): void {
  boundStore = store;
  boundStorage = storage;
}

function browserStorage(): OnboardingStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    storage.getItem('rq.onboarding.probe');
    return storage;
  } catch {
    return null;
  }
}

export class GuidanceSystem extends createSystem({}) {
  private readonly tmpOrigin = new Vector3();
  private readonly tmpDir = new Vector3();
  private readonly tmpTarget = new Vector3();
  private readonly arrowPose: EdgeArrowPose = { x: 0, y: 0, z: 0, roll: 0 };
  private readonly dwell = createDwellState();
  private readonly onboarding = createOnboardingState();
  private readonly offsetTarget = {
    x: 0,
    y: 0,
    z: 0,
    getWorldPosition: (out: { x: number; y: number; z: number }) => {
      out.x = this.offsetTarget.x;
      out.y = this.offsetTarget.y;
      out.z = this.offsetTarget.z;
      return out;
    },
  };
  private arrowRoot: Group | null = null;
  private arrow: Mesh | null = null;
  private startedOnboarding = false;
  private wasOutOfView = false;
  private chirpCoolMs = 0;
  private gazeAvailable = false;
  private storage: OnboardingStorage | null = null;

  init(): void {
    this.storage = boundStorage ?? browserStorage();
    try {
      this.gazeAvailable = Boolean(this.world.getSystem(GazeSystem));
    } catch {
      this.gazeAvailable = false;
    }
    bindSkipOnboarding(() => {
      skipOnboarding(this.onboarding, this.storage);
    });
    this.mountArrow();
    this.cleanupFuncs.push(() => {
      this.arrowRoot?.removeFromParent();
      this.arrow?.geometry.dispose();
      (this.arrow?.material as MeshBasicMaterial | undefined)?.dispose();
      this.arrowRoot = null;
      this.arrow = null;
    });
  }

  update(delta: number): void {
    const store = boundStore;
    const dtMs = Math.min((delta > 0 ? delta : 0) * 1000, MAX_DT_MS);
    if (this.chirpCoolMs > 0) {
      this.chirpCoolMs -= dtMs;
      if (this.chirpCoolMs < 0) this.chirpCoolMs = 0;
    }

    if (store?.phase !== 'playing') {
      if (store?.phase !== 'paused') {
        this.startedOnboarding = false;
        resetDwell(this.dwell);
      }
      this.setArrowVisible(false);
      writeGuidanceOverlay({
        onboardingActive: false,
        skipVisible: false,
        hintVisible: false,
        arrowVisible: false,
        angleDeg: 0,
        looking: false,
        line: null,
      });
      this.publishDebug();
      return;
    }

    if (!this.startedOnboarding) {
      beginOnboarding(this.onboarding, this.storage);
      this.startedOnboarding = true;
    }
    tickOnboarding(this.onboarding, dtMs, this.storage);

    this.sampleViewRay(this.tmpOrigin, this.tmpDir);
    const explorer = getExplorerTarget();
    if (!explorer) {
      this.setArrowVisible(false);
      this.writePlayingOverlay(store, 0, false, false, false);
      this.publishDebug();
      return;
    }
    explorer.getWorldPosition(this.tmpTarget);

    const angleDeg = angleFromViewDeg(
      this.tmpOrigin.x,
      this.tmpOrigin.y,
      this.tmpOrigin.z,
      this.tmpDir.x,
      this.tmpDir.y,
      this.tmpDir.z,
      this.tmpTarget.x,
      this.tmpTarget.y,
      this.tmpTarget.z
    );
    const outOfView = isOutOfView(angleDeg);
    const looking = !outOfView && isLookingAtExplorer(angleDeg);
    const hintVisible = tickDwell(this.dwell, dtMs, looking);

    if (outOfView && !this.wasOutOfView) {
      store.explorerOutOfView();
      if (this.chirpCoolMs <= 0) {
        playExplorerChirp();
        this.chirpCoolMs = CHIRP_COOLDOWN_MS;
      }
    }
    this.wasOutOfView = outOfView;

    if (outOfView) {
      writeEdgeArrowPose(
        this.tmpOrigin.x,
        this.tmpOrigin.y,
        this.tmpOrigin.z,
        this.tmpDir.x,
        this.tmpDir.y,
        this.tmpDir.z,
        this.tmpTarget.x,
        this.tmpTarget.y,
        this.tmpTarget.z,
        ARROW_DISTANCE_M,
        ARROW_RADIUS_M,
        this.arrowPose
      );
      this.placeArrow(this.arrowPose, this.tmpTarget);
    }
    this.setArrowVisible(outOfView);

    this.writePlayingOverlay(store, angleDeg, looking, hintVisible, outOfView);
    this.publishDebug();
  }

  /** Debug / e2e: park a stand-in explorer at `deg` from the current view. */
  placeTargetAtAngle(deg: number): void {
    this.sampleViewRay(this.tmpOrigin, this.tmpDir);
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const fx = this.tmpDir.x;
    const fz = this.tmpDir.z;
    const rx = fx * cos - fz * sin;
    const rz = fx * sin + fz * cos;
    const len = Math.hypot(rx, rz) || 1;
    this.offsetTarget.x = this.tmpOrigin.x + (rx / len) * 0.9;
    this.offsetTarget.y = this.tmpOrigin.y - 0.35;
    this.offsetTarget.z = this.tmpOrigin.z + (rz / len) * 0.9;
    setExplorerTarget(this.offsetTarget);
  }

  private writePlayingOverlay(
    store: GameStore,
    angleDeg: number,
    looking: boolean,
    hintVisible: boolean,
    arrowVisible: boolean
  ): void {
    const onboardingLine = currentOnboardingLine(this.onboarding);
    const onboardingActive = this.onboarding.active;
    let line: string | null = onboardingLine;
    if (!onboardingActive && hintVisible) {
      line = selectGazeHint(store.plan);
    }
    writeGuidanceOverlay({
      onboardingActive,
      skipVisible: onboardingActive,
      hintVisible: hintVisible && !onboardingActive,
      arrowVisible,
      angleDeg,
      looking,
      line,
    });
  }

  private sampleViewRay(origin: Vector3, dir: Vector3): void {
    const pointer = this.gazePointer();
    if (pointer?.canTarget?.() && pointer.getOrigin && pointer.getDirection) {
      const o = pointer.getOrigin();
      const d = pointer.getDirection();
      origin.set(o.x, o.y, o.z);
      dir.set(d.x, d.y, d.z);
      return;
    }
    if (this.renderer.xr.isPresenting) {
      this.player.head.getWorldPosition(origin);
      this.player.head.getWorldDirection(dir);
      return;
    }
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(dir);
  }

  private gazePointer(): GazePointerLike | null {
    if (!this.gazeAvailable) return null;
    const xr = this.input.xr as { gazePointer?: GazePointerLike };
    return xr.gazePointer ?? null;
  }

  private mountArrow(): void {
    const root = new Group();
    root.name = 'explorer-edge-arrow';
    const geometry = new ConeGeometry(0.018, 0.055, 8);
    const material = new MeshBasicMaterial({
      color: 0xffc14a,
      toneMapped: false,
      depthTest: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.renderOrder = 10;
    root.add(mesh);
    root.visible = false;
    this.scene.add(root);
    this.arrowRoot = root;
    this.arrow = mesh;
  }

  private placeArrow(pose: EdgeArrowPose, lookAt: Vector3): void {
    const root = this.arrowRoot;
    if (!root) return;
    root.position.set(pose.x, pose.y, pose.z);
    root.lookAt(lookAt);
  }

  private setArrowVisible(visible: boolean): void {
    if (this.arrowRoot) this.arrowRoot.visible = visible;
  }

  private publishDebug(): void {
    if (typeof window === 'undefined' || !window.__rq) return;
    const overlay = readGuidanceOverlay();
    window.__rq.guidance = {
      ready: true,
      onboardingActive: overlay.onboardingActive,
      hintVisible: overlay.hintVisible,
      arrowVisible: overlay.arrowVisible,
      angleDeg: overlay.angleDeg,
      looking: overlay.looking,
      line: overlay.line,
      skipOnboarding: overlay.skipOnboarding,
      placeTargetAtAngle: (deg: number) => {
        this.placeTargetAtAngle(deg);
      },
    };
  }
}
