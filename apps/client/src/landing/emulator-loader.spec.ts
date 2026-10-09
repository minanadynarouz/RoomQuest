import { describe, expect, it, vi } from 'vitest';
import {
  attachSemToDevice,
  exposeIwerDevice,
  shouldSkipEmulatorInstall,
  type IwerDeviceLike,
  type IwerSemLike,
} from './emulator-loader';

function makeDevice(): IwerDeviceLike & { sem?: IwerSemLike } {
  const device: IwerDeviceLike = {
    primaryInputMode: 'controller',
    installRuntime: vi.fn(),
    installSEM(ctor) {
      device.sem = new ctor(device);
    },
  };
  return device;
}

describe('shouldSkipEmulatorInstall', () => {
  it('never skips in production, even when immersive-ar reports supported', async () => {
    const xr = {
      isSessionSupported: vi.fn().mockResolvedValue(true),
    };
    await expect(shouldSkipEmulatorInstall(xr, false)).resolves.toBe(false);
    expect(xr.isSessionSupported).not.toHaveBeenCalled();
  });

  it('skips in dev when the plugin polyfill already supports immersive-ar', async () => {
    const xr = {
      isSessionSupported: vi.fn().mockResolvedValue(true),
    };
    await expect(shouldSkipEmulatorInstall(xr, true)).resolves.toBe(true);
  });

  it('does not skip in dev when xr is missing', async () => {
    await expect(shouldSkipEmulatorInstall(undefined, true)).resolves.toBe(
      false
    );
  });
});

describe('attachSemToDevice', () => {
  it('installs SEM on the device before loading the room', async () => {
    const loadDefaultEnvironment = vi.fn().mockResolvedValue(undefined);
    const loadEnvironment = vi.fn();
    class Sem implements IwerSemLike {
      loadEnvironment = loadEnvironment;
      loadDefaultEnvironment = loadDefaultEnvironment;
    }
    const device = makeDevice();
    const loadJson = vi.fn();

    await attachSemToDevice(device, Sem, 'living_room', loadJson);

    expect(device.sem).toBeInstanceOf(Sem);
    expect(loadDefaultEnvironment).toHaveBeenCalledWith('living_room');
    expect(loadJson).not.toHaveBeenCalled();
    expect(loadEnvironment).not.toHaveBeenCalled();
  });

  it('falls back to loadEnvironment when loadDefaultEnvironment is missing', async () => {
    const loadEnvironment = vi.fn();
    class Sem implements IwerSemLike {
      loadEnvironment = loadEnvironment;
    }
    const device = makeDevice();
    const json = { room: 'office_small' };
    const loadJson = vi.fn().mockResolvedValue(json);

    await attachSemToDevice(device, Sem, 'office_small', loadJson);

    expect(loadJson).toHaveBeenCalledWith('office_small');
    expect(loadEnvironment).toHaveBeenCalledWith(json);
  });

  it('throws if installSEM does not attach sem (the production noSurfaces bug)', async () => {
    const device: IwerDeviceLike = {
      primaryInputMode: 'controller',
      installRuntime: vi.fn(),
      installSEM: vi.fn(),
    };
    class Sem implements IwerSemLike {
      loadEnvironment = vi.fn();
    }

    await expect(
      attachSemToDevice(device, Sem, 'living_room')
    ).rejects.toThrow(/installSEM/);
  });
});

describe('exposeIwerDevice', () => {
  it('assigns window.IWER_DEVICE for e2e hand driving', () => {
    const target: { IWER_DEVICE?: unknown } = {};
    const device = { id: 'xr' };
    exposeIwerDevice(device, target);
    expect(target.IWER_DEVICE).toBe(device);
  });
});
