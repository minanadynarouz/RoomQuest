/**
 * App entry: landing page (F-01).
 * XR is loaded on demand via dynamic import of ./xr/index.js (X-01).
 */

import { initLanding } from './landing/index.js';
import { readClientFlags } from './xr/flags.js';

const bootFlags = readClientFlags(window.location.search);

// X-03: `?fixture=` boots via dynamic import so it never joins the landing chunk.
if (bootFlags.fixture === 'synthetic_living_room') {
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
