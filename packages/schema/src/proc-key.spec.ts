import { describe, expect, it } from 'vitest';
import {
  PROC_LEVEL_KEY_PREFIX,
  PROC_LEVEL_KEY_RE,
  ProcLevelKey,
  ResultLevelKey,
  isProcLevelKey,
  isProcLevelKeyAttempt,
  parseProcLevelKey,
  procLevelKey,
} from './proc-key.js';

describe('procLevelKey', () => {
  it('builds proc:<seed>:<tier> for a string seed', () => {
    expect(procLevelKey('f1a2b3c4d5e6-2026-10-14', 'easy')).toBe(
      'proc:f1a2b3c4d5e6-2026-10-14:easy'
    );
  });

  it('stringifies a numeric seed the same way on client and server', () => {
    expect(procLevelKey(42, 'normal')).toBe('proc:42:normal');
    expect(procLevelKey(0, 'easy')).toBe('proc:0:easy');
  });

  it('round-trips through parseProcLevelKey', () => {
    const key = procLevelKey('room-seed', 'normal');
    expect(parseProcLevelKey(key)).toEqual({
      seed: 'room-seed',
      tier: 'normal',
    });
  });

  it('rejects an empty seed, a colon in the seed, or a bad tier', () => {
    expect(() => procLevelKey('', 'easy')).toThrow();
    expect(() => procLevelKey('has:colon', 'easy')).toThrow();
    expect(() => procLevelKey('ok', 'hard' as 'easy')).toThrow();
    expect(() => procLevelKey(Number.NaN, 'easy')).toThrow();
  });
});

describe('ProcLevelKey / ResultLevelKey', () => {
  it('accepts keys built by procLevelKey', () => {
    const key = procLevelKey('abc', 'easy');
    expect(ProcLevelKey.parse(key)).toBe(key);
    expect(ResultLevelKey.parse(key)).toBe(key);
    expect(isProcLevelKey(key)).toBe(true);
    expect(PROC_LEVEL_KEY_RE.test(key)).toBe(true);
  });

  it('rejects malformed proc keys', () => {
    for (const bad of [
      'proc:',
      'proc:onlyseed',
      'proc:seed:hard',
      'proc::easy',
      'proc:seed:easy:extra',
      'proc:has:colon:easy',
    ]) {
      expect(() => ProcLevelKey.parse(bad)).toThrow();
      expect(() => ResultLevelKey.parse(bad)).toThrow();
      expect(isProcLevelKey(bad)).toBe(false);
      expect(isProcLevelKeyAttempt(bad)).toBe(true);
    }
  });

  it('lets non-proc keys through ResultLevelKey (404 is a later concern)', () => {
    expect(ResultLevelKey.parse('0123456789abcdef')).toBe('0123456789abcdef');
    expect(isProcLevelKeyAttempt('0123456789abcdef')).toBe(false);
    expect(isProcLevelKey('0123456789abcdef')).toBe(false);
  });

  it('does not treat a PROC: prefix (wrong case) as a proc key', () => {
    expect(isProcLevelKeyAttempt('PROC:seed:easy')).toBe(false);
    expect(ResultLevelKey.parse('PROC:seed:easy')).toBe('PROC:seed:easy');
  });

  it('exports the prefix used to build keys', () => {
    expect(PROC_LEVEL_KEY_PREFIX).toBe('proc:');
  });
});
