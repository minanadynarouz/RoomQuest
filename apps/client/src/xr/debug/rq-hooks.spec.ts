import { describe, expect, it, beforeEach } from 'vitest';
import {
  installRqHooks,
  registerRqHook,
  resetRqHooks,
  rqHooksEnabled,
  type RqHookTarget,
  type RqHooks,
} from './rq-hooks.js';
import { EMPTY_PERF_STATS } from './stats.js';

const off = { flags: { debug: false }, isDev: false };
const debugOn = { flags: { debug: true }, isDev: false };
const devOn = { flags: { debug: false }, isDev: true };

describe('rqHooksEnabled', () => {
  it('is off in production without ?debug=1', () => {
    expect(rqHooksEnabled({ debug: false }, false)).toBe(false);
  });

  it('is on in dev or with ?debug=1', () => {
    expect(rqHooksEnabled({ debug: false }, true)).toBe(true);
    expect(rqHooksEnabled({ debug: true }, false)).toBe(true);
  });
});

describe('registerRqHook / installRqHooks', () => {
  let target: RqHookTarget;

  beforeEach(() => {
    target = {};
    resetRqHooks(target);
  });

  it('does not install window.__rq in production without ?debug=1', () => {
    const autoSolve = async (): Promise<void> => {
      /* X-05 */
    };
    expect(
      registerRqHook('autoSolve', autoSolve, { ...off, target })
    ).toBe(false);
    expect(target.__rq).toBeUndefined();
    expect(installRqHooks({ drawCalls: 4 }, { ...off, target })).toBe(false);
    expect(target.__rq).toBeUndefined();
  });

  it('installs store, plan and stats when ?debug=1', () => {
    const installed = installRqHooks(
      {
        store: { plan: null } as RqHooks['store'],
        plan: null,
        stats: () => ({ ...EMPTY_PERF_STATS, drawCalls: 4 }),
      },
      { ...debugOn, target }
    );
    expect(installed).toBe(true);
    expect(target.__rq?.store).toBeDefined();
    expect(target.__rq?.plan).toBeNull();
    expect(target.__rq?.stats?.().drawCalls).toBe(4);
    expect(target.__rq?.autoSolve).toBeUndefined();
  });

  it('lets X-05 register autoSolve without replacing the rest of __rq', () => {
    installRqHooks({ drawCalls: 8, plan: null }, { ...debugOn, target });
    const autoSolve = async (): Promise<void> => {
      /* X-05 */
    };
    expect(
      registerRqHook('autoSolve', autoSolve, { ...debugOn, target })
    ).toBe(true);
    expect(target.__rq?.drawCalls).toBe(8);
    expect(target.__rq?.autoSolve).toBe(autoSolve);
  });

  it('keeps a pre-registered autoSolve across a later installRqHooks', () => {
    const autoSolve = async (): Promise<void> => {
      /* X-05 */
    };
    registerRqHook('autoSolve', autoSolve, { ...debugOn, target });
    installRqHooks({ drawCalls: 12 }, { ...debugOn, target });
    expect(target.__rq?.drawCalls).toBe(12);
    expect(target.__rq?.autoSolve).toBe(autoSolve);
  });

  it('installs in dev without the debug flag', () => {
    expect(installRqHooks({ drawCalls: 1 }, { ...devOn, target })).toBe(true);
    expect(target.__rq?.drawCalls).toBe(1);
  });

  it('strips __rq when later gated off', () => {
    installRqHooks({ drawCalls: 1 }, { ...debugOn, target });
    installRqHooks({ drawCalls: 1 }, { ...off, target });
    expect(target.__rq).toBeUndefined();
  });
});
