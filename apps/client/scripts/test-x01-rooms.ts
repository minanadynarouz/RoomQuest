/**
 * Capture the live SurfaceGraph the client builds in each IWER room.
 *
 * Loads `?emulator=1&room=<room>&director=off&debug=1` so the procedural
 * generator runs locally — no `POST /levels`, no Gemini.
 *
 * Writes `packages/fixtures/src/graphs/iwer-<room>.json`.
 *
 *   X05_BASE_URL=https://localhost:5173 pnpm --filter client capture:graphs
 */
import {
  chromium,
  type Browser,
  type Page,
  type Route,
} from '@playwright/test';
import {
  compactGraphForPrompt,
  promptGraphJsonBytes,
} from '@roomquest/level-core';
import { SurfaceGraph, type SurfaceGraph as SurfaceGraphT } from '@roomquest/schema';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { EMULATOR_ROOMS, type EmulatorRoom } from '../src/xr/flags.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CLIENT_ROOT, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'packages/fixtures/src/graphs');
const SHOT_DIR = '/tmp/iwer-graphs';
const DEFAULT_PORT = 5173;

interface RqWindow {
  __rq?: {
    graph?: SurfaceGraphT | null;
    surfaceGraph?: () => SurfaceGraphT | null;
    store?: { phase?: string };
  };
}

export interface RoomCaptureRow {
  room: EmulatorRoom;
  nodes: number;
  edges: number;
  labels: string[];
  fullBytes: number;
  compactBytes: number;
  roomHash: string;
  file: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startVite(): Promise<{ url: string; stop: () => void }> {
  const fromEnv = process.env.X05_BASE_URL ?? process.env.X01_BASE_URL;
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

function readLiveGraph(): SurfaceGraphT | null {
  const w = window as unknown as RqWindow;
  return w.__rq?.surfaceGraph?.() ?? w.__rq?.graph ?? null;
}

async function blockLiveDirector(page: Page, hits: string[]): Promise<void> {
  const block = async (route: Route): Promise<void> => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204 });
      return;
    }
    hits.push(route.request().url());
    await route.abort();
  };
  await page.route('**/api/v1/levels**', block);
  await page.route('**/generativelanguage.googleapis.com/**', block);
}

async function captureRoom(
  page: Page,
  baseUrl: string,
  room: EmulatorRoom,
  levelsHits: string[]
): Promise<RoomCaptureRow> {
  levelsHits.length = 0;
  const url = `${baseUrl}/?emulator=1&room=${room}&director=off&debug=1`;
  console.log(`[X-01] ${room} → ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

  const button = page.locator('#enter-button');
  for (let i = 0; i < 60; i += 1) {
    if (await button.isEnabled()) break;
    await sleep(500);
  }
  if (!(await button.isEnabled())) {
    throw new Error(`Enter never enabled for ${room}`);
  }
  await button.click();

  await page.waitForFunction(
    () => {
      const w = window as unknown as RqWindow;
      if (w.__rq?.store?.phase === 'noSurfaces') return true;
      const graph = w.__rq?.surfaceGraph?.() ?? w.__rq?.graph ?? null;
      return Boolean(graph && graph.nodes.length >= 2);
    },
    null,
    { timeout: 70_000 }
  );

  const phase = await page.evaluate(() => {
    return (window as unknown as RqWindow).__rq?.store?.phase ?? null;
  });
  if (phase === 'noSurfaces') {
    throw new Error(`${room}: SurfaceGraphSystem emitted noSurfaces`);
  }

  const raw = await page.evaluate(readLiveGraph);
  if (!raw) {
    throw new Error(`${room}: __rq.surfaceGraph() returned null`);
  }
  const graph = SurfaceGraph.parse(raw);
  if (levelsHits.length > 0) {
    throw new Error(
      `${room}: live director was called (${levelsHits.join(', ')})`
    );
  }

  const fileName = `iwer-${room}.json`;
  const file = path.join(OUT_DIR, fileName);
  await writeFile(file, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');

  const labels = [...new Set(graph.nodes.map((node) => node.label))].sort();
  const fullBytes = promptGraphJsonBytes(graph);
  const compactBytes = promptGraphJsonBytes(compactGraphForPrompt(graph));
  const row: RoomCaptureRow = {
    room,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    labels,
    fullBytes,
    compactBytes,
    roomHash: graph.roomHash,
    file: fileName,
  };
  console.log('[X-01] captured', row);
  await page.screenshot({
    path: path.join(SHOT_DIR, `${room}.png`),
    type: 'png',
  });
  return row;
}

function formatTable(rows: RoomCaptureRow[]): string {
  const header =
    'room           nodes  edges  labels                         full B  compact B';
  const lines = rows.map((row) => {
    const labels = row.labels.join(',');
    return `${row.room.padEnd(14)} ${String(row.nodes).padStart(5)} ${String(row.edges).padStart(6)}  ${labels.padEnd(28)} ${String(row.fullBytes).padStart(6)} ${String(row.compactBytes).padStart(10)}`;
  });
  return [header, ...lines].join('\n');
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(SHOT_DIR, { recursive: true });
  let stop = (): void => undefined;
  let browser: Browser | null = null;
  try {
    const started = await startVite();
    stop = started.stop;
    browser = await launchBrowser();
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    const levelsHits: string[] = [];
    await blockLiveDirector(page, levelsHits);
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('SurfaceGraphSystem') ||
        text.includes('[X-10]') ||
        text.includes('[Emulator]') ||
        text.includes('[director]')
      ) {
        console.log(`[browser ${msg.type()}] ${text}`);
      }
    });
    const rows: RoomCaptureRow[] = [];
    for (const room of EMULATOR_ROOMS) {
      rows.push(await captureRoom(page, started.url, room, levelsHits));
    }
    console.log('\n[X-01] IWER SurfaceGraph captures');
    console.log(formatTable(rows));
  } finally {
    await browser?.close();
    stop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
