import { describe, it, expect } from 'vitest';
import { parseDirectorFlags } from './flags.js';

describe('parseDirectorFlags', () => {
  it('defaults to live with no flags', () => {
    expect(parseDirectorFlags('')).toEqual({
      director: 'live',
      seed: undefined,
      date: undefined,
    });
  });

  it('accepts director=live|mock|off', () => {
    expect(parseDirectorFlags('director=mock').director).toBe('mock');
    expect(parseDirectorFlags('?director=off').director).toBe('off');
    expect(parseDirectorFlags('director=live').director).toBe('live');
  });

  it('ignores unknown director values', () => {
    expect(parseDirectorFlags('director=llm').director).toBe('live');
  });

  it('parses seed and date', () => {
    expect(
      parseDirectorFlags('director=off&seed=abc-2026-10-09&date=2026-10-09')
    ).toEqual({
      director: 'off',
      seed: 'abc-2026-10-09',
      date: '2026-10-09',
    });
  });

  it('ignores invalid date values', () => {
    expect(parseDirectorFlags('date=10/09/2026').date).toBeUndefined();
    expect(parseDirectorFlags('date=2026-13-40').date).toBeUndefined();
  });
});
