/**
 * X-01 Emulator Testing
 * Programmatically runs the IWER emulator and captures surface data
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ROOMS = [
  'living_room',
  'office_small',
  'meeting_room',
  'music_room',
  'office_large',
];

const WAIT_FOR_SURFACES = 5000; // 5s to let surfaces stabilize

test.describe('X-01 Emulator Room Survey', () => {
  for (const room of ROOMS) {
    test(`Survey ${room}`, async ({ page }) => {
      // Listen for console logs
      const logs: string[] = [];
      page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[X-01 Spike]')) {
          logs.push(text);
          console.log(text);
        }
      });

      // Navigate to dev server with specific room
      const url = `https://localhost:8081?room=${room}`;
      await page.goto(url, { waitUntil: 'networkidle' });

      // Wait for surfaces to be detected and logged
      await page.waitForTimeout(WAIT_FOR_SURFACES);

      // Save console logs
      const logPath = path.join(
        __dirname,
        'docs',
        'img',
        'x01',
        `${room}-logs.txt`,
      );
      fs.writeFileSync(logPath, logs.join('\n'));

      // Take screenshot
      const screenshotPath = path.join(
        __dirname,
        'docs',
        'img',
        'x01',
        `${room}.png`,
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      console.log(`✓ ${room} survey complete`);
    });
  }
});
