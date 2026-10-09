import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  emulatorRoomFromFlags,
  isFixtureXrSession,
  isSyntheticLivingRoomFixture,
  readClientFlags,
  shouldExposeDebugHooks,
} from './flags.js';

describe('client URL flags', () => {
  it('reads debug and fixture from the query string', () => {
    const flags = readClientFlags('?fixture=synthetic_living_room&debug=1');
    expect(flags.debug).toBe(true);
    expect(isSyntheticLivingRoomFixture(flags)).toBe(true);
  });

  it('treats missing flags as off', () => {
    const flags = readClientFlags('');
    expect(flags.debug).toBe(false);
    expect(flags.emulator).toBe(false);
    expect(flags.room).toBeNull();
    expect(flags.fixture).toBeNull();
    expect(flags.xr).toBe(false);
    expect(isFixtureXrSession(flags)).toBe(false);
  });

  it('reads xr=1 for the fixture XR session path', () => {
    const flags = readClientFlags('?fixture=synthetic_living_room&xr=1');
    expect(isSyntheticLivingRoomFixture(flags)).toBe(true);
    expect(flags.xr).toBe(true);
    expect(isFixtureXrSession(flags)).toBe(true);
    expect(
      isFixtureXrSession(readClientFlags('?fixture=synthetic_living_room'))
    ).toBe(false);
    expect(isFixtureXrSession(readClientFlags('?xr=1'))).toBe(false);
  });

  it('enables debug (the perf flag) only for the exact value 1', () => {
    expect(readClientFlags('?debug=1').debug).toBe(true);
    expect(readClientFlags('debug=true').debug).toBe(false);
    expect(readClientFlags('debug=0').debug).toBe(false);
  });

  it('parses emulator and a known room', () => {
    const flags = readClientFlags('?emulator=1&room=office_small');
    expect(flags.emulator).toBe(true);
    expect(flags.room).toBe('office_small');
    expect(emulatorRoomFromFlags(flags)).toBe('office_small');
  });

  it('ignores unknown rooms and defaults the emulator room', () => {
    const flags = readClientFlags('room=kitchen');
    expect(flags.room).toBeNull();
    expect(emulatorRoomFromFlags(flags)).toBe('living_room');
  });

  it('does not import schema, director, or IWSDK', async () => {
    const source = await readFile(
      join(process.cwd(), 'src', 'xr', 'flags.ts'),
      'utf8'
    );
    const imports = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '));
    expect(imports).toEqual([]);
  });
});

describe('shouldExposeDebugHooks', () => {
  it('is on in dev even without ?debug=1', () => {
    expect(shouldExposeDebugHooks({ debug: false }, true)).toBe(true);
  });

  it('is on when ?debug=1 in production', () => {
    expect(shouldExposeDebugHooks({ debug: true }, false)).toBe(true);
  });

  it('is off in production without the flag', () => {
    expect(shouldExposeDebugHooks({ debug: false }, false)).toBe(false);
  });
});
