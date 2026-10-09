/**
 * Headed Chromium XR E2E for X-08 (slime patrol + stun).
 *
 * Desktop `?fixture=synthetic_slime`: explorer waits on an awake slime,
 * autoSolve stuns via the same path as poke/pinch, explorer passes.
 *
 * `?fixture=synthetic_slime&xr=1` boots IWER AR, then:
 *   Left: near poke stuns; explorer waits then passes.
 *   Right: far ray+pinch from ~2 m stuns; explorer waits then passes.
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, '../../../docs/img/x08');
const DEFAULT_PORT = 5173;
const FIXTURE = 'synthetic_slime';
const SLIME_ID = 'p8';

interface IwerHand {
  position: { set: (x: number, y: number, z: number) => void };
  quaternion: {
    set: (x: number, y: number, z: number, w: number) => void;
  };
  poseId: string;
  connected: boolean;
  pinchValue: number;
  updatePinchValue: (value: number) => void;
  setPinchValueImmediate?: (value: number) => void;
}

interface IwerDevice {
  primaryInputMode: 'controller' | 'hand';
  controlMode: string;
  hands: { left?: IwerHand; right?: IwerHand };
}

interface RqWindow {
  IWER_DEVICE?: IwerDevice;
  __rq?: {
    store: {
      phase: string;
      events: { type: string; placementId?: string; reason?: string }[];
    };
    placement?: {
      pieceWorldPose: (
        id: string
      ) => { x: number; y: number; z: number } | null;
    } | null;
    explorer?: {
      state: () => string;
      reason: () => string | undefined;
      pose: () => { x: number; y: number; z: number; yaw: number };
    };
    autoSolve?: () => void;
    slime?: {
      stun: (id: string) => boolean;
      boundCount?: () => number;
      isAwake?: (id: string) => boolean;
    };
  };
}

/** IWER `point` pose index-finger-tip offset from targetRaySpace. */
const INDEX_TIP_POINT = {
  left: { x: 0.031, y: 0.063, z: -0.041 },
  right: { x: -0.031, y: 0.063, z: -0.041 },
} as const;

const IWER_APIS_USED = [
  'window.IWER_DEVICE',
  'XRDevice.primaryInputMode',
  'XRDevice.controlMode',
  'XRDevice.hands[left|right]',
  'XRHandInput.connected',
  'XRHandInput.poseId',
  'XRHandInput.position.set',
  'XRHandInput.quaternion.set',
  'XRHandInput.updatePinchValue',
  'XRHandInput.setPinchValueImmediate',
  'XRHandInput.poseId=point|pinch|default',
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startVite(): Promise<{ url: string; stop: () => void }> {
  const fromEnv = process.env.X05_BASE_URL ?? process.env.X08_BASE_URL;
  if (fromEnv) {
    return { url: fromEnv, stop: () => undefined };
  }

  const child: ChildProcess = spawn(
    'pnpm',
    ['exec', 'vite', '--host', '127.0.0.1', '--port', String(DEFAULT_PORT)],
    {
      cwd: CLIENT_ROOT,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let output = '';
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`vite did not start. Output:\n${output}`));
    }, 60_000);
    const onData = (buf: Buffer): void => {
      output += buf.toString();
      const match = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/.exec(output);
      if (match?.[0]) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`vite exited ${String(code)}: ${output}`));
      }
    });
  });

  return {
    url,
    stop: () => {
      child.kill('SIGTERM');
    },
  };
}

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: false,
    args: [
      '--ignore-certificate-errors',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
    ],
  });
}

