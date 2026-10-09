/**
 * App entry: landing page (F-01).
 * XR is loaded on demand via dynamic import of ./xr/index.js (X-01).
 */

import { initLanding } from './landing/index.js';
import {
  isFixtureXrSession,
<<<<<<< HEAD
  isSyntheticFixture,
=======
  isSyntheticLivingRoomFixture,
  isSyntheticSlimeFixture,
>>>>>>> 6609db7 (fix(X-08): auto-boot slime fixture and land far ray-tap)
  readClientFlags,
} from './xr/flags.js';

const bootFlags = readClientFlags(window.location.search);

// X-03: desktop fixture auto-boots. `?xr=1` goes through landing so launchXR
// runs from a user click inside a real IWER AR session.
<<<<<<< HEAD
if (isSyntheticFixture(bootFlags) && !isFixtureXrSession(bootFlags)) {
=======
// X-08: `?fixture=synthetic_slime` uses the same desktop auto-boot.
if (
  (isSyntheticLivingRoomFixture(bootFlags) ||
    isSyntheticSlimeFixture(bootFlags)) &&
  !isFixtureXrSession(bootFlags)
) {
>>>>>>> 6609db7 (fix(X-08): auto-boot slime fixture and land far ray-tap)
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
