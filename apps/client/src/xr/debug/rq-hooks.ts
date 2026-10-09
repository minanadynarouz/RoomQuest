/**
 * Shared `window.__rq` surface (F-05).
 *
 * X-04, F-05, and X-05 all attach here so no ticket re-declares `Window.__rq`.
 * Gated: Vite `import.meta.env.DEV` or `?debug=1`.
 *
 * X-05 registers the solver without touching the overlay:
 * `registerRqHook('autoSolve', async () => { ... })`
 */

import type { GameStore } from '../../game/index.js';
import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';
import type { HudPanelId } from '../../ui/visibility.js';
import {
  readClientFlags,
  shouldExposeDebugHooks,
  type ClientFlags,
} from '../flags.js';
import type { SnapTarget } from '../level/types.js';
import type { PlacementDebugApi } from '../systems/PlacementSystem.js';
import type { RqPerfStats } from './stats.js';

export interface RqHudDebug {
  ready: boolean;
  visible: readonly HudPanelId[];
}

export interface RqOverlayDebug {
  ready: boolean;
}

export interface RqGuidanceDebug {
  ready: boolean;
  onboardingActive: boolean;
  hintVisible: boolean;
  arrowVisible: boolean;
  angleDeg: number;
  looking: boolean;
  line: string | null;
  skipOnboarding: () => void;
  placeTargetAtAngle: (deg: number) => void;
}

export interface RqHooks {
  store?: GameStore;
  graph?: SurfaceGraph | null;
  plan?: LevelPlan | null;
  snapTargets?: readonly SnapTarget[];
  drawCalls?: number;
  hud?: RqHudDebug;
  overlay?: RqOverlayDebug;
  guidance?: RqGuidanceDebug;
  placement?: PlacementDebugApi | null;
  stats?: () => RqPerfStats;
  autoSolve?: () => Promise<void>;
  /** Debug/e2e: force the synthetic living-room plan into `playing`. */
  playSynthetic?: () => boolean;
  explorer?: RqExplorerDebug | null;
  /** F-07: pause the run (timer + explorer). */
  pause?: () => void;
  /** F-07: resume from the pause HUD. */
  resume?: () => void;
  /** F-07: jump to the win HUD without walking. */
  forceWin?: () => void;
}

/** X-05 walker debug surface. `getWorldPosition` matches F-06's ExplorerTarget. */
export interface RqExplorerDebug {
  state: () => string;
  reason: () => string | undefined;
  pose: () => { x: number; y: number; z: number; yaw: number };
  getWorldPosition: (out: { x: number; y: number; z: number }) => {
    x: number;
    y: number;
    z: number;
  };
}

export type RqHookName = keyof RqHooks;

export interface RqHookTarget {
  __rq?: RqHooks;
}

export interface RqHookGate {
  flags?: Pick<ClientFlags, 'debug'>;
  isDev?: boolean;
  target?: RqHookTarget;
}

declare global {
  interface Window {
    __rq?: RqHooks;
  }
}

const registered = new Map<RqHookName, unknown>();

function resolveTarget(explicit?: RqHookTarget): RqHookTarget {
  if (explicit) return explicit;
  if (typeof window === 'undefined') return {};
  return window;
}

export function rqHooksEnabled(
  flags: Pick<ClientFlags, 'debug'> = readClientFlags(),
  isDev = import.meta.env.DEV
): boolean {
  return shouldExposeDebugHooks(flags, isDev);
}

function enabledFrom(options?: RqHookGate): boolean {
  return rqHooksEnabled(
    options?.flags ?? readClientFlags(),
    options?.isDev ?? import.meta.env.DEV
  );
}

/**
 * Register (or replace) a named hook. X-05 calls this for `autoSolve`.
 * When gated off the fn is remembered but `window.__rq` is not created.
 */
export function registerRqHook<K extends RqHookName>(
  name: K,
  fn: NonNullable<RqHooks[K]>,
  options?: RqHookGate
): boolean {
  registered.set(name, fn);
  if (!enabledFrom(options)) return false;
  const target = resolveTarget(options?.target);
  const current = target.__rq ?? {};
  current[name] = fn;
  target.__rq = current;
  return true;
}

/**
 * Merge F-05/X-04 fields onto `window.__rq` without dropping registrations.
 * Registered hooks win so a later `exposeHooks()` cannot clobber `autoSolve`.
 */
export function installRqHooks(
  partial: RqHooks,
  options?: RqHookGate
): boolean {
  const target = resolveTarget(options?.target);
  if (!enabledFrom(options)) {
    if (target.__rq) delete target.__rq;
    return false;
  }
  const next: RqHooks = { ...target.__rq, ...partial };
  for (const [name, value] of registered) {
    (next as Record<RqHookName, unknown>)[name] = value;
  }
  target.__rq = next;
  return true;
}

export function resetRqHooks(target?: RqHookTarget): void {
  registered.clear();
  const resolved = resolveTarget(target);
  if (resolved.__rq) delete resolved.__rq;
}
