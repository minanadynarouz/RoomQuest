import {
  VILLAGE_ANCHOR_STORAGE_KEY,
  type VillageAnchorStorage,
} from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROBE_KEY = `${VILLAGE_ANCHOR_STORAGE_KEY}.probe`;

/** Persistent-anchor handles are UUID strings (WebXR Anchors module). */
export function isPersistentAnchorHandle(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * True when `storage` can round-trip a probe key. Never throws — private
 * mode, missing `localStorage`, and quota errors all return `false`.
 */
export function isVillageAnchorStorageAvailable(
  storage: VillageAnchorStorage | null | undefined
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROBE_KEY, '1');
    const ok = storage.getItem(PROBE_KEY) === '1';
    storage.removeItem?.(PROBE_KEY);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Read a stored persistent-anchor UUID. Corrupt values and storage errors
 * yield `null` — never throw.
 */
export function readVillageAnchorHandle(
  storage: VillageAnchorStorage | null | undefined
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(VILLAGE_ANCHOR_STORAGE_KEY);
    if (!value || !isPersistentAnchorHandle(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Persist a handle. Returns `true` only when the write round-trips.
 * Never throws.
 */
export function writeVillageAnchorHandle(
  storage: VillageAnchorStorage | null | undefined,
  handle: string
): boolean {
  if (!storage || !isPersistentAnchorHandle(handle)) return false;
  try {
    storage.setItem(VILLAGE_ANCHOR_STORAGE_KEY, handle);
    return storage.getItem(VILLAGE_ANCHOR_STORAGE_KEY) === handle;
  } catch {
    return false;
  }
}

/** Drop a stored handle. Never throws. */
export function clearVillageAnchorHandle(
  storage: VillageAnchorStorage | null | undefined
): boolean {
  if (!storage) return false;
  try {
    if (typeof storage.removeItem === 'function') {
      storage.removeItem(VILLAGE_ANCHOR_STORAGE_KEY);
    } else {
      storage.setItem(VILLAGE_ANCHOR_STORAGE_KEY, '');
    }
    const remaining = storage.getItem(VILLAGE_ANCHOR_STORAGE_KEY);
    return remaining === null || remaining === '';
  } catch {
    return false;
  }
}
