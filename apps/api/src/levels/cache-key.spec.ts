import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeCacheKey } from './cache-key';

describe('makeCacheKey', () => {
  it('returns the first 16 hex chars of sha256(roomHash|date|tier|promptVersion)', () => {
    const expected = createHash('sha256')
      .update('f1a2b3c4d5e6|2026-10-14|easy|v1')
      .digest('hex')
      .slice(0, 16);

    expect(makeCacheKey('f1a2b3c4d5e6', '2026-10-14', 'easy', 'v1')).toBe(
      expected
    );
    expect(expected).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic and changes when inputs change', () => {
    const a = makeCacheKey('f1a2b3c4d5e6', '2026-10-14', 'easy', 'v1');
    const b = makeCacheKey('f1a2b3c4d5e6', '2026-10-14', 'easy', 'v1');
    const c = makeCacheKey('f1a2b3c4d5e6', '2026-10-15', 'easy', 'v1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
