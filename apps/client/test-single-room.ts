/**
 * Single room test to validate xvfb + headed Chromium setup
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DOCS_DIR = join(process.cwd(), '..', '..', 'docs');
const IMG_DIR = join(DOCS_DIR, 'img', 'x01');

if (!existsSync(IMG_DIR)) {
  mkdirSync(IMG_DIR, { recursive: true });
}

async function main() {
  console.log('Testing single room with headed Chromium under xvfb...\n');
  
  const browser = await chromium.launch({
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
  const logs: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(text);
    console.log(`[Console] ${text}`);
  });

  page.on('pageerror', (err) => {
    const text = `ERROR: ${err.message}`;
    logs.push(text);
    console.error(`[Page Error] ${text}`);
  });

  const url = 'https://localhost:5173/';
  console.log(`Loading ${url}...`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err: any) {
    console.log(`Page loaded (cert warning ignored): ${err.message}`);
  }

  // Wait a bit for modules to load
  console.log('Waiting for modules to load...');
  await page.waitForTimeout(5000);

  // Check what's in the page
  const pageState = await page.evaluate(() => {
    const errorOverlay = document.querySelector('vite-error-overlay');
    let errorText = '';
    if (errorOverlay && errorOverlay.shadowRoot) {
      const errorMsg = errorOverlay.shadowRoot.querySelector('.message-body');
      errorText = errorMsg?.textContent || '';
    }
    return {
      hasButton: !!document.getElementById('enter-ar'),
      buttonVisible: document.getElementById('enter-ar')?.style.display !== 'none',
      hasNavigatorXR: !!navigator.xr,
      hasError: !!errorOverlay,
      errorText: errorText.substring(0, 500),
    };
  });
  console.log('Page state:', JSON.stringify(pageState, null, 2));

  // Wait for the button to appear
  console.log('Waiting for Enter AR button...');
  await page.waitForSelector('#enter-ar', { state: 'visible', timeout: 15000 });

  // Before clicking, verify navigator.xr setup
  const xrCheck = await page.evaluate(() => {
    return {
      hasXR: !!navigator.xr,
      // @ts-expect-error IWER exposes emulatedDevice
      hasEmulatedDevice: !!(navigator.xr as any)?.emulatedDevice,
      // @ts-expect-error Check for session support
      hasIsSessionSupported: !!navigator.xr?.isSessionSupported,
    };
  });
  console.log('XR Check:', xrCheck);

  if (!xrCheck.hasXR) {
    throw new Error('navigator.xr not available');
  }

  // Test session support
  const sessionSupport = await page.evaluate(async () => {
    try {
      const supported = await navigator.xr!.isSessionSupported('immersive-ar');
      return { supported, error: null };
    } catch (err: any) {
      return { supported: false, error: err.message };
    }
  });
  console.log('Session support:', sessionSupport);

  // Click the button to launch XR
  console.log('Clicking Enter AR button...');
  await page.click('#enter-ar');

  // Wait for XR session to initialize and PlaneTestSystem to log data
  console.log('Waiting for XR session and surface detection (20 seconds)...');
  await page.waitForTimeout(20000);

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

  console.log('\n========== Results ==========');
  console.log(`Planes: ${roomData.planeCount}`);
  console.log(`Meshes: ${roomData.meshCount}`);
  console.log(`Interactions: ray+pinch=${roomData.interactionFired.rayPinch}, poke=${roomData.interactionFired.poke}`);
  console.log('=============================\n');

  // Take screenshot
  const screenshotPath = join(IMG_DIR, 'test-screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot saved: ${screenshotPath}`);

  // Save logs
  const logPath = join(IMG_DIR, 'test-logs.txt');
  writeFileSync(logPath, logs.join('\n'));
  console.log(`Logs saved: ${logPath}`);

  // Save data
  const dataPath = join(IMG_DIR, 'test-data.json');
  writeFileSync(dataPath, JSON.stringify(roomData, null, 2));
  console.log(`Data saved: ${dataPath}`);

  await browser.close();
  
  console.log('\nTest complete!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