async function waitForRq(page: Page, timeout = 45_000): Promise<void> {
  try {
    await page.waitForFunction(
      () => Boolean((window as unknown as RqWindow).__rq?.explorer),
      null,
      { timeout }
    );
  } catch (error) {
    const debug = await page.evaluate(() => {
      const w = window as unknown as RqWindow;
      return {
        href: location.href,
        title: document.title,
        hasRq: Boolean(w.__rq),
        rqKeys: w.__rq ? Object.keys(w.__rq) : [],
        hasIwer: Boolean(w.IWER_DEVICE),
        overlay: Boolean(document.querySelector('vite-error-overlay')),
        bodyStart: document.body.innerText.slice(0, 400),
      };
    });
    throw new Error(
      `waitForRq failed: ${JSON.stringify(debug)} original=${String(error)}`
    );
  }
}

async function dismissViteOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.querySelector('vite-error-overlay')?.remove();
  });
}

async function shot(page: Page, name: string): Promise<void> {
  await dismissViteOverlay(page);
  const canvas = page.locator('#scene-container canvas').first();
  if ((await canvas.count()) > 0) {
    await canvas.screenshot({ path: path.join(OUT_DIR, name) });
  } else {
    await page.screenshot({ path: path.join(OUT_DIR, name), type: 'png' });
  }
}

function lookRotation(
  dx: number,
  dy: number,
  dz: number
): { x: number; y: number; z: number; w: number } {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  const fx = dx / len;
  const fy = dy / len;
  const fz = dz / len;
  let rx = fy;
  let ry = -fx;
  let rz = 0;
  const rLen = Math.hypot(rx, ry, rz);
  if (rLen === 0) {
    rx = 1;
    ry = 0;
    rz = 0;
  } else {
    rx /= rLen;
    ry /= rLen;
    rz /= rLen;
  }
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const m00 = rx;
  const m01 = ux;
  const m02 = -fx;
  const m10 = ry;
  const m11 = uy;
  const m12 = -fy;
  const m20 = rz;
  const m21 = uz;
  const m22 = -fz;
  const trace = m00 + m11 + m22;
  let qw: number;
  let qx: number;
  let qy: number;
  let qz: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  const qLen = Math.hypot(qx, qy, qz, qw) || 1;
  return { x: qx / qLen, y: qy / qLen, z: qz / qLen, w: qw / qLen };
}

async function slimeSummary(page: Page): Promise<{
  stunned: boolean;
  woke: boolean;
  explorer: string | undefined;
  reason: string | undefined;
  events: string[];
  phase: string | undefined;
}> {
  return page.evaluate((slimeId) => {
    const rq = (window as unknown as RqWindow).__rq;
    const events = rq?.store.events ?? [];
    return {
      stunned: events.some(
        (e) => e.type === 'slimeStunned' && e.placementId === slimeId
      ),
      woke: events.some(
        (e) => e.type === 'slimeWoke' && e.placementId === slimeId
      ),
      explorer: rq?.explorer?.state(),
      reason: rq?.explorer?.reason(),
      events: events.map((e) => e.type),
      phase: rq?.store.phase,
    };
  }, SLIME_ID);
}

async function waitForAwakeBlock(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const rq = (window as unknown as RqWindow).__rq;
      return (
        rq?.explorer?.state() === 'blocked' &&
        rq.explorer.reason() === 'awakeSlime'
      );
    },
    null,
    { timeout: 45_000 }
  );
}

async function waitForExplorerPastSlime(page: Page): Promise<void> {
  await page.waitForFunction(
    (slimeId) => {
      const rq = (window as unknown as RqWindow).__rq;
      if (!rq) return false;
      const stunned = rq.store.events.some(
        (e) => e.type === 'slimeStunned' && e.placementId === slimeId
      );
      if (!stunned) return false;
      if (rq.store.phase === 'won') return true;
      const state = rq.explorer?.state();
      const reason = rq.explorer?.reason();
      if (state === 'celebrating') return true;
      if (reason === 'awakeSlime') return false;
      return state === 'walking' || state === 'idle';
    },
    SLIME_ID,
    { timeout: 90_000 }
  );
}

