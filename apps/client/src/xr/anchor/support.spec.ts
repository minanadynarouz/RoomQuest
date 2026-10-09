import { describe, expect, it } from 'vitest';
import {
  hasCallable,
  inspectPersistentAnchorSupport,
  sessionSupportsPersistentAnchors,
} from './support.js';

describe('persistent-anchor feature checks', () => {
  it('treats null session as unsupported', () => {
    expect(sessionSupportsPersistentAnchors(null)).toBe(false);
    expect(sessionSupportsPersistentAnchors(undefined)).toBe(false);
    expect(inspectPersistentAnchorSupport(null)).toEqual({
      session: false,
      restorePersistentAnchor: false,
      createAnchor: false,
      requestPersistentHandle: false,
    });
  });

  it('detects restorePersistentAnchor on a session duck', () => {
    const session = {
      restorePersistentAnchor: () => Promise.resolve({}),
    };
    expect(sessionSupportsPersistentAnchors(session)).toBe(true);
    expect(inspectPersistentAnchorSupport(session).restorePersistentAnchor).toBe(
      true
    );
  });

  it('detects createAnchor and requestPersistentHandle independently', () => {
    const frame = { createAnchor: () => Promise.resolve(null) };
    const native = {
      requestPersistentHandle: () => Promise.resolve('uuid'),
    };
    const support = inspectPersistentAnchorSupport({}, frame, native);
    expect(support.createAnchor).toBe(true);
    expect(support.requestPersistentHandle).toBe(true);
    expect(support.restorePersistentAnchor).toBe(false);
  });

  it('never throws when property access throws', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('blocked');
        },
      }
    );
    expect(hasCallable(hostile, 'restorePersistentAnchor')).toBe(false);
    expect(sessionSupportsPersistentAnchors(hostile)).toBe(false);
  });
});
