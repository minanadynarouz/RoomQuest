/**
 * Headed Chromium XR E2E for the room-reading sweep.
 *
 * Desktop `?fixture=synthetic_living_room&debug=1` (no live /levels).
 * Forces a mocked ~3 s in-flight director state, asserts the highlight
 * is visible then hidden, and saves a screenshot artifact.
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, '../../../docs/img/room-reading');
const DEFAULT_PORT = 5173;
const MOCK_IN_FLIGHT_MS = 3000;

interface RqWindow {
  __rq?: {
    store?: { phase?: string };
    graph?: { nodes?: { id: string }[] } | null;
    roomReading?: {
      visible: () => boolean;
      phase: () => string;
      surfaceId: () => string | null;
      intensity: () => number;
      mockInFlight: (durationMs?: number) => void;
    };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startVite(): Promise<{ url: string; stop: () => void }> {
  const fromEnv = process.env.X05_BASE_URL ?? process.env.X11_BASE_URL;
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
    const overlay = document.querySelector('vite-error-overlay');
    overlay?.remove();
  });
}

async function waitForRq(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const rq = (window as unknown as RqWindow).__rq;
      return Boolean(rq?.roomReading && rq.graph?.nodes && rq.graph.nodes.length >= 2);
    },
    null,
    { timeout: 45_000 }
  );
}

async function readingSnapshot(page: Page): Promise<{
  visible: boolean;
  phase: string | null;
  surfaceId: string | null;
  intensity: number;
}> {
  return page.evaluate(() => {
    const reading = (window as unknown as RqWindow).__rq?.roomReading;
    return {
      visible: reading?.visible() ?? false,
      phase: reading?.phase() ?? null,
      surfaceId: reading?.surfaceId() ?? null,
      intensity: reading?.intensity() ?? 0,
    };
  });
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const server = await startVite();
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.goto(
      `${server.url}/?fixture=synthetic_living_room&debug=1&director=mock`,
      { waitUntil: 'networkidle', timeout: 60_000 }
    );
    await waitForRq(page);

    const before = await readingSnapshot(page);
    if (before.visible) {
      throw new Error(
        `sweep already visible before mock in-flight: ${JSON.stringify(before)}`
      );
    }

    const started = await page.evaluate((durationMs) => {
      const reading = (window as unknown as RqWindow).__rq?.roomReading;
      if (!reading) return false;
      reading.mockInFlight(durationMs);
      return true;
    }, MOCK_IN_FLIGHT_MS);
    if (!started) {
      throw new Error('roomReading.mockInFlight missing');
    }

    await page.waitForFunction(
      () => {
        const reading = (window as unknown as RqWindow).__rq?.roomReading;
        return reading?.visible() === true && reading.surfaceId() === 's5';
      },
      null,
      { timeout: 5_000 }
    );
    const during = await readingSnapshot(page);
    if (!during.visible || during.surfaceId !== 's5') {
      throw new Error(`sweep not visible in-flight: ${JSON.stringify(during)}`);
    }
    console.log('[room-reading e2e] visible', during);

    await dismissViteOverlay(page);
    const canvas = page.locator('#scene-container canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 15_000 });
    await canvas.screenshot({ path: path.join(OUT_DIR, 'sweep.png') });
    console.log('[room-reading e2e] screenshot sweep.png');

    await page.waitForFunction(
      () => (window as unknown as RqWindow).__rq?.roomReading?.visible() === false,
      null,
      { timeout: 8_000 }
    );
    const after = await readingSnapshot(page);
    if (after.visible) {
      throw new Error(`sweep still visible: ${JSON.stringify(after)}`);
    }
    console.log('[room-reading e2e] hidden', after);
    await page.close();
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