async function enterXrFixture(page: Page, baseUrl: string): Promise<void> {
  const logs: string[] = [];
  page.on('console', (msg) => {
    logs.push(msg.text());
  });
  page.on('pageerror', (error) => {
    logs.push(`PAGEERROR ${error.message}`);
  });

  await page.goto(`${baseUrl}/?fixture=${FIXTURE}&xr=1`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  const button = page.locator('#enter-button');
  for (let i = 0; i < 60; i += 1) {
    if (await button.isEnabled()) break;
    await sleep(500);
  }
  if (!(await button.isEnabled())) {
    throw new Error(
      `Enter button never enabled. logs=${logs.slice(-30).join(' | ')}`
    );
  }
  await button.click();
  await waitForRq(page, 60_000);
  await page.waitForFunction(
    () => Boolean((window as unknown as RqWindow).IWER_DEVICE),
    null,
    { timeout: 20_000 }
  );
}

async function connectHand(page: Page, hand: 'left' | 'right'): Promise<void> {
  const ok = await page.evaluate((handedness) => {
    const w = window as unknown as RqWindow;
    const device = w.IWER_DEVICE;
    const input = device?.hands[handedness];
    if (!device || !input) return false;
    device.primaryInputMode = 'hand';
    device.controlMode = 'programmatic';
    input.connected = true;
    return true;
  }, hand);
  if (!ok) {
    throw new Error(`${hand} IWER hand missing`);
  }
}

async function setHandPose(
  page: Page,
  hand: 'left' | 'right',
  pose: {
    x: number;
    y: number;
    z: number;
    poseId?: string;
    qx?: number;
    qy?: number;
    qz?: number;
    qw?: number;
  }
): Promise<void> {
  await page.evaluate(
    ({ handedness, pose: next }) => {
      const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
        handedness
      ];
      if (!input) return;
      input.poseId = next.poseId ?? 'default';
      input.updatePinchValue(0);
      input.setPinchValueImmediate?.(0);
      input.quaternion.set(
        next.qx ?? 0,
        next.qy ?? 0,
        next.qz ?? 0,
        next.qw ?? 1
      );
      input.position.set(next.x, next.y, next.z);
    },
    { handedness: hand, pose }
  );
}

async function slimeWasStunned(page: Page): Promise<boolean> {
  return page.evaluate((slimeId) => {
    const events = (window as unknown as RqWindow).__rq?.store.events ?? [];
    return events.some(
      (e) => e.type === 'slimeStunned' && e.placementId === slimeId
    );
  }, SLIME_ID);
}

async function pokeSlime(
  page: Page,
  hand: 'left' | 'right'
): Promise<Record<string, unknown>> {
  await connectHand(page, hand);
  const slime = await page.evaluate((slimeId) => {
    return (window as unknown as RqWindow).__rq?.placement?.pieceWorldPose(
      slimeId
    );
  }, SLIME_ID);
  if (!slime) {
    throw new Error(`missing slime ${SLIME_ID} world pose`);
  }

  const tip = INDEX_TIP_POINT[hand];
  const hitY = slime.y + 0.08;
  const wristAt = (tx: number, ty: number, tz: number) => ({
    x: tx - tip.x,
    y: ty - tip.y,
    z: tz - tip.z,
    poseId: 'point' as const,
  });

  await setHandPose(page, hand, wristAt(slime.x, hitY + 0.55, slime.z));
  await sleep(450);

  const heights = [0.45, 0.28, 0.14, 0.04, 0];
  for (const dy of heights) {
    await setHandPose(page, hand, wristAt(slime.x, hitY + dy, slime.z));
    await sleep(280);
    if (await slimeWasStunned(page)) {
      const summary = await slimeSummary(page);
      console.log(`[X-08 e2e] ${hand} near poke`, summary);
      return summary;
    }
  }

  try {
    await page.waitForFunction(
      (slimeId) => {
        const events =
          (window as unknown as RqWindow).__rq?.store.events ?? [];
        return events.some(
          (e) => e.type === 'slimeStunned' && e.placementId === slimeId
        );
      },
      SLIME_ID,
      { timeout: 12_000 }
    );
  } catch {
    const summary = await slimeSummary(page);
    const bound = await page.evaluate(() => {
      return (window as unknown as RqWindow).__rq?.slime?.boundCount?.();
    });
    throw new Error(
      `${hand} poke never emitted slimeStunned. ${JSON.stringify({
        slime,
        bound,
        ...summary,
      })}`
    );
  }

  const summary = await slimeSummary(page);
  console.log(`[X-08 e2e] ${hand} near poke`, summary);
  return summary;
}

