/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * X-01 IWSDK AR Spike
 * 
 * This entry point exposes launchXR() for the frontend's "Enter your room" button.
 * The actual XR initialization is in src/xr/boot.ts
 */

// Re-export the XR launch function for the frontend
export { launchXR } from './xr/index.js';

// For development/testing in the emulator, auto-launch after a short delay
if (import.meta.env.DEV) {
  // Auto-launch in dev mode after 1 second
  setTimeout(async () => {
    console.log('[X-01 Spike] Auto-launching XR session in dev mode...');
    const { launchXR } = await import('./xr/index.js');
    await launchXR();
  }, 1000);
}
