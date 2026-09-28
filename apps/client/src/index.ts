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

console.log('[X-01] Client index.ts loaded, DEV=', import.meta.env.DEV);

// In dev mode, wire up the button for manual launch
if (import.meta.env.DEV) {
  function setupButton() {
    const btn = document.getElementById('enter-ar') as HTMLButtonElement;
    if (!btn) {
      console.warn('[X-01] Enter AR button not found, retrying...');
      setTimeout(setupButton, 100);
      return;
    }
    
    console.log('[X-01] Enter AR button found, showing it');
    
    // Show button immediately in dev mode
    btn.style.display = 'block';
    
    btn.onclick = async () => {
      console.log('[X-01] Enter AR button clicked');
      
      // Check navigator.xr at click time
      if (!navigator.xr) {
        console.error('[X-01] navigator.xr not available');
        alert('WebXR not available');
        return;
      }
      
      console.log('[X-01] navigator.xr available, checking session support...');
      
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!supported) {
          console.error('[X-01] immersive-ar not supported');
          alert('immersive-ar not supported');
          return;
        }
        console.log('[X-01] immersive-ar supported, launching XR...');
      } catch (err) {
        console.error('[X-01] Error checking session support:', err);
        alert(`Session support check failed: ${err}`);
        return;
      }
      
      const { launchXR } = await import('./xr/index.js');
      await launchXR();
    };
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupButton);
  } else {
    setupButton();
  }
}
