/**
 * App entry: landing page (F-01).
 * XR is loaded on demand via dynamic import of ./xr/index.js (X-01).
 */

import { initLanding } from './landing/index.js';

void initLanding().catch((error: unknown) => {
  console.error('[App] Failed to initialize landing page:', error);
});
