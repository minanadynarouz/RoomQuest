/**
 * Landing page main controller
 * Handles capability check, XR chunk prefetch, and launching the game
 */

import {
  checkImmersiveARSupport,
  waitForEmulatorPolyfill,
  type CapabilityResult,
} from './capability-check';
import { getLandingUIElements, updateCapabilityUI } from './ui';
import './styles.css';

const IS_EMULATOR = new URLSearchParams(window.location.search).get('emulator') === '1';

let xrChunkReady = false;
let capabilityResult: CapabilityResult = { state: 'checking' };

/**
 * Prefetch the XR chunk after first paint
 */
async function prefetchXRChunk(): Promise<void> {
  try {
    await import('../xr/boot');
    xrChunkReady = true;
    console.log('[Landing] XR chunk prefetched successfully');
  } catch (error) {
    console.error('[Landing] Failed to prefetch XR chunk:', error);
  }
}

/**
 * Pre-warm the health check endpoint (fire and forget)
 */
function prewarmHealthCheck(): void {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (apiBaseUrl) {
    fetch(`${apiBaseUrl}/api/health`, { method: 'GET' })
      .then(() => console.log('[Landing] Health check pre-warmed'))
      .catch(() => {
        // Intentionally empty - fire and forget
      });
  }
}

/**
 * Launch the XR experience
 */
async function launchXR(): Promise<void> {
  try {
    const ui = getLandingUIElements();
    ui.enterButton.textContent = 'Launching...';
    ui.enterButton.disabled = true;
    
    const { launchXR: bootXR } = await import('../xr/boot');
    await bootXR();
    
    ui.landingPage.style.display = 'none';
  } catch (error) {
    console.error('[Landing] Failed to launch XR:', error);
    const ui = getLandingUIElements();
    ui.statusMessage.textContent = 'Failed to start experience';
    ui.statusMessage.classList.add('text-red-300');
    ui.enterButton.textContent = 'Enter your room';
    ui.enterButton.disabled = false;
  }
}

/**
 * Main landing page initialization
 */
export async function initLanding(): Promise<void> {
  const ui = getLandingUIElements();
  
  updateCapabilityUI(ui, capabilityResult, xrChunkReady);
  
  if (IS_EMULATOR) {
    await waitForEmulatorPolyfill();
  }
  
  capabilityResult = await checkImmersiveARSupport();
  updateCapabilityUI(ui, capabilityResult, xrChunkReady);
  
  if (capabilityResult.state === 'supported') {
    requestIdleCallback(() => {
      prefetchXRChunk().then(() => {
        updateCapabilityUI(ui, capabilityResult, xrChunkReady);
      });
    }, { timeout: 2000 });
  }
  
  ui.enterButton.addEventListener('click', () => {
    if (capabilityResult.state === 'supported' && xrChunkReady) {
      void launchXR();
    }
  });
  
  prewarmHealthCheck();
}
