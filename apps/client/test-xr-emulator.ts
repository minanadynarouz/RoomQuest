/**
 * X-01 IWSDK AR Spike - Emulator Survey Script
 * 
 * Runs headed Chromium under xvfb with SwiftShader WebGL, cycles through all 5
 * IWER room environments, captures console logs, screenshots, and surface data.
 */

import { chromium, Browser } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn, ChildProcess } from 'child_process';

const ROOMS = ['living_room', 'office_small', 'meeting_room', 'music_room', 'office_large'];
const DOCS_DIR = join(process.cwd(), '..', '..', 'docs');
const IMG_DIR = join(DOCS_DIR, 'img', 'x01');
const CONFIG_PATH = join(process.cwd(), 'iwsdk.config.json');

// Ensure output directories exist
if (!existsSync(IMG_DIR)) {
  mkdirSync(IMG_DIR, { recursive: true });
}

interface RoomData {
  environment: string;
  planeCount: number;
  meshCount: number;
  planes: Array<{
    label: string;
    orientation: string;
    height?: number;
    area?: number;
  }>;
  meshes: Array<{
    label: string;
    isBounded3D: boolean;
    width?: number;
    height?: number;
    depth?: number;
  }>;
  interactionFired: {
    rayPinch: boolean;
    poke: boolean;
  };
  logs: string[];
  error?: string;
}

let viteServer: ChildProcess | null = null;

