/**
 * Dynamic IWER (Immersive Web Emulation Runtime) loader for production builds
 *
 * In development, @iwsdk/vite-plugin-iwer injects IWER automatically.
 * In production, we need to load it dynamically when ?emulator=1 is present
 * to keep the landing bundle under 50KB.
 *
 * `?room=` is parsed once by `readClientFlags` in `xr/flags.ts` and passed in here.
 * This module owns the actual room JSON load; do not duplicate it.
 */

import type { EmulatorRoom } from '../xr/flags';

export interface EmulatorConfig {
  device?: 'metaQuest2' | 'metaQuest3' | 'metaQuestPro' | 'oculusQuest1';
  room?: EmulatorRoom;
}

/**
 * Load room scene data dynamically
 */
async function loadRoomScene(room: string) {
  switch (room) {
    case 'living_room':
      return (await import('@iwer/sem/lib/captures/living_room.json')).default;
    case 'meeting_room':
      return (await import('@iwer/sem/lib/captures/meeting_room.json')).default;
    case 'music_room':
      return (await import('@iwer/sem/lib/captures/music_room.json')).default;
    case 'office_large':
      return (await import('@iwer/sem/lib/captures/office_large.json')).default;
    case 'office_small':
      return (await import('@iwer/sem/lib/captures/office_small.json')).default;
    default:
      throw new Error(`Unknown room: ${room}`);
  }
}

interface IwerSem {
  loadEnvironment: (json: object) => void;
  loadDefaultEnvironment?: (envId: string) => void | Promise<void>;
  planesVisible: boolean;
  boundingBoxesVisible: boolean;
  meshesVisible: boolean;
}

interface IwerDevice {
  sem?: IwerSem;
}

function iwerDevice(): IwerDevice | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { IWER_DEVICE?: IwerDevice }).IWER_DEVICE;
}

function hideSemOverlay(sem: {
  meshesVisible: boolean;
  planesVisible: boolean;
  boundingBoxesVisible: boolean;
}): void {
  sem.meshesVisible = false;
  sem.planesVisible = false;
  sem.boundingBoxesVisible = false;
}

/**
 * Switch the injected IWER SEM to `room` (`?room=`). No-ops if SEM is missing.
 */
export async function applyEmulatorRoom(room: EmulatorRoom): Promise<boolean> {
  const device = iwerDevice();
  const sem = device?.sem;
  if (!sem) return false;
  try {
    if (typeof sem.loadDefaultEnvironment === 'function') {
      await sem.loadDefaultEnvironment(room);
    } else {
      const roomData = await loadRoomScene(room);
      sem.loadEnvironment(roomData);
    }
    hideSemOverlay(sem);
    console.log(`[Emulator] Applied room: ${room}`);
    return true;
  } catch (error) {
    console.warn(`[Emulator] Failed to apply room ${room}:`, error);
    return false;
  }
}

/**
 * Load and initialize the IWER runtime with scene understanding
 */
export async function loadEmulatorRuntime(
  config: EmulatorConfig = {}
): Promise<void> {
  try {
    // Check if IWER is already loaded and functional
    if (navigator.xr) {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      if (supported) {
        console.log(
          '[Emulator] WebXR API already available and functional, skipping IWER load'
        );
        if (config.room) {
          await applyEmulatorRoom(config.room);
        }
        return;
      }
      console.log(
        '[Emulator] WebXR API exists but immersive-ar not supported, loading IWER...'
      );
    }

    console.log('[Emulator] Loading IWER runtime...');

    // Dynamically import IWER and SEM (Synthetic Environment Module)
    const [
      { XRDevice, metaQuest3, metaQuest2, metaQuestPro, oculusQuest1 },
      { SyntheticEnvironmentModule },
    ] = await Promise.all([import('iwer'), import('@iwer/sem')]);

    // Select device config based on config
    const deviceConfigMap = {
      metaQuestPro,
      metaQuest3,
      metaQuest2,
      oculusQuest1,
    };

    const deviceConfig = deviceConfigMap[config.device || 'metaQuest3'];
    const xrDevice = new XRDevice(deviceConfig);

    // Create scene understanding module if room is specified
    if (config.room) {
      // SEM constructor takes XRDevice as parameter
      const sem = new SyntheticEnvironmentModule(xrDevice);

      // Load the room scene data
      const roomData = await loadRoomScene(config.room);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      sem.loadEnvironment(roomData as any);
      hideSemOverlay(sem);

      console.log(`[Emulator] Loaded room: ${config.room}`);
    }

    // Install the IWER runtime to enable WebXR emulation
    // Force install even if a stub navigator.xr exists (e.g., in headless Chromium)
    xrDevice.installRuntime({ forceInstall: true });

    console.log(
      `[Emulator] IWER runtime installed (device: ${config.device || 'metaQuest3'})`
    );

    // Give the polyfill a moment to settle
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error('[Emulator] Failed to load IWER runtime:', error);
    throw error;
  }
}

/**
 * Wait for navigator.xr to become available
 * Used when we expect IWER to load (either via plugin in dev or our loader in prod)
 */
export async function waitForWebXRPolyfill(timeoutMs = 3000): Promise<boolean> {
  if (navigator.xr) {
    return true;
  }

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (navigator.xr) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve(true);
      }
    }, 50);

    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      resolve(false);
    }, timeoutMs);
  });
}
