import { describe, expect, it } from 'vitest';
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
