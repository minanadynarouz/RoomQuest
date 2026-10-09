/**
 * Tests for capability check logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkImmersiveARSupport } from './capability-check';

describe('capability-check', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('checkImmersiveARSupport', () => {
    it('should return unsupported when navigator.xr is not available', async () => {
      const originalXR = navigator.xr;
      Object.defineProperty(navigator, 'xr', {
        value: undefined,
        configurable: true,
      });

      const result = await checkImmersiveARSupport();

      expect(result.state).toBe('unsupported');
      expect(result.message).toContain('WebXR is not available');

      Object.defineProperty(navigator, 'xr', {
        value: originalXR,
        configurable: true,
      });
    });

    it('should return supported when immersive-ar is supported', async () => {
      const mockXR = {
        isSessionSupported: vi.fn().mockResolvedValue(true),
      };
      Object.defineProperty(navigator, 'xr', {
        value: mockXR,
        configurable: true,
      });

      const result = await checkImmersiveARSupport();

      expect(result.state).toBe('supported');
      expect(mockXR.isSessionSupported).toHaveBeenCalledWith('immersive-ar');
    });

    it('should return unsupported when immersive-ar is not supported', async () => {
      const mockXR = {
        isSessionSupported: vi.fn().mockResolvedValue(false),
      };
      Object.defineProperty(navigator, 'xr', {
        value: mockXR,
        configurable: true,
      });

      const result = await checkImmersiveARSupport();

      expect(result.state).toBe('unsupported');
      expect(result.message).toContain('not supported');
    });

    it('should return error when isSessionSupported throws', async () => {
      const mockXR = {
        isSessionSupported: vi.fn().mockRejectedValue(new Error('Test error')),
      };
      Object.defineProperty(navigator, 'xr', {
        value: mockXR,
        configurable: true,
      });

      const result = await checkImmersiveARSupport();

      expect(result.state).toBe('error');
      expect(result.message).toContain('Could not check');
    });
  });
});
