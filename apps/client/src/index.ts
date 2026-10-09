/**
 * App entry: landing page (F-01).
 * XR is loaded on demand via dynamic import of ./xr/index.js (X-01).
 */

import { initLanding } from './landing/index.js';

// X-03: `?fixture=` boots via dynamic import so it never joins the landing chunk.
if (
  new URLSearchParams(window.location.search).get('fixture') ===
  'synthetic_living_room'
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
