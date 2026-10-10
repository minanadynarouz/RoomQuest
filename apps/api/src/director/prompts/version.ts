import {
  DEFAULT_DIRECTOR_PLACEMENT,
  type DirectorPlacement,
} from '../placement';

/**
 * Bump this whenever the static system prefix or few-shots change.
 * Mixed into the levels cache key (architecture §6 / §7).
 */
export const PROMPT_VERSION = 'v1.2';

/** Slot encoding uses a distinct cache key so uv and slot rows never collide. */
export function promptVersionFor(
  placement: DirectorPlacement = DEFAULT_DIRECTOR_PLACEMENT
): string {
  return placement === 'slot' ? `${PROMPT_VERSION}-slot` : PROMPT_VERSION;
}
