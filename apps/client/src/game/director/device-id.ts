/**
 * Anonymous device UUID (v4) - F-03
 * Injected storage so game/ stays DOM-free.
 */

import { DEVICE_ID_STORAGE_KEY, type KvStore } from './types.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function defaultRandomUUID(): string {
  return crypto.randomUUID();
}

/**
 * Return a stable device id, creating and persisting a UUID v4 on first use.
 * Corrupt stored values are replaced.
 */
export function getOrCreateDeviceId(
  storage: KvStore,
  randomUUID: () => string = defaultRandomUUID
): string {
  const existing = storage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing && UUID_RE.test(existing)) {
    return existing;
  }

  const created = randomUUID();
  storage.setItem(DEVICE_ID_STORAGE_KEY, created);
  return created;
}
