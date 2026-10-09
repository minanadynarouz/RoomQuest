/**
 * X-05 plug-in point (F-06).
 *
 * F-04's stub explorer implements this. X-05 calls `setExplorerTarget` with
 * the real walker so gaze / edge-arrow keep working without editing F-06.
 * Do not create or edit `ExplorerSystem` here.
 */

export interface ExplorerVec3 {
  x: number;
  y: number;
  z: number;
}

export interface ExplorerTarget {
  getWorldPosition(out: ExplorerVec3): ExplorerVec3;
}

let customTarget: ExplorerTarget | null = null;
let fallbackTarget: ExplorerTarget | null = null;

/**
 * X-05: register the walking explorer. Pass `null` to restore the F-04 stub.
 */
export function setExplorerTarget(target: ExplorerTarget | null): void {
  customTarget = target;
}

/** F-04 stub (and tests) register the default target used until X-05 plugs in. */
export function setFallbackExplorerTarget(target: ExplorerTarget | null): void {
  fallbackTarget = target;
}

export function getExplorerTarget(): ExplorerTarget | null {
  return customTarget ?? fallbackTarget;
}

export function asExplorerTarget(object: {
  getWorldPosition: (out: never) => unknown;
}): ExplorerTarget {
  return {
    getWorldPosition(out: ExplorerVec3): ExplorerVec3 {
      object.getWorldPosition(out as never);
      return out;
    },
  };
}

export function resetExplorerTarget(): void {
  customTarget = null;
  fallbackTarget = null;
}
