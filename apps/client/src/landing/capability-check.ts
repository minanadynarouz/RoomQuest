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
