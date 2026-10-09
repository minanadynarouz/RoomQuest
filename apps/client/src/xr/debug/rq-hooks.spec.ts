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

  it('lets F-07 register pause/resume/forceWin without dropping autoSolve', () => {
    const autoSolve = async (): Promise<void> => {
      /* X-05 */
    };
    const pause = (): void => {
      /* F-07 */
    };
    registerRqHook('autoSolve', autoSolve, { ...debugOn, target });
    registerRqHook('pause', pause, { ...debugOn, target });
    registerRqHook('resume', pause, { ...debugOn, target });
    registerRqHook('forceWin', pause, { ...debugOn, target });
    registerRqHook('replay', pause, { ...debugOn, target });
    registerRqHook('exit', pause, { ...debugOn, target });
    registerRqHook('gateLever', { pull: () => true, boundCount: () => 1 }, {
      ...debugOn,
      target,
    });
    installRqHooks({ drawCalls: 2 }, { ...debugOn, target });
    expect(target.__rq?.autoSolve).toBe(autoSolve);
    expect(target.__rq?.pause).toBe(pause);
    expect(target.__rq?.forceWin).toBe(pause);
    expect(target.__rq?.replay).toBe(pause);
    expect(target.__rq?.exit).toBe(pause);
    expect(target.__rq?.gateLever?.boundCount()).toBe(1);
  });

  it('does not expose pause on window.__rq when gated off', () => {
    registerRqHook('pause', () => undefined, { ...off, target });
    expect(target.__rq).toBeUndefined();
  });

  it('lets X-05 register explorer without dropping autoSolve', () => {
    const autoSolve = async (): Promise<void> => {
      /* X-05 */
    };
    const explorer = {
      state: () => 'blocked',
      reason: () => 'unbuiltGap' as const,
      pose: () => ({ x: 1, y: 0.2, z: -1, yaw: 0 }),
      getWorldPosition: (out: { x: number; y: number; z: number }) => {
        out.x = 1;
        out.y = 0.2;
        out.z = -1;
        return out;
      },
    };
    registerRqHook('autoSolve', autoSolve, { ...debugOn, target });
    registerRqHook('explorer', explorer, { ...debugOn, target });
    installRqHooks({ drawCalls: 3 }, { ...debugOn, target });
    expect(target.__rq?.autoSolve).toBe(autoSolve);
    expect(target.__rq?.explorer?.state()).toBe('blocked');
    const out = { x: 0, y: 0, z: 0 };
    expect(target.__rq?.explorer?.getWorldPosition(out).y).toBe(0.2);
  });

  it('lets X-08 register slime without dropping autoSolve', () => {
    const autoSolve = async (): Promise<void> => {
      /* X-05 */
    };
    const slime = {
      stun: () => true,
      boundCount: () => 1,
      isAwake: () => false,
      canPass: () => true,
    };
    registerRqHook('autoSolve', autoSolve, { ...debugOn, target });
    registerRqHook('slime', slime, { ...debugOn, target });
    installRqHooks({ drawCalls: 3 }, { ...debugOn, target });
    expect(target.__rq?.autoSolve).toBe(autoSolve);
    expect(target.__rq?.slime?.stun('p8')).toBe(true);
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

  it('lets X-09 register villageAnchor without replacing the rest of __rq', () => {
    installRqHooks({ drawCalls: 3, plan: null }, { ...debugOn, target });
    const villageAnchor = {
      status: () => ({
        ready: true,
        placement: 'fallback' as const,
        reason: 'anchors-unsupported' as const,
        persisted: false,
        handle: null,
        surfaceId: 's1',
        persistentAnchorsSupported: false,
        storageAvailable: true,
        attached: false,
        hutPose: null,
      }),
    };
    expect(
      registerRqHook('villageAnchor', villageAnchor, { ...debugOn, target })
    ).toBe(true);
    expect(target.__rq?.drawCalls).toBe(3);
    expect(target.__rq?.villageAnchor).toBe(villageAnchor);
  });
});
