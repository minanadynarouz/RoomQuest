import { describe, it, expect } from 'vitest';
import { getOrCreateDeviceId } from './device-id.js';
import { DEVICE_ID_STORAGE_KEY, type KvStore } from './types.js';

function memoryStore(initial: Record<string, string> = {}): KvStore {
  const data = { ...initial };
  return {
    getItem(key) {
      return data[key] ?? null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

describe('getOrCreateDeviceId', () => {
  it('creates and persists a UUID on first use', () => {
    const storage = memoryStore();
    const id = getOrCreateDeviceId(
      storage,
      () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    );
    expect(id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(storage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });

  it('reuses a stored UUID', () => {
    const stored = '11111111-2222-4333-8444-555555555555';
    const storage = memoryStore({ [DEVICE_ID_STORAGE_KEY]: stored });
    const id = getOrCreateDeviceId(storage, () => 'should-not-run');
    expect(id).toBe(stored);
  });

  it('replaces a corrupt stored value', () => {
    const storage = memoryStore({ [DEVICE_ID_STORAGE_KEY]: 'not-a-uuid' });
    const id = getOrCreateDeviceId(
      storage,
      () => '99999999-8888-4777-8666-555555555555'
    );
    expect(id).toBe('99999999-8888-4777-8666-555555555555');
  });
});
