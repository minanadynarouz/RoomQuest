/**
 * Feature-checked fixed foveation (X-10 / X-01 findings).
 *
 * Three.js `WebGLRenderer.xr.setFoveation` writes `fixedFoveation` on the
 * XRWebGLLayer / projection layer. IWER may no-op; Quest applies it.
 * Call after the XR session starts.
 */

export interface XrFoveationHost {
  isPresenting?: boolean;
  setFoveation?: (level: number) => void;
  addEventListener?: (type: 'sessionstart', listener: () => void) => void;
}

export const FOVEATION_MAX = 1;

export function applyFixedFoveation(
  xr: XrFoveationHost | null | undefined,
  level = FOVEATION_MAX
): boolean {
  if (!xr || typeof xr.setFoveation !== 'function') {
    return false;
  }
  const clamped = level < 0 ? 0 : level > 1 ? 1 : level;
  xr.setFoveation(clamped);
  return true;
}

/**
 * Apply now if a session is presenting, and again on every `sessionstart`.
 * Returns whether the API was present (not whether the runtime honours it).
 */
export function bindFixedFoveation(
  xr: XrFoveationHost | null | undefined,
  level = FOVEATION_MAX
): boolean {
  if (!xr || typeof xr.setFoveation !== 'function') {
    console.warn('[X-10] Fixed foveation not available');
    return false;
  }
  const apply = (): void => {
    if (applyFixedFoveation(xr, level)) {
      console.log('[X-10] Fixed foveation enabled');
    }
  };
  if (xr.isPresenting) apply();
  if (typeof xr.addEventListener === 'function') {
    xr.addEventListener('sessionstart', apply);
  }
  return true;
}
