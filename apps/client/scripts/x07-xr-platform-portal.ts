/**
 * Headed Chromium XR E2E for X-07 (moving platform + portal pair).
 *
 * Desktop `?fixture=synthetic_platform_portal`: unaligned blocker, autoSolve
 * aligns, explorer rides/teleports to won.
 *
 * `?fixture=synthetic_platform_portal&xr=1` boots IWER AR, then ray+pinch
 * drags the platform along its rail until aligned.
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, '../../../docs/img/x07');
const DEFAULT_PORT = 5173;
const FIXTURE = 'synthetic_platform_portal';

interface IwerHand {
  position: { set: (x: number, y: number, z: number) => void };
  quaternion: { set: (x: number, y: number, z: number, w: number) => void };
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

interface PlatformApi {
  align: (id?: string) => boolean;
  moveToT: (t: number, id?: string) => boolean;
  railT: (id?: string) => number | null;
  aligned: (id?: string) => boolean;
  grabbed: (id?: string) => boolean;
  worldPose: (id?: string) => { x: number; y: number; z: number } | null;
}

interface RqWindow {
  IWER_DEVICE?: IwerDevice;
  __rq?: {
    store: {
      phase: string;
      events: { type: string; placementId?: string; reason?: string }[];
    };
    platform?: PlatformApi | null;
    explorer?: {
      state: () => string;
      reason: () => string | undefined;
    };
    autoSolve?: () => void;
  };
}

/** Aim IWER targetRaySpace along (dx,dy,dz). Same basis as X-06 far ray. */
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startVite(): Promise<{ url: string; stop: () => void }> {
  const fromEnv = process.env.X05_BASE_URL ?? process.env.X07_BASE_URL;
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
  await page.waitForFunction(
    () => Boolean((window as unknown as RqWindow).__rq?.explorer),
    null,
    { timeout }
  );
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

async function captureDesktop(browser: Browser, baseUrl: string): Promise<void> {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(`${baseUrl}/?fixture=${FIXTURE}`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await waitForRq(page);

  await page.waitForFunction(
    () => {
      const rq = (window as unknown as RqWindow).__rq;
      return (
        rq?.explorer?.state() === 'blocked' &&
        rq.explorer.reason() === 'unalignedPlatform'
      );
    },
    null,
    { timeout: 45_000 }
  );
  await shot(page, 'unaligned.png');
  console.log('[X-07 e2e] screenshot unaligned.png');

  const solved = await page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    rq?.autoSolve?.();
    return {
      phase: rq?.store.phase,
      aligned: rq?.platform?.aligned('p2'),
      events: rq?.store.events.map((e) => e.type),
    };
  });
  console.log('[X-07 e2e] desktop autoSolve', solved);
  if (!solved.events?.includes('platformAligned')) {
    throw new Error(`autoSolve did not align platform: ${JSON.stringify(solved)}`);
  }

  await page.waitForFunction(
    () => {
      const rq = (window as unknown as RqWindow).__rq;
      const state = rq?.explorer?.state();
      return state === 'riding' || state === 'teleporting';
    },
    null,
    { timeout: 45_000 }
  );
  await shot(page, 'riding.png');
  console.log('[X-07 e2e] screenshot riding.png');

  await page.waitForFunction(
    () =>
      (window as unknown as RqWindow).__rq?.store.events.some(
        (e) => e.type === 'portalUsed'
      ),
    null,
    { timeout: 60_000 }
  );
  await shot(page, 'portal.png');
  console.log('[X-07 e2e] screenshot portal.png');

  await page.waitForFunction(
    () => (window as unknown as RqWindow).__rq?.store.phase === 'won',
    null,
    { timeout: 60_000 }
  );
  await shot(page, 'won.png');
  console.log('[X-07 e2e] screenshot won.png');
  await page.close();
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

async function pinchDragPlatform(page: Page): Promise<Record<string, unknown>> {
  const prepared = await page.evaluate(() => {
    const w = window as unknown as RqWindow;
    const device = w.IWER_DEVICE;
    const platform = w.__rq?.platform;
    if (!device) {
      return { ok: false as const, reason: 'missing window.IWER_DEVICE' };
    }
    if (!platform) {
      return { ok: false as const, reason: 'missing __rq.platform' };
    }
    const input = device.hands.right ?? device.hands.left;
    if (!input) {
      return { ok: false as const, reason: 'no IWER hand' };
    }
    const from = platform.worldPose('p2');
    if (!from) {
      return { ok: false as const, reason: 'missing platform world pose' };
    }
    device.primaryInputMode = 'hand';
    device.controlMode = 'programmatic';
    input.connected = true;
    const seated = { x: 0.22, y: 1.35, z: 0.15 };
    return {
      ok: true as const,
      from,
      seated,
      t0: platform.railT('p2'),
      dx: from.x - seated.x,
      dy: from.y - seated.y,
      dz: from.z - seated.z,
    };
  });

  if (!prepared.ok) {
    throw new Error(`prepare failed: ${JSON.stringify(prepared)}`);
  }

  const rot = lookRotation(prepared.dx, prepared.dy, prepared.dz);
  await page.evaluate(
    ({ seated, rot: q }) => {
      const device = (window as unknown as RqWindow).IWER_DEVICE;
      const input = device?.hands.right ?? device?.hands.left;
      if (!input) return;
      input.poseId = 'default';
      input.updatePinchValue(0);
      input.setPinchValueImmediate?.(0);
      input.position.set(seated.x, seated.y, seated.z);
      input.quaternion.set(q.x, q.y, q.z, q.w);
    },
    { seated: prepared.seated, rot }
  );
  await sleep(600);

  await page.evaluate(() => {
    const device = (window as unknown as RqWindow).IWER_DEVICE;
    const input = device?.hands.right ?? device?.hands.left;
    if (!input) return;
    input.poseId = 'pinch';
    input.setPinchValueImmediate?.(1);
    input.updatePinchValue(1);
  });
  await sleep(700);

  const grabbed = await page.evaluate(
    () => (window as unknown as RqWindow).__rq?.platform?.grabbed('p2') ?? false
  );
  if (!grabbed) {
    const summary = await page.evaluate(() => {
      const rq = (window as unknown as RqWindow).__rq;
      return {
        t: rq?.platform?.railT('p2'),
        aligned: rq?.platform?.aligned('p2'),
        events: rq?.store.events.map((e) => e.type),
      };
    });
    throw new Error(
      `ray+pinch never grabbed the platform: ${JSON.stringify({ prepared, summary })}`
    );
  }

  // MoveAtSource: slide the hand toward the boarding end (rail -axis / -Z).
  for (let i = 0; i < 10; i += 1) {
    await page.evaluate(
      ({ seated, step }) => {
        const device = (window as unknown as RqWindow).IWER_DEVICE;
        const input = device?.hands.right ?? device?.hands.left;
        if (!input) return;
        input.position.set(seated.x, seated.y, seated.z - 0.1 * (step + 1));
      },
      { seated: prepared.seated, step: i }
    );
    await sleep(160);
    const alignedNow = await page.evaluate(
      () => (window as unknown as RqWindow).__rq?.platform?.aligned('p2') ?? false
    );
    if (alignedNow) break;
  }

  await page.evaluate(() => {
    const device = (window as unknown as RqWindow).IWER_DEVICE;
    const input = device?.hands.right ?? device?.hands.left;
    if (!input) return;
    input.updatePinchValue(0);
    input.setPinchValueImmediate?.(0);
    input.poseId = 'default';
  });
  await sleep(400);

  const dragged = await page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    return {
      aligned: rq?.platform?.aligned('p2') ?? false,
      grabbed: rq?.platform?.grabbed('p2') ?? false,
      t: rq?.platform?.railT('p2'),
      events: rq?.store.events.map((e) => e.type) ?? [],
      explorer: rq?.explorer?.state(),
      reason: rq?.explorer?.reason(),
    };
  });

  if (!dragged.aligned && !dragged.events.includes('platformAligned')) {
    throw new Error(
      `platform grabbed but never aligned: ${JSON.stringify(dragged)}`
    );
  }

  console.log('[X-07 e2e] ray+pinch platform', dragged);
  return dragged;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const server = await startVite();
  const browser = await launchBrowser();
  try {
    await captureDesktop(browser, server.url);

    const xrPage = await browser.newPage({ ignoreHTTPSErrors: true });
    await enterXrFixture(xrPage, server.url);
    await xrPage.waitForFunction(
      () =>
        (window as unknown as RqWindow).__rq?.explorer?.reason() ===
        'unalignedPlatform',
      null,
      { timeout: 45_000 }
    );
    await shot(xrPage, 'xr-unaligned.png');
    await pinchDragPlatform(xrPage);
    await shot(xrPage, 'xr-aligned.png');

    await xrPage.waitForFunction(
      () => {
        const rq = (window as unknown as RqWindow).__rq;
        const state = rq?.explorer?.state();
        return (
          rq?.store.events.some((e) => e.type === 'platformAligned') &&
          (state === 'riding' ||
            state === 'teleporting' ||
            state === 'walking' ||
            rq.store.phase === 'won')
        );
      },
      null,
      { timeout: 45_000 }
    );
    await shot(xrPage, 'xr-riding.png');

    await xrPage.waitForFunction(
      () => {
        const rq = (window as unknown as RqWindow).__rq;
        if (!rq) return false;
        if (rq.store.phase === 'won') return true;
        return rq.store.events.some((e) => e.type === 'portalUsed');
      },
      null,
      { timeout: 90_000 }
    );
    const summary = await xrPage.evaluate(() => {
      const rq = (window as unknown as RqWindow).__rq;
      return {
        phase: rq?.store.phase,
        explorer: rq?.explorer?.state(),
        events: rq?.store.events.map((e) => e.type),
      };
    });
    console.log('[X-07 e2e] after ride', summary);
    if (!summary.events?.includes('portalUsed') && summary.phase !== 'won') {
      throw new Error(`portal teleport missing: ${JSON.stringify(summary)}`);
    }
    await shot(xrPage, 'xr-portal.png');
    await xrPage.close();

    console.log(
      '[X-07 e2e] platform ray+pinch aligned; explorer rode; portal used'
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
