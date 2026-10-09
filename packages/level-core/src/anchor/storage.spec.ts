import { describe, expect, it } from 'vitest';
import {
  VILLAGE_ANCHOR_STORAGE_KEY,
  type VillageAnchorStorage,
} from './types';
import {
  clearVillageAnchorHandle,
  isPersistentAnchorHandle,
  isVillageAnchorStorageAvailable,
  readVillageAnchorHandle,
  writeVillageAnchorHandle,
} from './storage';

const HANDLE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function memoryStore(
  initial: Record<string, string> = {}
): VillageAnchorStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function throwingStore(): VillageAnchorStorage {
  return {
    getItem() {
      throw new Error('private mode');
    },
    setItem() {
      throw new Error('private mode');
    },
    removeItem() {
      throw new Error('private mode');
    },
  };
}

describe('isPersistentAnchorHandle', () => {
  it('accepts a UUID', () => {
    expect(isPersistentAnchorHandle(HANDLE)).toBe(true);
  });

  it('rejects empty and non-UUID strings', () => {
    expect(isPersistentAnchorHandle('')).toBe(false);
    expect(isPersistentAnchorHandle('not-a-uuid')).toBe(false);
    expect(isPersistentAnchorHandle('roomquest:villageAnchor')).toBe(false);
  });
});

describe('village anchor storage', () => {
  it('writes and reads a handle through injected storage', () => {
    const storage = memoryStore();
    expect(writeVillageAnchorHandle(storage, HANDLE)).toBe(true);
    expect(storage.getItem(VILLAGE_ANCHOR_STORAGE_KEY)).toBe(HANDLE);
    expect(readVillageAnchorHandle(storage)).toBe(HANDLE);
  });

  it('returns null for a missing key', () => {
    expect(readVillageAnchorHandle(memoryStore())).toBeNull();
  });

  it('ignores a corrupt stored value', () => {
    const storage = memoryStore({
      [VILLAGE_ANCHOR_STORAGE_KEY]: 'not-a-uuid',
    });
    expect(readVillageAnchorHandle(storage)).toBeNull();
  });

  it('refuses to write a non-UUID handle', () => {
    const storage = memoryStore();
    expect(writeVillageAnchorHandle(storage, 'nope')).toBe(false);
    expect(storage.getItem(VILLAGE_ANCHOR_STORAGE_KEY)).toBeNull();
  });

  it('clears a stored handle', () => {
    const storage = memoryStore({ [VILLAGE_ANCHOR_STORAGE_KEY]: HANDLE });
    expect(clearVillageAnchorHandle(storage)).toBe(true);
    expect(readVillageAnchorHandle(storage)).toBeNull();
  });

  it('never throws when storage is missing', () => {
    expect(readVillageAnchorHandle(null)).toBeNull();
    expect(readVillageAnchorHandle(undefined)).toBeNull();
    expect(writeVillageAnchorHandle(null, HANDLE)).toBe(false);
    expect(clearVillageAnchorHandle(undefined)).toBe(false);
    expect(isVillageAnchorStorageAvailable(null)).toBe(false);
  });

  it('never throws when storage throws (private mode)', () => {
    const storage = throwingStore();
    expect(isVillageAnchorStorageAvailable(storage)).toBe(false);
    expect(readVillageAnchorHandle(storage)).toBeNull();
    expect(writeVillageAnchorHandle(storage, HANDLE)).toBe(false);
    expect(clearVillageAnchorHandle(storage)).toBe(false);
  });

  it('reports storage unavailable when a write does not round-trip', () => {
    const storage: VillageAnchorStorage = {
      getItem() {
        return null;
      },
      setItem() {
        /* swallow */
      },
    };
    expect(isVillageAnchorStorageAvailable(storage)).toBe(false);
    expect(writeVillageAnchorHandle(storage, HANDLE)).toBe(false);
  });
});
