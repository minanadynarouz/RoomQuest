import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTOR_MODEL,
  DEFAULT_FALLBACK_MODEL,
} from '../director/director.constants';
import { validateEnv } from './env';

describe('validateEnv', () => {
  it('accepts a missing DATABASE_URL and DIRECT_URL', () => {
    const env = validateEnv({ NODE_ENV: 'test' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it('treats blank DATABASE_URL as unset', () => {
    const env = validateEnv({
      NODE_ENV: 'test',
      DATABASE_URL: '   ',
      DIRECT_URL: '',
    });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it('defaults DIRECTOR_MODEL and FALLBACK_MODEL when unset or blank', () => {
    const unset = validateEnv({ NODE_ENV: 'test' });
    expect(unset.DIRECTOR_MODEL).toBe(DEFAULT_DIRECTOR_MODEL);
    expect(unset.FALLBACK_MODEL).toBe(DEFAULT_FALLBACK_MODEL);

    const blank = validateEnv({
      NODE_ENV: 'test',
      DIRECTOR_MODEL: '  ',
      FALLBACK_MODEL: '',
    });
    expect(blank.DIRECTOR_MODEL).toBe(DEFAULT_DIRECTOR_MODEL);
    expect(blank.FALLBACK_MODEL).toBe(DEFAULT_FALLBACK_MODEL);
  });

  it('keeps explicit DIRECTOR_MODEL and FALLBACK_MODEL', () => {
    const env = validateEnv({
      NODE_ENV: 'test',
      DIRECTOR_MODEL: 'gemini-3.5-flash-lite',
      FALLBACK_MODEL: 'claude-sonnet-5',
    });
    expect(env.DIRECTOR_MODEL).toBe('gemini-3.5-flash-lite');
    expect(env.FALLBACK_MODEL).toBe('claude-sonnet-5');
  });

  it('keeps a non-empty DATABASE_URL', () => {
    const url = 'postgresql://postgres:postgres@localhost:5432/roomquest';
    const env = validateEnv({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      DIRECT_URL: url,
    });
    expect(env.DATABASE_URL).toBe(url);
    expect(env.DIRECT_URL).toBe(url);
  });
});
