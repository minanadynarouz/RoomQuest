/**
 * Headed Chromium XR E2E for X-09 against `pnpm dev`.
 *
 * `?fixture=synthetic_living_room&xr=1` boots a real IWER AR session from a
 * user click. Session 1 creates/persists a village hut XRAnchor. Session 2
 * (same origin storage) restores if IWER persistent anchors work; otherwise
 * the clean largest-table fallback is asserted.
 */
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, '../../../docs/img/x09');
const DEFAULT_PORT = 5173;
const STORAGE_KEY = 'roomquest:villageAnchor';

interface VillageAnchorStatus {
  ready: boolean;
  placement: 'idle' | 'restored' | 'fallback';
  reason: string | null;
  persisted: boolean;
  handle: string | null;
  surfaceId: string | null;
  persistentAnchorsSupported: boolean;
  storageAvailable: boolean;
  attached: boolean;
  hutPose: { x: number; y: number; z: number } | null;
}

interface RqWindow {
  IWER_DEVICE?: unknown;
  __rq?: {
    store: { phase: string };
    villageAnchor?: { status: () => VillageAnchorStatus };
    plan?: { placements: { piece: string; surface: string }[] } | null;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startVite(): Promise<{ url: string; stop: () => void }> {
  const fromEnv = process.env.X09_BASE_URL;
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

async function dismissViteOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.querySelector('vite-error-overlay')?.remove();
    document.querySelector('vite-plugin-checker-error-overlay')?.remove();
  });
}

async function shot(page: Page, name: string): Promise<void> {
  await dismissViteOverlay(page);
  await page.screenshot({ path: path.join(OUT_DIR, name), type: 'png' });
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
  await dismissViteOverlay(page);

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
  await dismissViteOverlay(page);
  await button.click({ force: true });

  await page.waitForFunction(
    () => Boolean((window as unknown as RqWindow).__rq?.villageAnchor),
    null,
    { timeout: 60_000 }
  );
}

async function waitForVillageReady(page: Page): Promise<VillageAnchorStatus> {
  await page.waitForFunction(
    () => {
      const status = (window as unknown as RqWindow).__rq?.villageAnchor?.status();
      return Boolean(status?.ready && status.placement !== 'idle');
    },
    null,
    { timeout: 45_000 }
  );
  const status = await page.evaluate(() => {
    return (window as unknown as RqWindow).__rq?.villageAnchor?.status() ?? null;
  });
  if (!status) {
    throw new Error('villageAnchor status missing after ready');
  }
  return status;
}

function poseClose(
  a: VillageAnchorStatus['hutPose'],
  b: VillageAnchorStatus['hutPose'],
  epsilon = 0.05
): boolean {
  if (!a || !b) return false;
  return (
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < epsilon
  );
}

function assertFallback(status: VillageAnchorStatus, label: string): void {
  if (status.placement !== 'fallback') {
    throw new Error(`${label}: expected fallback, got ${JSON.stringify(status)}`);
  }
  if (status.surfaceId !== 's1') {
    throw new Error(
      `${label}: expected largest table s1, got ${status.surfaceId ?? 'null'}`
    );
  }
  if (!status.hutPose) {
    throw new Error(`${label}: hut pose missing`);
  }
}

async function readStoredHandle(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, STORAGE_KEY);
}

async function probeIwerRestore(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(navigator.xr));
}

async function runSession(
  context: BrowserContext,
  baseUrl: string,
  screenshot: string
): Promise<{ status: VillageAnchorStatus; handle: string | null; iwer: boolean }> {
  const page = await context.newPage();
  await enterXrFixture(page, baseUrl);
  const status = await waitForVillageReady(page);
  await sleep(800);
  await dismissViteOverlay(page);
  await shot(page, screenshot);
  const handle = await readStoredHandle(page);
  const iwer = await probeIwerRestore(page);
  const hasDevice = await page.evaluate(() =>
    Boolean((window as unknown as RqWindow).IWER_DEVICE)
  );
  console.log('[X-09 e2e] session', {
    screenshot,
    status,
    handle,
    iwer,
    hasDevice,
  });
  await page.close();
  return { status, handle, iwer };
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const server = await startVite();
  const browser = await launchBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  let restoreWorked = false;
  try {
    const first = await runSession(context, server.url, 'session-1.png');
    if (first.status.placement === 'restored') {
      throw new Error(
        `session 1 should not restore without a prior handle: ${JSON.stringify(first.status)}`
      );
    }
    assertFallback(first.status, 'session 1');

    const second = await runSession(context, server.url, 'session-2.png');
    const canRestore =
      first.status.persistentAnchorsSupported &&
      Boolean(first.handle) &&
      first.status.persisted;

    if (canRestore && second.status.placement === 'restored') {
      restoreWorked = true;
      if (second.handle !== first.handle) {
        throw new Error(
          `restored handle mismatch: ${second.handle ?? 'null'} vs ${first.handle ?? 'null'}`
        );
      }
      if (!poseClose(first.status.hutPose, second.status.hutPose)) {
        throw new Error(
          `restored pose drifted: ${JSON.stringify({ first: first.status.hutPose, second: second.status.hutPose })}`
        );
      }
      console.log('[X-09 e2e] RESTORE verified across sessions');
    } else {
      assertFallback(second.status, 'session 2 fallback');
      if (!second.status.reason) {
        throw new Error('fallback path must report a reason');
      }
      console.log(
        '[X-09 e2e] FALLBACK verified (IWER persistent restore not available this run)',
        {
          canRestore,
          session2: second.status,
        }
      );
    }

    console.log('[X-09 e2e] wrote', OUT_DIR);
    console.log(
      restoreWorked
        ? '[X-09 e2e] emulator restore worked'
        : '[X-09 e2e] only the clean fallback path was verified'
    );
  } finally {
    await context.close();
    await browser.close();
    server.stop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
