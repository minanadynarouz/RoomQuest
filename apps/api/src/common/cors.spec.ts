import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseCorsOrigins } from './cors';

const allowlist = parseCorsOrigins(
  'http://localhost:5173,https://localhost:5173,https://roomquest.vercel.app'
);

describe('CORS allowlist', () => {
  it('parses comma-separated origins', () => {
    expect(allowlist).toEqual([
      'http://localhost:5173',
      'https://localhost:5173',
      'https://roomquest.vercel.app',
    ]);
  });

  it('allows explicit env origins', () => {
    expect(isAllowedOrigin('http://localhost:5173', allowlist)).toBe(true);
    expect(isAllowedOrigin('https://roomquest.vercel.app', allowlist)).toBe(
      true
    );
  });

  it('allows https://localhost with any port', () => {
    expect(isAllowedOrigin('https://localhost:4443', allowlist)).toBe(true);
    expect(isAllowedOrigin('https://localhost', allowlist)).toBe(true);
  });

  it('allows this project Vercel preview hostnames', () => {
    expect(
      isAllowedOrigin(
        'https://roomquest-abc123-minanadynarouz.vercel.app',
        allowlist
      )
    ).toBe(true);
    expect(
      isAllowedOrigin(
        'https://feat-b02-api-roomquest-minanadynarouz.vercel.app',
        allowlist
      )
    ).toBe(true);
    expect(
      isAllowedOrigin(
        'https://roomquest-git-feat-b02-minanadynarouz.vercel.app',
        allowlist
      )
    ).toBe(true);
  });

  it('blocks unrelated origins', () => {
    expect(isAllowedOrigin('https://evil.example', allowlist)).toBe(false);
    expect(isAllowedOrigin('http://localhost:4443', allowlist)).toBe(false);
    expect(isAllowedOrigin('https://roomquestion.vercel.app', allowlist)).toBe(
      false
    );
  });
});
