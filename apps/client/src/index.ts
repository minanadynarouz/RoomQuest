/**
 * App entry: landing page (F-01).
 * XR is loaded on demand via dynamic import of ./xr/index.js (X-01).
 * X-03: `?fixture=synthetic_living_room` skips landing and builds the
 * fixture level in a plain browser (no XR session, no API).
 */

import { initLanding } from './landing/index.js';
import { isSyntheticLivingRoomFixture, readClientFlags } from './xr/flags.js';

async function bootFixture(): Promise<void> {
  const landing = document.getElementById('landing-page');
  if (landing) landing.style.display = 'none';
  const { launchXR } = await import('./xr/index.js');
  await launchXR();
}

const flags = readClientFlags();

if (isSyntheticLivingRoomFixture(flags)) {
  const start = (): void => {
    void bootFixture().catch((error: unknown) => {
      console.error('[App] Failed to boot fixture level:', error);
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
} else {
  void initLanding().catch((error: unknown) => {
    console.error('[App] Failed to initialize landing page:', error);
  });
}
