/**
 * Landing page main controller
 * Handles capability check, XR chunk prefetch, and launching the game
 */

import { unlockAudio } from '../audio/unlock.js';
import {
  emulatorRoomFromFlags,
  readClientFlags,
} from '../xr/flags';
import {
  checkImmersiveARSupport,
  type CapabilityResult,
} from './capability-check';
import { loadEmulatorRuntime, waitForWebXRPolyfill } from './emulator-loader';
import { getLandingUIElements, updateCapabilityUI } from './ui';
import './styles.css';

const flags = readClientFlags(window.location.search);
const IS_EMULATOR = flags.emulator;
const ROOM = emulatorRoomFromFlags(flags);

let xrChunkReady = false;
let capabilityResult: CapabilityResult = { state: 'checking' };

/**
 * Prefetch the XR chunk after first paint
 */
async function prefetchXRChunk(): Promise<void> {
  try {
    await import('../xr/index.js');
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
    
    const { launchXR: startXRSession } = await import('../xr/index.js');
    await startXRSession();
    
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
  
  // If emulator mode is requested, load IWER runtime dynamically
  if (IS_EMULATOR) {
    try {
      ui.statusMessage.textContent = 'Loading emulator...';
      await loadEmulatorRuntime({
        device: 'metaQuest3',
        room: ROOM,
      });
      
      // Wait for polyfill to be ready
      const polyfillReady = await waitForWebXRPolyfill(3000);
      if (!polyfillReady) {
        console.warn('[Landing] Emulator polyfill did not load in time');
      }
    } catch (error) {
      console.error('[Landing] Failed to load emulator:', error);
      ui.statusMessage.textContent = 'Emulator failed to load';
      ui.statusMessage.classList.add('text-red-300');
    }
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
    // Resume AudioContext inside the user gesture (F-08). Must stay sync
    // in this click handler; do not wait on the XR import first.
    unlockAudio();
    if (capabilityResult.state === 'supported' && xrChunkReady) {
      void launchXR();
    }
  });
  
  prewarmHealthCheck();
}
