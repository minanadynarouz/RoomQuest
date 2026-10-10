/**
 * Landing health pre-warm — fire-and-forget, no CORS preflight, no UI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetHealthPrewarmForTests,
  shouldUseColdStartBudget,
} from '../game/director/health-prewarm.js';
import {
  prewarmApiHealth,
  scheduleHealthPrewarm,
  type HealthFetch,
} from './prewarm.js';

const API = 'https://api.example';

describe('prewarmApiHealth', () => {
  beforeEach(() => {
    resetHealthPrewarmForTests();
  });

  afterEach(() => {
    resetHealthPrewarmForTests();
  });

  it('GETs /api/health with keepalive and no extra headers', () => {
    const fetchFn = vi.fn<HealthFetch>(() => Promise.resolve({ ok: true }));

    prewarmApiHealth({
      apiBaseUrl: `${API}/`,
      search: '',
      fetch: fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(`${API}/api/health`, {
      method: 'GET',
      keepalive: true,
    });
    const init = fetchFn.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(init).not.toHaveProperty('headers');
    expect(init).not.toHaveProperty('body');
    expect(shouldUseColdStartBudget()).toBe(true);
  });

  it('skips when ?director=off', () => {
    const fetchFn = vi.fn<HealthFetch>(() => Promise.resolve({ ok: true }));
    prewarmApiHealth({
      apiBaseUrl: API,
      search: '?director=off',
      fetch: fetchFn,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(shouldUseColdStartBudget()).toBe(false);
  });

  it('skips when ?director=mock', () => {
    const fetchFn = vi.fn<HealthFetch>(() => Promise.resolve({ ok: true }));
    prewarmApiHealth({
      apiBaseUrl: API,
      search: 'director=mock&seed=x',
      fetch: fetchFn,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(shouldUseColdStartBudget()).toBe(false);
  });

  it('returns immediately and swallows a hanging or failing fetch', async () => {
    const fetchFn = vi.fn<HealthFetch>(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('offline'));
          }, 50);
        })
    );

    expect(() => {
      prewarmApiHealth({
        apiBaseUrl: API,
        search: '?director=live',
        fetch: fetchFn,
      });
    }).not.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(shouldUseColdStartBudget()).toBe(true);

    await vi.waitFor(() => {
      expect(shouldUseColdStartBudget()).toBe(false);
    });
  });

  it('marks the pre-warm answered after a thrown fetch', () => {
    const fetchFn = vi.fn<HealthFetch>(() => {
      throw new Error('sync fail');
    });
    prewarmApiHealth({
      apiBaseUrl: API,
      search: '',
      fetch: fetchFn,
    });
    expect(shouldUseColdStartBudget()).toBe(false);
  });

  it('skips when the API base URL is empty', () => {
    const fetchFn = vi.fn<HealthFetch>(() => Promise.resolve({ ok: true }));
    prewarmApiHealth({
      apiBaseUrl: '',
      search: '',
      fetch: fetchFn,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('scheduleHealthPrewarm', () => {
  beforeEach(() => {
    resetHealthPrewarmForTests();
  });

  afterEach(() => {
    resetHealthPrewarmForTests();
  });

  it('uses requestIdleCallback when the page is already loaded', () => {
    const fetchFn = vi.fn<HealthFetch>(() => Promise.resolve({ ok: true }));
    const idle = vi.fn(
      (callback: () => void, _options?: { timeout: number }) => {
        callback();
        return 1;
      }
    );

    scheduleHealthPrewarm({
      apiBaseUrl: API,
      search: '',
      fetch: fetchFn,
      readyState: 'complete',
      requestIdleCallback: idle,
    });

    expect(idle).toHaveBeenCalledTimes(1);
    expect(idle.mock.calls[0]?.[1]).toEqual({ timeout: 2000 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('waits for load when the document is still loading', () => {
    const fetchFn = vi.fn<HealthFetch>(() => Promise.resolve({ ok: true }));
    let onLoad: (() => void) | undefined;
    const idle = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });

    scheduleHealthPrewarm({
      apiBaseUrl: API,
      search: '',
      fetch: fetchFn,
      readyState: 'loading',
      requestIdleCallback: idle,
      addLoadListener: (callback) => {
        onLoad = callback;
      },
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(idle).not.toHaveBeenCalled();
    onLoad?.();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
