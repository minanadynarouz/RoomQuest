import { describe, it, expect } from 'vitest';
import { isSyntheticLivingRoomFixture, readClientFlags } from './flags.js';

describe('client URL flags', () => {
  it('reads debug and fixture from the query string', () => {
    const flags = readClientFlags('?fixture=synthetic_living_room&debug=1');
    expect(flags.debug).toBe(true);
    expect(isSyntheticLivingRoomFixture(flags)).toBe(true);
  });

  it('treats missing flags as off', () => {
    const flags = readClientFlags('');
    expect(flags.debug).toBe(false);
    expect(flags.fixture).toBeNull();
  });
});