async function rayPinchSlime(
  page: Page,
  hand: 'left' | 'right'
): Promise<Record<string, unknown>> {
  await connectHand(page, hand);
  const prepared = await page.evaluate(
    ({ handedness, slimeId }) => {
      const w = window as unknown as RqWindow;
      const input = w.IWER_DEVICE?.hands[handedness];
      const slime = w.__rq?.placement?.pieceWorldPose(slimeId);
      if (!input || !slime) {
        return { ok: false as const, reason: 'missing hand or slime' };
      }
      // Side-on ~2 m so the explorer at the hut does not eat the ray.
      const far = {
        x: 2.35,
        y: 1.05,
        z: -1.0,
      };
      const dx = slime.x - far.x;
      const dy = slime.y - far.y;
      const dz = slime.z - far.z;
      const dist = Math.hypot(dx, dy, dz);
      return { ok: true as const, far, slime, dist, dx, dy, dz };
    },
    { handedness: hand, slimeId: SLIME_ID }
  );

  if (!prepared.ok) {
    throw new Error(`${hand} far prepare failed: ${JSON.stringify(prepared)}`);
  }
  if (prepared.dist < 1.8) {
    throw new Error(
      `${hand} far slime is only ${prepared.dist.toFixed(2)} m; need ~2 m`
    );
  }

  let lastAim: Record<string, unknown> = prepared;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const aim = await page.evaluate(
      ({ handedness, slimeId, far }) => {
        const w = window as unknown as RqWindow;
        const input = w.IWER_DEVICE?.hands[handedness];
        const slime = w.__rq?.placement?.pieceWorldPose(slimeId);
        if (!input || !slime) {
          return { ok: false as const, reason: 'missing hand or slime' };
        }
        const dx = slime.x - far.x;
        const dy = slime.y + 0.05 - far.y;
        const dz = slime.z - far.z;
        const dist = Math.hypot(dx, dy, dz);
        return { ok: true as const, slime, dist, dx, dy, dz };
      },
      { handedness: hand, slimeId: SLIME_ID, far: prepared.far }
    );
    if (!aim.ok) {
      throw new Error(`${hand} far re-aim failed: ${JSON.stringify(aim)}`);
    }
    lastAim = aim;
    const rot = lookRotation(aim.dx, aim.dy, aim.dz);
    await page.evaluate(
      ({ handedness, far, rot: q, pinch }) => {
        const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
          handedness
        ];
        if (!input) return;
        input.poseId = pinch ? 'pinch' : 'default';
        input.position.set(far.x, far.y, far.z);
        input.quaternion.set(q.x, q.y, q.z, q.w);
        if (pinch) {
          input.setPinchValueImmediate?.(1);
          input.updatePinchValue(1);
        } else {
          input.updatePinchValue(0);
          input.setPinchValueImmediate?.(0);
        }
      },
      {
        handedness: hand,
        far: prepared.far,
        rot,
        pinch: attempt > 0,
      }
    );
    await sleep(attempt === 0 ? 500 : 280);
    if (attempt === 0) {
      await page.evaluate((handedness) => {
        const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
          handedness
        ];
        if (!input) return;
        input.poseId = 'pinch';
        input.setPinchValueImmediate?.(1);
        input.updatePinchValue(1);
      }, hand);
      await sleep(350);
    }
    if (await slimeWasStunned(page)) break;
  }

  if (!(await slimeWasStunned(page))) {
    const summary = await slimeSummary(page);
    throw new Error(
      `${hand} far ray+pinch failed: ${JSON.stringify({
        prepared,
        lastAim,
        summary,
      })}`
    );
  }

  await page.evaluate((handedness) => {
    const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
      handedness
    ];
    if (!input) return;
    input.updatePinchValue(0);
    input.setPinchValueImmediate?.(0);
    input.poseId = 'default';
  }, hand);
  await sleep(200);

  const summary = await slimeSummary(page);
  console.log(`[X-08 e2e] ${hand} far ray+pinch`, {
    dist: prepared.dist,
    summary,
  });
  return { ...summary, dist: prepared.dist };
}

