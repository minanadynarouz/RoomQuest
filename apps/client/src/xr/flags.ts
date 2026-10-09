/**
 * XR client flags. Delegates to the shared F-05 parser so X-03 surface
 * outlines and the debug overlay share one `?debug=1` rule.
 */

import {
  FIXTURE_SYNTHETIC_LIVING_ROOM,
  isSyntheticLivingRoomFixture,
  parseUrlFlags,
  type UrlFlags,
} from '../debug/url-flags.js';

export { FIXTURE_SYNTHETIC_LIVING_ROOM, isSyntheticLivingRoomFixture };

export type ClientFlags = Pick<UrlFlags, 'debug' | 'fixture'>;

export function readClientFlags(
  search = typeof window === 'undefined' ? '' : window.location.search
): ClientFlags {
  const flags = parseUrlFlags(search);
  return {
    debug: flags.debug,
    fixture: flags.fixture,
  };
}
