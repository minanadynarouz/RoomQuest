/**
 * App entry: landing page (F-01).
 * XR is loaded on demand via dynamic import of ./xr/index.js (X-01).
 */

import { initLanding } from './landing/index.js';
import { isFixtureXrSession, readClientFlags } from './xr/flags.js';

const bootFlags = readClientFlags(window.location.search);

// X-03: desktop fixture auto-boots. `?xr=1` goes through landing so launchXR
// runs from a user click inside a real IWER AR session.
if (
  bootFlags.fixture === 'synthetic_living_room' &&
  !isFixtureXrSession(bootFlags)
) {
  void import('./xr/index.js')
    .then(({ launchXR }) => launchXR())
    .catch((error: unknown) => {
      console.error('[App] Failed to boot fixture level:', error);
    });
} else {
  void initLanding().catch((error: unknown) => {
    console.error('[App] Failed to initialize landing page:', error);
  });
}
