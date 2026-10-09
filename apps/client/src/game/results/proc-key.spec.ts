import { describe, expect, it } from 'vitest';
import {
  PROC_LEVEL_KEY_RE,
  isProcLevelKey,
  parseProcLevelKey,
  procLevelKey,
} from './proc-key.js';

describe('procLevelKey', () => {
  it('builds proc:<seed>:<tier>', () => {
    expect(procLevelKey('abc', 'easy')).toBe('proc:abc:easy');
    expect(PROC_LEVEL_KEY_RE.test(procLevelKey('abc', 'easy'))).toBe(true);
    expect(isProcLevelKey('proc:abc:normal')).toBe(true);
    expect(parseProcLevelKey('proc:abc:normal')).toEqual({
      seed: 'abc',
      tier: 'normal',
    });
  });

  it('rejects malformed keys', () => {
    expect(isProcLevelKey('procedural:abc')).toBe(false);
    expect(isProcLevelKey('proc:abc:hard')).toBe(false);
    expect(parseProcLevelKey('proc::normal')).toBeNull();
  });
});
