/**
 * X-10 room budget table. Non-gating.
 *
 * Always prints scene-graph draw calls / triangles for the full 14-piece
 * kit + explorer against all 5 IWER rooms (environment wireframes off).
 *
 * When a client URL is available (`X05_BASE_URL` or a spawned Vite), also
 * samples `window.__rq.stats()` from the F-05 overlay with the full level
 * built in each room. Overlay failures are reported, never thrown, so this
 * script stays non-gating. CI gates use the unit-test counts, not timings.
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMULATOR_ROOMS, type EmulatorRoom } from '../src/xr/flags.js';
import {
  DRAW_CALL_BUDGET,
  TRIANGLE_BUDGET,
} from '../src/xr/level/draw-calls.js';
import {
  formatRoomTable,
  IWER_ROOM_CAPTURES,
  measureFullLevelScene,
  roomRowsFromLevelScene,
  type RoomPerfRow,
} from '../src/xr/perf/room-metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 5173;

interface RqWindow {
  IWER_DEVICE?: {
    sem?: {
      loadDefaultEnvironment?: (envId: string) => Promise<void> | void;
      meshesVisible: boolean;
      planesVisible: boolean;
      boundingBoxesVisible: boolean;
    };
  };
  __rq?: {
    store?: { phase: string };
    overlay?: { ready: boolean };
    stats?: () => {
      fps: number;
      drawCalls: number;
      triangles: number;
    };
    drawCalls?: number;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startVite(): Promise<{ url: string; stop: () => void }> {
  const fromEnv = process.env.X05_BASE_URL ?? process.env.PERF_ROOMS_BASE_URL;
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

async function sampleOverlayRoom(
  page: Page,
  baseUrl: string,
  room: EmulatorRoom
): Promise<RoomPerfRow> {
  const url = `${baseUrl}/?fixture=synthetic_living_room&xr=1&debug=1&room=${room}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

  const button = page.locator('#enter-button');
  for (let i = 0; i < 60; i += 1) {
    if (await button.isEnabled()) break;
    await sleep(500);
  }
  if (!(await button.isEnabled())) {
    throw new Error(`Enter never enabled for ${room}`);
  }

  await page.evaluate(async (envId) => {
    const device = (window as unknown as RqWindow).IWER_DEVICE;
    const sem = device?.sem;
    if (sem?.loadDefaultEnvironment) {
      await sem.loadDefaultEnvironment(envId);
      sem.meshesVisible = false;
      sem.planesVisible = false;
      sem.boundingBoxesVisible = false;
    }
  }, room);

  await button.click();
  await page.waitForFunction(
    () => (window as unknown as RqWindow).__rq?.store?.phase === 'playing',
    null,
    { timeout: 60_000 }
  );
  await sleep(800);

  const sample = await page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    const stats = rq?.stats?.();
    return {
      drawCalls: stats?.drawCalls ?? rq?.drawCalls ?? 0,
      triangles: stats?.triangles ?? 0,
      fps: stats?.fps ?? 0,
    };
  });

  const frameTimeMs =
    sample.fps > 0 && Number.isFinite(sample.fps) ? 1000 / sample.fps : null;
  const drawCalls = sample.drawCalls;
  const triangles = sample.triangles;
  const capture = IWER_ROOM_CAPTURES.find((row) => row.room === room);
  return {
    room,
    drawCalls,
    triangles,
    hiddenEnvTris: capture?.hiddenGlobalTris ?? 0,
    frameTimeMs,
    source: 'overlay',
    withinBudget: drawCalls < DRAW_CALL_BUDGET && triangles < TRIANGLE_BUDGET,
  };
}

async function sampleAllOverlayRooms(
  baseUrl: string
): Promise<RoomPerfRow[] | null> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    const rows: RoomPerfRow[] = [];
    for (const room of EMULATOR_ROOMS) {
      console.log(`[X-10] overlay sample ${room}...`);
      rows.push(await sampleOverlayRoom(page, baseUrl, room));
    }
    return rows;
  } catch (error) {
    console.warn(
      '[X-10] Overlay sample skipped:',
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    await browser?.close();
  }
}

async function main(): Promise<void> {
  const counts = measureFullLevelScene();
  const sceneRows = roomRowsFromLevelScene(counts);
  console.log(
    '[X-10] Full-level scene-graph counts (environment wireframes off)'
  );
  console.log(
    `  draw calls=${String(counts.drawCalls)}  triangles=${String(counts.triangles)}  budget=<${String(DRAW_CALL_BUDGET)} / <${String(TRIANGLE_BUDGET)}`
  );
  console.log(formatRoomTable(sceneRows));

  if (process.env.PERF_ROOMS_SCENE_ONLY === '1') {
    return;
  }

  let stop = (): void => undefined;
  try {
    const started = await startVite();
    stop = started.stop;
    const overlayRows = await sampleAllOverlayRooms(started.url);
    if (overlayRows) {
      console.log('\n[X-10] F-05 overlay / renderer.info (full level built)');
      console.log(formatRoomTable(overlayRows));
    }
  } catch (error) {
    console.warn(
      '[X-10] Overlay pass not run:',
      error instanceof Error ? error.message : error
    );
  } finally {
    stop();
  }
}

void main();
