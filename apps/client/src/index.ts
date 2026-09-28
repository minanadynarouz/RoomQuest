/**
 * Main entry point
 * Initializes the landing page on load
 */

import { initLanding } from './landing';

initLanding().catch((error: unknown) => {
  console.error('[App] Failed to initialize landing page:', error);
});
