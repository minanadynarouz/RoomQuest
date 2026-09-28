/**
 * WebXR capability detection
 */

export type CapabilityState = 'checking' | 'supported' | 'unsupported' | 'error';

export interface CapabilityResult {
  state: CapabilityState;
  message?: string;
}

/**
 * Check if immersive-ar is supported.
 * With ?emulator=1, this should be called AFTER the emulator has loaded its polyfill.
 */
export async function checkImmersiveARSupport(): Promise<CapabilityResult> {
  try {
    if (!navigator.xr) {
      return {
        state: 'unsupported',
        message: 'WebXR is not available in this browser',
      };
    }

    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    
    if (supported) {
      return { state: 'supported' };
    } else {
      return {
        state: 'unsupported',
        message: 'Immersive AR is not supported on this device',
      };
    }
  } catch (error) {
    console.error('Error checking WebXR support:', error);
    return {
      state: 'error',
      message: 'Could not check WebXR support',
    };
  }
}

/**
 * Wait for the emulator to inject its polyfill.
 * The IWER plugin should inject the polyfill before DOMContentLoaded,
 * but we give it a moment to ensure it's ready.
 */
export async function waitForEmulatorPolyfill(): Promise<void> {
  return new Promise((resolve) => {
    if (navigator.xr) {
      resolve();
      return;
    }
    
    const checkInterval = setInterval(() => {
      if (navigator.xr) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve();
      }
    }, 50);
    
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 2000);
  });
}
