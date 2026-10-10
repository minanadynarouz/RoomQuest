import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTOR_PLACEMENT,
  resolveDirectorPlacement,
} from './placement';

describe('resolveDirectorPlacement', () => {
  it('defaults to uv', () => {
    expect(DEFAULT_DIRECTOR_PLACEMENT).toBe('uv');
    expect(resolveDirectorPlacement(undefined)).toBe('uv');
    expect(resolveDirectorPlacement('  ')).toBe('uv');
  });

  it('accepts uv and slot', () => {
    expect(resolveDirectorPlacement('UV')).toBe('uv');
    expect(resolveDirectorPlacement('slot')).toBe('slot');
  });

  it('rejects unknown values', () => {
    expect(() => resolveDirectorPlacement('xyz')).toThrow(/uv or slot/);
  });
});
