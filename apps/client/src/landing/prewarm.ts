/**
 * Fire-and-forget GET /api/health after load / idle.
 * No custom headers (avoids a CORS preflight). Errors are swallowed.
 */

import {
  HEALTH_PATH,
  markHealthPrewarmAnswered,
  markHealthPrewarmStarted,
  shouldSkipHealthPrewarm,
} from '../game/director/health-prewarm.js';

export type HealthFetch = (
  input: string,
  init: { method: 'GET'; keepalive: true }
) => Promise<unknown>;

export interface PrewarmApiHealthOptions {
  apiBaseUrl: string;
  search: string;
  fetch: HealthFetch;
}

export interface ScheduleHealthPrewarmOptions extends PrewarmApiHealthOptions {
  readyState?: DocumentReadyState;
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number }
  ) => number;
  addLoadListener?: (callback: () => void) => void;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Start the health GET immediately. Returns without waiting.
 */
export function prewarmApiHealth(options: PrewarmApiHealthOptions): void {
  if (shouldSkipHealthPrewarm(options.search)) {
    return;
  }
  const base = stripTrailingSlash(options.apiBaseUrl);
  if (!base) {
    return;
  }

  markHealthPrewarmStarted();
  try {
    void options
      .fetch(`${base}${HEALTH_PATH}`, { method: 'GET', keepalive: true })
      .then(
        () => {
          markHealthPrewarmAnswered();
        },
        () => {
          markHealthPrewarmAnswered();
        }
      );
  } catch {
    markHealthPrewarmAnswered();
  }
}

/**
 * Run the pre-warm after `load`, or on requestIdleCallback if already loaded.
 */
export function scheduleHealthPrewarm(
  options: ScheduleHealthPrewarmOptions
): void {
  const idle =
    options.requestIdleCallback ??
    (typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : undefined);
  const ready =
    options.readyState ??
    (typeof document !== 'undefined' ? document.readyState : 'complete');

  const start = (): void => {
    prewarmApiHealth(options);
  };
  const run = (): void => {
    if (typeof idle === 'function') {
      idle(start, { timeout: 2000 });
    } else {
      start();
    }
  };

  if (ready === 'complete') {
    run();
    return;
  }

  const add =
    options.addLoadListener ??
    ((callback: () => void) => {
      window.addEventListener('load', callback, { once: true });
    });
  add(run);
}