async function captureDesktopScreenshots(
  browser: Browser,
  baseUrl: string
): Promise<void> {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(`${baseUrl}/?fixture=${FIXTURE}`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await waitForRq(page);
  await waitForAwakeBlock(page);
  await shot(page, 'blocked-slime.png');
  console.log('[X-08 e2e] screenshot blocked-slime.png');

  const solved = await page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    rq?.autoSolve?.();
    return {
      phase: rq?.store.phase,
      events: rq?.store.events.map((e) => e.type),
    };
  });
  const desktopEvents = solved.events ?? [];
  if (!desktopEvents.includes('slimeStunned')) {
    throw new Error(
      `autoSolve did not stun via the slime path: ${JSON.stringify(solved)}`
    );
  }
  console.log('[X-08 e2e] desktop autoSolve', solved);

  await waitForExplorerPastSlime(page);
  await shot(page, 'passed.png');
  console.log('[X-08 e2e] screenshot passed.png');

  await page.waitForFunction(
    () => (window as unknown as RqWindow).__rq?.store.phase === 'won',
    null,
    { timeout: 60_000 }
  );
  await sleep(400);
  await shot(page, 'won.png');
  console.log('[X-08 e2e] screenshot won.png');
  await page.close();
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const server = await startVite();
  const browser = await launchBrowser();
  try {
    await captureDesktopScreenshots(browser, server.url);

    const leftPage = await browser.newPage({ ignoreHTTPSErrors: true });
    await enterXrFixture(leftPage, server.url);
    await waitForAwakeBlock(leftPage);
    await shot(leftPage, 'xr-blocked-slime.png');
    const leftPoke = await pokeSlime(leftPage, 'left');
    console.log('[X-08 e2e] LEFT poke', leftPoke);
    await shot(leftPage, 'near-poke.png');
    await waitForExplorerPastSlime(leftPage);
    await shot(leftPage, 'explorer-passed-near.png');
    await leftPage.close();

    const rightPage = await browser.newPage({ ignoreHTTPSErrors: true });
    await enterXrFixture(rightPage, server.url);
    await waitForAwakeBlock(rightPage);
    const rightFar = await rayPinchSlime(rightPage, 'right');
    console.log('[X-08 e2e] RIGHT far', rightFar);
    await shot(rightPage, 'far-ray-pinch.png');
    await waitForExplorerPastSlime(rightPage);
    await shot(rightPage, 'explorer-passed-far.png');
    await rightPage.waitForFunction(
      () => (window as unknown as RqWindow).__rq?.store.phase === 'won',
      null,
      { timeout: 90_000 }
    );
    const summary = await slimeSummary(rightPage);
    if (!summary.stunned) {
      throw new Error(`won without slimeStunned: ${JSON.stringify(summary)}`);
    }
    console.log('[X-08 e2e] far stun won', summary);
    await sleep(400);
    await shot(rightPage, 'xr-won.png');
    await rightPage.close();

    console.log('[X-08 e2e] IWER APIs used:', IWER_APIS_USED.join(', '));
    console.log(
      '[X-08 e2e] near poke and far ray+pinch stunned the slime; explorer waited then passed'
    );
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
