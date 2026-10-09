/**
 * Dynamic IWER (Immersive Web Emulation Runtime) loader for production builds
 *
 * In development, @iwsdk/vite-plugin-iwer injects IWER automatically.
 * In production, we need to load it dynamically when ?emulator=1 is present
 * to keep the landing bundle under 50KB.
 *
 * `?room=` is parsed once by `readClientFlags` in `xr/flags.ts` and passed in here.
 * This module owns the actual room JSON load; do not duplicate it.
 *
 * SEM must be installed with `XRDevice.installSEM()` so IWER's plane/mesh
 * detection reads `device.sem.trackedPlanes`. Constructing
 * `SyntheticEnvironmentModule` without installing it leaves surfaces empty
 * and the session falls through to `noSurfaces`.
 */

import type { EmulatorRoom } from '../xr/flags';

export interface EmulatorConfig {
  device?: 'metaQuest2' | 'metaQuest3' | 'metaQuestPro' | 'oculusQuest1';
  room?: EmulatorRoom;
}

export interface IwerSemLike {
  loadEnvironment: (json: unknown) => void;
  loadDefaultEnvironment?: (envId: string) => void | Promise<void>;
  planesVisible?: boolean;
  boundingBoxesVisible?: boolean;
  meshesVisible?: boolean;
}

export interface IwerDeviceLike {
  installSEM: (ctor: new (device: IwerDeviceLike) => IwerSemLike) => void;
  installRuntime: (options: { forceInstall: boolean }) => void;
  primaryInputMode: 'controller' | 'hand';
  sem?: IwerSemLike;
}

export interface IwerHost {
  IWER_DEVICE?: unknown;
}

/**
 * Load room scene data dynamically (fallback when SEM has no
 * `loadDefaultEnvironment`).
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

function iwerDevice(): IwerDeviceLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { IWER_DEVICE?: IwerDeviceLike }).IWER_DEVICE;
}

function hideSemOverlay(sem: IwerSemLike): void {
  if ('meshesVisible' in sem) sem.meshesVisible = false;
  if ('planesVisible' in sem) sem.planesVisible = false;
  if ('boundingBoxesVisible' in sem) sem.boundingBoxesVisible = false;
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
 * In Vite DEV the iwer plugin already injected a working polyfill. Skip so we
 * do not double-install. Production always installs (Playwright / headless
 * Chromium may report a stub `navigator.xr` with no planes).
 */
export async function shouldSkipEmulatorInstall(
  xr:
    | { isSessionSupported: (mode: 'immersive-ar') => Promise<boolean> }
    | null
    | undefined,
  isDev: boolean
): Promise<boolean> {
  if (!isDev || !xr) return false;
  try {
    return await xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

/**
 * Attach SEM to the device (required for XRPlane / XRMesh) and load a room.
 */
export async function attachSemToDevice(
  xrDevice: IwerDeviceLike,
  SemCtor: new (device: IwerDeviceLike) => IwerSemLike,
  room: EmulatorRoom | undefined,
  loadJson: (room: string) => Promise<unknown> = loadRoomScene
): Promise<void> {
  xrDevice.installSEM(SemCtor);
  const sem = xrDevice.sem;
  if (!sem) {
    throw new Error('SEM did not attach to XRDevice (installSEM missing)');
  }
  if (!room) return;
  if (sem.loadDefaultEnvironment) {
    await sem.loadDefaultEnvironment(room);
  } else {
    sem.loadEnvironment(await loadJson(room));
  }
  hideSemOverlay(sem);
}

/** e2e / `__rq` hand driving reads `window.IWER_DEVICE`. */
export function exposeIwerDevice(
  device: unknown,
  target: IwerHost = globalThis as IwerHost
): void {
  target.IWER_DEVICE = device;
}

/**
 * Load and initialize the IWER runtime with scene understanding
 */
export async function loadEmulatorRuntime(
  config: EmulatorConfig = {}
): Promise<void> {
  try {
    if (await shouldSkipEmulatorInstall(navigator.xr, import.meta.env.DEV)) {
      console.log(
        '[Emulator] WebXR API already available and functional, skipping IWER load'
      );
      if (config.room) {
        await applyEmulatorRoom(config.room);
      }
      return;
    }
    if (navigator.xr) {
      console.log(
        '[Emulator] WebXR API exists but immersive-ar not supported, loading IWER...'
      );
    }

    console.log('[Emulator] Loading IWER runtime...');

    const [
      { XRDevice, metaQuest3, metaQuest2, metaQuestPro, oculusQuest1 },
      { SyntheticEnvironmentModule },
    ] = await Promise.all([import('iwer'), import('@iwer/sem')]);

    const deviceConfigMap = {
      metaQuestPro,
      metaQuest3,
      metaQuest2,
      oculusQuest1,
    };

    const deviceConfig = deviceConfigMap[config.device || 'metaQuest3'];
    const xrDevice = new XRDevice(deviceConfig) as unknown as IwerDeviceLike;

    await attachSemToDevice(
      xrDevice,
      SyntheticEnvironmentModule as unknown as new (
        device: IwerDeviceLike
      ) => IwerSemLike,
      config.room
    );
    if (config.room) {
      console.log(`[Emulator] Loaded room: ${config.room}`);
    }

    xrDevice.primaryInputMode = 'hand';
    exposeIwerDevice(xrDevice);

    // Force install even if a stub navigator.xr exists (e.g. headless Chromium)
    xrDevice.installRuntime({ forceInstall: true });

    console.log(
      `[Emulator] IWER runtime installed (device: ${config.device || 'metaQuest3'})`
    );

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
