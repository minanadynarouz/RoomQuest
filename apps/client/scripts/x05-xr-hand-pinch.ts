/**
 * Headed Chromium XR E2E for X-05 / X-06 / X-09 against `pnpm dev`
 * (`pnpm --filter client e2e:xr`).
 *
 * 1. Desktop fixture screenshots (blocked / walking / won) via autoSolve
 *    (opens gates through the same lever path as poke/pinch).
 * 2. `?fixture=synthetic_living_room&xr=1` boots a real IWER AR session
 *    from a user click, then drives injected `window.IWER_DEVICE` hands:
 *    XRDevice.hands, XRHandInput.position.set, quaternion.set, poseId,
 *    updatePinchValue.
 *    Left: pinch-place the plank, then near poke the lever.
 *    Right: pinch-place the plank, then far ray+pinch the lever from ~2 m.
 * 3. X-09 village-anchor scenario: persist in session 1, restore (or clean
 *    largest-table fallback) in session 2 with the same origin storage.
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVillageAnchorScenario } from './x09-xr-village-anchor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, '../../../docs/img/x05');
const OUT_DIR_X06 = path.join(__dirname, '../../../docs/img/x06');
const DEFAULT_PORT = 5173;

interface IwerHand {
  position: { set: (x: number, y: number, z: number) => void };
  quaternion: {
    set: (x: number, y: number, z: number, w: number) => void;
    x: number;
    y: number;
    z: number;
    w: number;
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

interface PlacementApi {
  ghostVisible: () => boolean;
  heldHand: () => 'left' | 'right' | null;
  piecePose: (
    id: string
  ) => { x: number; y: number; z: number; yaw: number } | null;
  pieceWorldPose: (id: string) => { x: number; y: number; z: number } | null;
  emulatorHandDriving: boolean;
}

interface RqWindow {
  IWER_DEVICE?: IwerDevice;
  __rq?: {
    store: {
      phase: string;
      events: { type: string; placementId?: string; reason?: string }[];
    };
    snapTargets: { placementId: string; pose: { position: number[] } }[];
    placement: PlacementApi | null;
    explorer?: {
      state: () => string;
      reason: () => string | undefined;
      pose: () => { x: number; y: number; z: number; yaw: number };
    };
    autoSolve?: () => void;
    gateLever?: { pull: (id: string) => boolean };
  };
}

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
  const fromEnv = process.env.X05_BASE_URL;
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
      () => Boolean((window as unknown as RqWindow).__rq?.placement),
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
    const overlay = document.querySelector('vite-error-overlay');
    overlay?.remove();
  });
}

async function shot(
  page: Page,
  name: string,
  dir: string = OUT_DIR
): Promise<void> {
  await dismissViteOverlay(page);
  const canvas = page.locator('#scene-container canvas').first();
  if ((await canvas.count()) > 0) {
    await canvas.screenshot({ path: path.join(dir, name) });
  } else {
    await page.screenshot({ path: path.join(dir, name), type: 'png' });
  }
}

async function captureDesktopScreenshots(
  browser: Browser,
  baseUrl: string
): Promise<void> {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(`${baseUrl}/?fixture=synthetic_living_room`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await waitForRq(page);

  await page.waitForFunction(
    () => {
      const rq = (window as unknown as RqWindow).__rq;
      return rq?.explorer?.state() === 'blocked';
    },
    null,
    { timeout: 45_000 }
  );
  await shot(page, 'blocked-gap.png');
  console.log('[X-05 e2e] screenshot blocked-gap.png');

  const solved = await page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    rq?.autoSolve?.();
    return {
      phase: rq?.store.phase,
      events: rq?.store.events.map((e) => e.type),
    };
  });
  const desktopEvents = solved.events ?? [];
  if (
    !desktopEvents.includes('leverPulled') ||
    !desktopEvents.includes('gateOpened')
  ) {
    throw new Error(
      `autoSolve did not use the lever path: ${JSON.stringify(solved)}`
    );
  }
  console.log('[X-05 e2e] desktop autoSolve', solved);

  await sleep(2500);
  await shot(page, 'walking.png');
  console.log('[X-05 e2e] screenshot walking.png');

  await page.waitForFunction(
    () => (window as unknown as RqWindow).__rq?.store.phase === 'won',
    null,
    { timeout: 60_000 }
  );
  await sleep(400);
  await shot(page, 'won.png');
  console.log('[X-05 e2e] screenshot won.png');
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

  await page.goto(`${baseUrl}/?fixture=synthetic_living_room&xr=1`, {
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
      `Enter button never enabled. IWER may not have injected. logs=${logs.slice(-30).join(' | ')}`
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

async function pinchPlace(
  page: Page,
  hand: 'left' | 'right'
): Promise<Record<string, unknown>> {
  const prepared = await page.evaluate((handedness) => {
    const w = window as unknown as RqWindow;
    const device = w.IWER_DEVICE;
    const rq = w.__rq;
    const placement = rq?.placement;
    if (!device) {
      return { ok: false as const, reason: 'missing window.IWER_DEVICE' };
    }
    if (!placement) {
      return { ok: false as const, reason: 'missing __rq.placement' };
    }
    const input = device.hands[handedness];
    if (!input) {
      return {
        ok: false as const,
        reason: `IWER_DEVICE.hands.${handedness} missing`,
      };
    }
    device.primaryInputMode = 'hand';
    device.controlMode = 'programmatic';
    input.connected = true;
    input.poseId = 'default';
    const from = placement.pieceWorldPose('p2');
    const target = rq.snapTargets.find((t) => t.placementId === 'p2');
    if (!from || !target) {
      return {
        ok: false as const,
        reason: 'missing plank pose or snap target',
      };
    }
    input.updatePinchValue(0);
    input.setPinchValueImmediate?.(0);
    input.position.set(from.x, from.y + 0.04, from.z);
    return {
      ok: true as const,
      from,
      target: {
        x: target.pose.position[0] ?? 0,
        y: target.pose.position[1] ?? 0,
        z: target.pose.position[2] ?? 0,
      },
      apis: {
        hasDevice: true,
        primaryInputMode: device.primaryInputMode,
        hasHand: true,
      },
    };
  }, hand);

  if (!prepared.ok) {
    throw new Error(`${hand} prepare failed: ${JSON.stringify(prepared)}`);
  }

  await sleep(400);

  await page.evaluate((handedness) => {
    const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
      handedness
    ];
    if (!input) return;
    input.poseId = 'pinch';
    input.setPinchValueImmediate?.(1);
    input.updatePinchValue(1);
  }, hand);
  await sleep(500);

  const ghost = await page.evaluate(
    ({ handedness, target }) => {
      const w = window as unknown as RqWindow;
      const input = w.IWER_DEVICE?.hands[handedness];
      if (!input) {
        return { ok: false as const, reason: 'hand disappeared' };
      }
      input.position.set(target.x, target.y + 0.03, target.z);
      const placement = w.__rq?.placement;
      return {
        ok: true as const,
        ghost: placement?.ghostVisible() ?? false,
        held: placement?.heldHand() ?? null,
      };
    },
    { handedness: hand, target: prepared.target }
  );
  await sleep(400);

  const ghostNow = await page.evaluate(() => {
    const placement = (window as unknown as RqWindow).__rq?.placement;
    return {
      ghost: placement?.ghostVisible() ?? false,
      held: placement?.heldHand() ?? null,
    };
  });

  if (!ghostNow.ghost && !ghost.ghost) {
    throw new Error(
      `${hand} never saw snap ghost after IWER pinch-move. ${JSON.stringify({ ghost, ghostNow, prepared })}`
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
  await sleep(500);

  const result = await page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    if (!rq?.placement) {
      return { ok: false as const, reason: 'no placement api' };
    }
    const pose = rq.placement.piecePose('p2');
    const world = rq.placement.pieceWorldPose('p2');
    const target = rq.snapTargets.find((t) => t.placementId === 'p2');
    const events = rq.store.events.filter((e) => e.type === 'pieceBuilt');
    const tx = target?.pose.position[0] ?? 99;
    const ty = target?.pose.position[1] ?? 99;
    const tz = target?.pose.position[2] ?? 99;
    const dx = world ? Math.abs(world.x - tx) : 99;
    const dy = world ? Math.abs(world.y - ty) : 99;
    const dz = world ? Math.abs(world.z - tz) : 99;
    const dist = Math.hypot(dx, dy, dz);
    return {
      ok: events.some((e) => e.placementId === 'p2') && dist < 0.01,
      dist,
      dx,
      dy,
      dz,
      pose,
      world,
      events,
    };
  });

  if (!result.ok) {
    throw new Error(
      `${hand} pieceBuilt/pose failed: ${JSON.stringify(result)}`
    );
  }

  console.log(`[X-05 e2e] ${hand}-hand pinch-place`, result);
  return result;
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
  let rx = fy * 1 - fz * 0;
  let ry = fz * 0 - fx * 1;
  let rz = fx * 0 - fy * 0;
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
  const m00 = rx,
    m01 = ux,
    m02 = -fx;
  const m10 = ry,
    m11 = uy,
    m12 = -fy;
  const m20 = rz,
    m21 = uz,
    m22 = -fz;
  const trace = m00 + m11 + m22;
  let qw: number, qx: number, qy: number, qz: number;
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

async function pokeLever(
  page: Page,
  hand: 'left' | 'right'
): Promise<Record<string, unknown>> {
  await connectHand(page, hand);
  const lever = await page.evaluate(() => {
    return (window as unknown as RqWindow).__rq?.placement?.pieceWorldPose(
      'p4'
    );
  });
  if (!lever) {
    throw new Error('missing lever p4 world pose');
  }

  const offsets = [-0.08, 0, 0.08];
  for (const ox of offsets) {
    for (const oy of offsets) {
      for (const oz of offsets) {
        await page.evaluate(
          ({ handedness, x, y, z }) => {
            const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
              handedness
            ];
            if (!input) return;
            input.poseId = 'point';
            input.updatePinchValue(0);
            input.setPinchValueImmediate?.(0);
            input.quaternion.set(0, 0, 0, 1);
            input.position.set(x, y, z);
          },
          {
            handedness: hand,
            x: lever.x + ox,
            y: lever.y + 0.06 + oy,
            z: lever.z + oz,
          }
        );
        await sleep(90);
        const hit = await page.evaluate(() => {
          const events =
            (window as unknown as RqWindow).__rq?.store.events ?? [];
          return events.some(
            (e) => e.type === 'leverPulled' && e.placementId === 'p4'
          );
        });
        if (hit) {
          const summary = await leverGateSummary(page);
          console.log(`[X-06 e2e] ${hand} near poke`, summary);
          return summary;
        }
      }
    }
  }

  throw new Error(
    `${hand} poke never emitted leverPulled. ${JSON.stringify({
      lever,
      ...(await leverGateSummary(page)),
    })}`
  );
}

async function rayPinchLever(
  page: Page,
  hand: 'left' | 'right'
): Promise<Record<string, unknown>> {
  await connectHand(page, hand);
  const prepared = await page.evaluate((handedness) => {
    const w = window as unknown as RqWindow;
    const input = w.IWER_DEVICE?.hands[handedness];
    const lever = w.__rq?.placement?.pieceWorldPose('p4');
    if (!input || !lever) {
      return { ok: false as const, reason: 'missing hand or lever' };
    }
    const seated = {
      x: handedness === 'left' ? -0.22 : 0.22,
      y: 1.35,
      z: 0.05,
    };
    const dx = lever.x - seated.x;
    const dy = lever.y - seated.y;
    const dz = lever.z - seated.z;
    const dist = Math.hypot(dx, dy, dz);
    return { ok: true as const, seated, lever, dist, dx, dy, dz };
  }, hand);

  if (!prepared.ok) {
    throw new Error(`${hand} far prepare failed: ${JSON.stringify(prepared)}`);
  }
  if (prepared.dist < 1.8) {
    throw new Error(
      `${hand} far lever is only ${prepared.dist.toFixed(2)} m; need ~2 m seated`
    );
  }

  const rot = lookRotation(prepared.dx, prepared.dy, prepared.dz);
  await page.evaluate(
    ({ handedness, seated, rot: q }) => {
      const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
        handedness
      ];
      if (!input) return;
      input.poseId = 'default';
      input.updatePinchValue(0);
      input.setPinchValueImmediate?.(0);
      input.position.set(seated.x, seated.y, seated.z);
      input.quaternion.set(q.x, q.y, q.z, q.w);
    },
    { handedness: hand, seated: prepared.seated, rot }
  );
  await sleep(500);

  await page.evaluate((handedness) => {
    const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
      handedness
    ];
    if (!input) return;
    input.poseId = 'pinch';
    input.setPinchValueImmediate?.(1);
    input.updatePinchValue(1);
  }, hand);
  await sleep(700);

  await page.evaluate((handedness) => {
    const input = (window as unknown as RqWindow).IWER_DEVICE?.hands[
      handedness
    ];
    if (!input) return;
    input.updatePinchValue(0);
    input.setPinchValueImmediate?.(0);
    input.poseId = 'default';
  }, hand);
  await sleep(300);

  const summary = await leverGateSummary(page);
  if (!summary.leverPulled || !summary.gateOpened) {
    throw new Error(
      `${hand} far ray+pinch failed: ${JSON.stringify({ prepared, summary })}`
    );
  }
  console.log(`[X-06 e2e] ${hand} far ray+pinch`, {
    dist: prepared.dist,
    summary,
  });
  return { ...summary, dist: prepared.dist };
}

async function leverGateSummary(page: Page): Promise<{
  leverPulled: boolean;
  gateOpened: boolean;
  explorer: string | undefined;
  reason: string | undefined;
  events: string[];
  phase: string | undefined;
}> {
  return page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    const events = rq?.store.events ?? [];
    return {
      leverPulled: events.some(
        (e) => e.type === 'leverPulled' && e.placementId === 'p4'
      ),
      gateOpened: events.some(
        (e) => e.type === 'gateOpened' && e.placementId === 'p3'
      ),
      explorer: rq?.explorer?.state(),
      reason: rq?.explorer?.reason(),
      events: events.map((e) => e.type),
      phase: rq?.store.phase,
    };
  });
}

async function waitForExplorerPastGate(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const rq = (window as unknown as RqWindow).__rq;
      if (!rq) return false;
      const opened = rq.store.events.some(
        (e) => e.type === 'gateOpened' && e.placementId === 'p3'
      );
      if (!opened) return false;
      if (rq.store.phase === 'won') return true;
      const state = rq.explorer?.state();
      const reason = rq.explorer?.reason();
      const pose = rq.explorer?.pose();
      if (state === 'celebrating') return true;
      if (reason === 'closedGate') return false;
      return Boolean(pose && pose.z < -2.45 && state === 'walking');
    },
    null,
    { timeout: 90_000 }
  );
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(OUT_DIR_X06, { recursive: true });
  const server = await startVite();
  const browser = await launchBrowser();
  try {
    await captureDesktopScreenshots(browser, server.url);

    const leftPage = await browser.newPage({ ignoreHTTPSErrors: true });
    await enterXrFixture(leftPage, server.url);
    await leftPage.waitForFunction(
      () =>
        (window as unknown as RqWindow).__rq?.explorer?.state() === 'blocked',
      null,
      { timeout: 45_000 }
    );
    await shot(leftPage, 'blocked-gap.png');
    await shot(leftPage, 'xr-blocked-gap.png');
    const left = await pinchPlace(leftPage, 'left');
    console.log('[X-05 e2e] LEFT', left);
    const leftPoke = await pokeLever(leftPage, 'left');
    console.log('[X-06 e2e] LEFT poke', leftPoke);
    await shot(leftPage, 'near-poke.png', OUT_DIR_X06);
    await waitForExplorerPastGate(leftPage);
    await shot(leftPage, 'gate-open-near.png', OUT_DIR_X06);
    await leftPage.close();

    const rightPage = await browser.newPage({ ignoreHTTPSErrors: true });
    await enterXrFixture(rightPage, server.url);
    const right = await pinchPlace(rightPage, 'right');
    console.log('[X-05 e2e] RIGHT', right);
    const rightFar = await rayPinchLever(rightPage, 'right');
    console.log('[X-06 e2e] RIGHT far', rightFar);
    await shot(rightPage, 'far-ray-pinch.png', OUT_DIR_X06);
    await sleep(2200);
    await shot(rightPage, 'walking.png');
    await shot(rightPage, 'xr-walking.png');
    await waitForExplorerPastGate(rightPage);
    await rightPage.waitForFunction(
      () => (window as unknown as RqWindow).__rq?.store.phase === 'won',
      null,
      { timeout: 90_000 }
    );
    const summary = await rightPage.evaluate(() => {
      const rq = (window as unknown as RqWindow).__rq;
      return {
        phase: rq?.store.phase,
        explorer: rq?.explorer?.state(),
        events: rq?.store.events.map((e) => e.type),
      };
    });
    const wonEvents = summary.events ?? [];
    if (
      !wonEvents.includes('leverPulled') ||
      !wonEvents.includes('gateOpened')
    ) {
      throw new Error(`won without lever path: ${JSON.stringify(summary)}`);
    }
    console.log('[X-06 e2e] far lever won', summary);
    await sleep(400);
    await shot(rightPage, 'xr-won.png');
    await shot(rightPage, 'won.png');
    await shot(rightPage, 'gate-open-far.png', OUT_DIR_X06);
    await rightPage.close();

    console.log('[X-05 e2e] IWER APIs used:', IWER_APIS_USED.join(', '));
    console.log(
      '[X-06 e2e] near poke and far ray+pinch opened the gate; explorer passed'
    );

    await runVillageAnchorScenario({ browser, baseUrl: server.url });
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
