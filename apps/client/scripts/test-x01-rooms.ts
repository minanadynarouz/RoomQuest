/**
 * X-01: Systematic emulator room testing
 * Tests all 5 rooms, captures surface data, takes screenshots
 */

import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOMS = [
  'living_room',
  'office_small',
  'meeting_room',
  'music_room',
  'office_large',
];

const CONFIG_PATH = path.join(__dirname, '..', 'iwsdk.config.json');
const IMG_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'img', 'x01');
const DEV_URL = 'https://localhost:5173/';
const WAIT_FOR_XR = 2000; // Wait for auto-launch to trigger
const WAIT_FOR_SURFACES = 10000; // Wait for surfaces to stabilize and cube to spawn

interface RoomData {
  room: string;
  planeCount: number;
  meshCount: number;
  labels: Record<string, number>;
  largestTable?: {
    label: string;
    area: string;
    topHeight: string;
  };
  cubePosition?: string;
  logs: string[];
}

async function updateRoomConfig(room: string) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  config.dev.emulator.environment = room;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`✓ Config updated to ${room}`);
}

async function testRoom(
  page: Page,
  room: string,
): Promise<RoomData> {
  console.log(`\n=== Testing ${room} ===`);

  const logs: string[] = [];
  const data: RoomData = {
    room,
    planeCount: 0,
    meshCount: 0,
    labels: {},
    logs: [],
  };

  // Capture console logs
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[X-01 Spike]')) {
      logs.push(text);
      console.log(`  ${text}`);
    }
  });

  // Navigate to dev server
  console.log(`  Loading ${DEV_URL}...`);
  await page.goto(DEV_URL, { waitUntil: 'load', timeout: 30000 });

  // Wait for auto-launch
  console.log(`  Waiting for auto-launch and surfaces...`);
  await page.waitForTimeout(WAIT_FOR_XR + WAIT_FOR_SURFACES);

  // Take screenshot
  const screenshotPath = path.join(IMG_DIR, `${room}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  Screenshot saved: ${screenshotPath}`);

  // Parse logs for data
  data.logs = logs;

  for (const log of logs) {
    if (log.includes('XRPlane entities:')) {
      const match = log.match(/XRPlane entities: (\d+)/);
      if (match) data.planeCount = parseInt(match[1]);
    }
    if (log.includes('XRMesh entities:')) {
      const match = log.match(/XRMesh entities: (\d+)/);
      if (match) data.meshCount = parseInt(match[1]);
    }
    if (log.includes(':') && /^\w+: \d+$/.test(log.split('[X-01 Spike]')[1]?.trim() || '')) {
      const parts = log.split('[X-01 Spike]')[1].trim().split(':');
      if (parts.length === 2) {
        const label = parts[0].trim();
        const count = parseInt(parts[1].trim());
        if (!isNaN(count)) {
          data.labels[label] = count;
        }
      }
    }
    if (log.includes('Largest table found:')) {
      // Next few logs should have label, area, topHeight
      const idx = logs.indexOf(log);
      const nextLogs = logs.slice(idx, idx + 5).join('\n');
      const labelMatch = nextLogs.match(/label['":\s]+['"]?(\w+)/);
      const areaMatch = nextLogs.match(/area['":\s]+([\d.]+)/);
      const heightMatch = nextLogs.match(/topHeight['":\s]+([\d.]+)/);
      if (labelMatch && areaMatch && heightMatch) {
        data.largestTable = {
          label: labelMatch[1],
          area: areaMatch[1],
          topHeight: heightMatch[1],
        };
      }
    }
    if (log.includes('Creating test cube at:')) {
      const match = log.match(/\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/);
      if (match) {
        data.cubePosition = `[${match[1]}, ${match[2]}, ${match[3]}]`;
      }
    }
  }

  // Save logs
  const logPath = path.join(IMG_DIR, `${room}-logs.txt`);
  fs.writeFileSync(logPath, logs.join('\n'));
  console.log(`  Logs saved: ${logPath}`);

  console.log(`  Planes: ${data.planeCount}, Meshes: ${data.meshCount}`);
  console.log(`  Labels:`, data.labels);

  return data;
}

async function main() {
  console.log('X-01 Emulator Room Survey');
  console.log('=========================\n');

  // Ensure image directory exists
  if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox'],
  });

  const allResults: RoomData[] = [];

  try {
    for (const room of ROOMS) {
      // Update config
      updateRoomConfig(room);

      // Wait a moment for config to be picked up
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Create new page for each room
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      try {
        const data = await testRoom(page, room);
        allResults.push(data);
      } catch (error) {
        console.error(`  Error testing ${room}:`, error);
        allResults.push({
          room,
          planeCount: 0,
          meshCount: 0,
          labels: {},
          logs: [`Error: ${error}`],
        });
      } finally {
        await page.close();
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Generate summary
  console.log('\n\n=== Summary ===\n');
  const summary = allResults
    .map((data) => {
      const labels = Object.entries(data.labels)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      return `${data.room}:
  XRPlane: ${data.planeCount}, XRMesh: ${data.meshCount}
  Labels: ${labels || 'none'}
  Largest table: ${data.largestTable?.label || 'N/A'} (${data.largestTable?.area || 'N/A'} m², height ${data.largestTable?.topHeight || 'N/A'} m)
  Cube at: ${data.cubePosition || 'N/A'}`;
    })
    .join('\n\n');

  console.log(summary);

  // Save summary
  const summaryPath = path.join(IMG_DIR, 'summary.txt');
  fs.writeFileSync(summaryPath, summary);
  console.log(`\nSummary saved to ${summaryPath}`);
}

main().catch(console.error);
