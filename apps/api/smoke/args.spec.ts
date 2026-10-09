import { describe, expect, it } from 'vitest';
import { isLocalBaseUrl, parseSmokeArgs } from './args';
import { DEFAULT_BASE_URL } from './constants';

describe('parseSmokeArgs', () => {
  it('defaults to localhost and does not stop postgres', () => {
    expect(parseSmokeArgs([], {})).toEqual({
      baseUrl: DEFAULT_BASE_URL,
      stopPostgres: false,
    });
  });

  it('reads BASE_URL from env and strips a trailing slash', () => {
    expect(
      parseSmokeArgs([], { BASE_URL: 'https://roomquest-api.onrender.com/' })
    ).toEqual({
      baseUrl: 'https://roomquest-api.onrender.com',
      stopPostgres: false,
    });
  });

  it('lets --base-url override BASE_URL', () => {
    expect(
      parseSmokeArgs(['--base-url', 'http://127.0.0.1:4000'], {
        BASE_URL: 'http://localhost:3000',
      })
    ).toEqual({
      baseUrl: 'http://127.0.0.1:4000',
      stopPostgres: false,
    });
  });

  it('enables stop-postgres from env or flag, and --no-stop-postgres wins', () => {
    expect(parseSmokeArgs([], { SMOKE_STOP_POSTGRES: '1' }).stopPostgres).toBe(
      true
    );
    expect(parseSmokeArgs(['--stop-postgres'], {}).stopPostgres).toBe(true);
    expect(
      parseSmokeArgs(['--no-stop-postgres'], { SMOKE_STOP_POSTGRES: '1' })
        .stopPostgres
    ).toBe(false);
  });

  it('rejects stop-postgres against a remote BASE_URL', () => {
    expect(() =>
      parseSmokeArgs(['--stop-postgres'], {
        BASE_URL: 'https://roomquest-api.onrender.com',
      })
    ).toThrow(/localhost/i);
  });

  it('identifies loopback hosts', () => {
    expect(isLocalBaseUrl('http://localhost:3000')).toBe(true);
    expect(isLocalBaseUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalBaseUrl('https://roomquest-api.onrender.com')).toBe(false);
  });
});
