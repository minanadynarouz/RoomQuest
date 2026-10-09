/**
 * XR visibility → auto-pause (F-07).
 *
 * WebXR `XRSession.visibilityState` is `visible` | `visible-blurred` | `hidden`.
 * IWSDK `world.visibilityState` uses `Visible` / `VisibleBlurred` / `NonImmersive`.
 * Only hidden / blur auto-pauses. NonImmersive (2D) does not.
 */

const AUTO_PAUSE = new Set([
  'hidden',
  'visible-blurred',
  'visibleblurred',
  'visible_blurred',
]);

export function isXrHiddenOrBlurred(state: unknown): boolean {
  if (typeof state !== 'string' && typeof state !== 'number') return false;
  const normalized = String(state).trim().toLowerCase().replace(/_/g, '-');
  return AUTO_PAUSE.has(normalized);
}
