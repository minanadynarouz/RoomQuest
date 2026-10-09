/**
 * Feature-detect WebXR persistent anchors. Never throws.
 */

export interface PersistentAnchorSupport {
  session: boolean;
  restorePersistentAnchor: boolean;
  createAnchor: boolean;
  requestPersistentHandle: boolean;
}

export function hasCallable(obj: unknown, name: string): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  try {
    return typeof (obj as Record<string, unknown>)[name] === 'function';
  } catch {
    return false;
  }
}

export function inspectPersistentAnchorSupport(
  session: unknown,
  frame: unknown = null,
  nativeAnchor: unknown = null
): PersistentAnchorSupport {
  try {
    return {
      session: session !== null && session !== undefined,
      restorePersistentAnchor: hasCallable(session, 'restorePersistentAnchor'),
      createAnchor: hasCallable(frame, 'createAnchor'),
      requestPersistentHandle: hasCallable(
        nativeAnchor,
        'requestPersistentHandle'
      ),
    };
  } catch {
    return {
      session: false,
      restorePersistentAnchor: false,
      createAnchor: false,
      requestPersistentHandle: false,
    };
  }
}

/** Runtime can restore a previously persisted UUID. */
export function sessionSupportsPersistentAnchors(session: unknown): boolean {
  return inspectPersistentAnchorSupport(session).restorePersistentAnchor;
}
