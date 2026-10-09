import { describe, it, expect } from 'vitest';
import { parseUrlFlags } from '../debug/url-flags.js';
import { isSyntheticLivingRoomFixture, readClientFlags } from './flags.js';

describe('client URL flags', () => {
  it('shares the F-05 parser for debug and fixture', () => {
    const search = '?fixture=synthetic_living_room&debug=1';
    const flags = readClientFlags(search);
    const shared = parseUrlFlags(search);
    expect(flags.debug).toBe(shared.debug);
    expect(flags.fixture).toBe(shared.fixture);
    expect(flags.debug).toBe(true);
    expect(isSyntheticLivingRoomFixture(flags)).toBe(true);
  });

  it('treats missing flags as off', () => {
    const flags = readClientFlags('');
    expect(flags.debug).toBe(false);
    expect(flags.fixture).toBeNull();
    expect(parseUrlFlags('').debug).toBe(false);
  });
});
