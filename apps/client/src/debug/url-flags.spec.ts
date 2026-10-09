import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  emulatorRoomFromFlags,
  isSyntheticLivingRoomFixture,
  parseUrlFlags,
  shouldExposeDebugHooks,
} from './url-flags.js';

describe('parseUrlFlags', () => {
  it('treats missing flags as off', () => {
    expect(parseUrlFlags('')).toEqual({
      debug: false,
      emulator: false,
      room: null,
      fixture: null,
    });
  });

  it('enables debug only for the exact value 1', () => {
    expect(parseUrlFlags('?debug=1').debug).toBe(true);
    expect(parseUrlFlags('debug=true').debug).toBe(false);
    expect(parseUrlFlags('debug=0').debug).toBe(false);
  });

  it('parses emulator and a known room', () => {
    const flags = parseUrlFlags('?emulator=1&room=office_small');
    expect(flags.emulator).toBe(true);
    expect(flags.room).toBe('office_small');
    expect(emulatorRoomFromFlags(flags)).toBe('office_small');
  });

  it('ignores unknown rooms and defaults the emulator room', () => {
    const flags = parseUrlFlags('room=kitchen');
    expect(flags.room).toBeNull();
    expect(emulatorRoomFromFlags(flags)).toBe('living_room');
  });

  it('reads the synthetic living-room fixture', () => {
    const flags = parseUrlFlags('?fixture=synthetic_living_room&debug=1');
    expect(isSyntheticLivingRoomFixture(flags)).toBe(true);
    expect(flags.debug).toBe(true);
  });

  it('does not import schema, director, or IWSDK', async () => {
    const source = await readFile(
      join(process.cwd(), 'src', 'debug', 'url-flags.ts'),
      'utf8'
    );
    const imports = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '));
    expect(imports.join('\n')).not.toMatch(/@roomquest\/schema/);
    expect(imports.join('\n')).not.toMatch(/@iwsdk\//);
    expect(imports.join('\n')).not.toMatch(/game\/director/);
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
