import type { EmulatorRoom } from '../flags.js';

interface IwerSem {
  loadDefaultEnvironment?: (envId: string) => void | Promise<void>;
  loadEnvironment?: (json: unknown) => void;
  planesVisible: boolean;
  boundingBoxesVisible: boolean;
  meshesVisible: boolean;
}

interface IwerDevice {
  sem?: IwerSem;
}

function hideSemOverlay(sem: IwerSem): void {
  sem.meshesVisible = false;
  sem.planesVisible = false;
  sem.boundingBoxesVisible = false;
}

/**
 * Switch the already-injected IWER SEM to `room` without re-installing the
 * runtime. Used by `?room=` in DEV (plugin IWER) and the X-10 room sampler.
 */
export async function applyInjectedEmulatorRoom(
  room: EmulatorRoom
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const device = (window as Window & { IWER_DEVICE?: IwerDevice }).IWER_DEVICE;
  const sem = device?.sem;
  if (!sem?.loadDefaultEnvironment) return false;
  try {
    await sem.loadDefaultEnvironment(room);
    hideSemOverlay(sem);
    console.log(`[X-10] IWER room ${room}`);
    return true;
  } catch (error) {
    console.warn(`[X-10] IWER room ${room} failed`, error);
    return false;
  }
}