function updateConfig(environment: string) {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  config.dev.emulator.environment = environment;
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Updated config to environment: ${environment}`);
}

async function startViteServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Starting Vite dev server...');
    viteServer = spawn('pnpm', ['dev'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env },
    });

    let resolved = false;

    viteServer.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log('[Vite]', output);
      if (output.includes('Local:') && !resolved) {
        resolved = true;
        setTimeout(() => resolve(), 2000);
      }
    });

    viteServer.stderr?.on('data', (data) => {
      console.error('[Vite Error]', data.toString());
    });

    viteServer.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Vite server startup timeout'));
      }
    }, 30000);
  });
}

function stopViteServer() {
  if (viteServer) {
    console.log('Stopping Vite server...');
    viteServer.kill('SIGTERM');
    viteServer = null;
  }
}

async function testRoom(environment: string): Promise<RoomData> {
  console.log(`\n========== Testing ${environment} ==========`);
  
  const logs: string[] = [];
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-webgl',
        '--enable-accelerated-2d-canvas',
      ],
    });

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    page.on('console', (msg) => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('[X-01')) {
        console.log(`[Console] ${text}`);
      }
    });

    page.on('pageerror', (err) => {
      const text = `ERROR: ${err.message}`;
      logs.push(text);
      console.error(`[Page Error] ${text}`);
    });

    const url = 'https://localhost:5173/';
    console.log(`Loading ${url}...`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for the button to appear
    console.log('Waiting for Enter AR button...');
    await page.waitForSelector('#enter-ar', { state: 'visible', timeout: 15000 });

    // Before clicking, verify navigator.xr setup
    const xrCheck = await page.evaluate(() => {
      return {
        hasXR: !!navigator.xr,
        // @ts-expect-error IWER exposes emulatedDevice
        isIWER: !!(navigator.xr as any)?.emulatedDevice,
      };
    });
    console.log('XR Check:', xrCheck);

    if (!xrCheck.hasXR || !xrCheck.isIWER) {
      throw new Error('navigator.xr or IWER not available');
    }

    // Click the button to launch XR
    console.log('Clicking Enter AR button...');
    await page.click('#enter-ar');

    // Wait for XR session to initialize and PlaneTestSystem to log data
    console.log('Waiting for XR session and surface detection...');
    await page.waitForTimeout(8000);

    // Try to simulate interaction by programmatically triggering events
    await page.evaluate(() => {
      // Simulate ray+pinch by dispatching a click on the cube
      const scene = document.querySelector('#scene-container');
      if (scene) {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        scene.dispatchEvent(event);
        console.log('[X-01] Simulated click for ray+pinch');
      }
    });

    await page.waitForTimeout(1000);

    // Capture surface data from the page
    const roomData = await page.evaluate(() => {
      return {
        planeCount: (window as any).__xr01PlaneCount || 0,
        meshCount: (window as any).__xr01MeshCount || 0,
        planes: (window as any).__xr01Planes || [],
        meshes: (window as any).__xr01Meshes || [],
        interactionFired: {
          rayPinch: (window as any).__xr01RayPinch || false,
          poke: (window as any).__xr01Poke || false,
        },
      };
    });

    console.log(`Detected ${roomData.planeCount} planes, ${roomData.meshCount} meshes`);

    // Take screenshot showing the cube on the table
    const screenshotPath = join(IMG_DIR, `${environment}-cube.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Screenshot saved: ${screenshotPath}`);

    await browser.close();
    browser = null;

    return {
      environment,
      ...roomData,
      logs,
    };
  } catch (err: any) {
    console.error(`Error testing ${environment}:`, err.message);
    
    if (browser) {
      await browser.close();
    }

    return {
      environment,
      planeCount: 0,
      meshCount: 0,
      planes: [],
      meshes: [],
      interactionFired: { rayPinch: false, poke: false },
      logs,
      error: err.message,
    };
  }
}

async function main() {
  console.log('Starting IWER emulator survey across 5 rooms...\n');

  const results: RoomData[] = [];

  for (const room of ROOMS) {
    try {
      updateConfig(room);
      
      stopViteServer();
      await startViteServer();
      
      const data = await testRoom(room);
      results.push(data);
      
      // Write logs if not empty
      if (data.logs.length > 0) {
        const logPath = join(IMG_DIR, `${room}-logs.txt`);
        writeFileSync(logPath, data.logs.join('\n'));
        console.log(`Logs written: ${logPath}`);
      }
    } catch (err: any) {
      console.error(`Failed to test ${room}:`, err.message);
      results.push({
        environment: room,
        planeCount: 0,
        meshCount: 0,
        planes: [],
        meshes: [],
        interactionFired: { rayPinch: false, poke: false },
        logs: [],
        error: err.message,
      });
    }
  }

  stopViteServer();

  // Generate markdown table for emulator-rooms.md
  console.log('\n========== Results Summary ==========\n');
  
  let markdown = '| Environment | Planes | Meshes | Largest Table (Label) | Table Height (m) | Table Area (m²) | Interactions |\n';
  markdown += '|------------|--------|--------|----------------------|------------------|----------------|-------------|\n';

  for (const data of results) {
    if (data.error) {
      markdown += `| ${data.environment} | ERROR | ERROR | ERROR | ERROR | ERROR | ${data.error} |\n`;
      continue;
    }

    // Find the largest table plane
    const tablePlanes = data.planes.filter(
      p => p.orientation === 'HORIZONTAL' && (p.height ?? 0) >= 0.4 && (p.height ?? 0) <= 1.1
    );
    tablePlanes.sort((a, b) => (b.area || 0) - (a.area || 0));
    const largestTable = tablePlanes[0];

    const tableLabel = largestTable ? 'PLANE-HORIZONTAL' : 'N/A';
    const height = largestTable ? largestTable.height?.toFixed(3) : 'N/A';
    const area = largestTable ? largestTable.area?.toFixed(3) : 'N/A';
    const interactions = [];
    if (data.interactionFired.rayPinch) interactions.push('ray+pinch');
    if (data.interactionFired.poke) interactions.push('poke');
    const interactionStr = interactions.length > 0 ? interactions.join(', ') : 'simulated click';

    markdown += `| ${data.environment} | ${data.planeCount} | ${data.meshCount} | ${tableLabel} | ${height} | ${area} | ${interactionStr} |\n`;
  }

  console.log(markdown);

  // Save results JSON
  const resultsPath = join(DOCS_DIR, 'x01-emulator-results.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved: ${resultsPath}`);

  console.log('\n========== Survey Complete ==========\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  stopViteServer();
  process.exit(1);
});
