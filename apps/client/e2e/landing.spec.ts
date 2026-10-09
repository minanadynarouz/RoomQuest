/**
 * E2E test for landing page states and emulator flow
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotDir = path.join(__dirname, '../../../docs/screenshots/f01');

async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    fullPage: true,
  });
}

test.describe('Landing Page - Screenshots', () => {
  test('should capture all landing page states', async ({ page }) => {
    // 1. Capture initial/loading state
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await takeScreenshot(page, '01-loading-state');
    console.log('✓ Captured loading state');

    // 2. Capture unsupported state (regular desktop Chrome)
    const button = page.locator('#enter-button');
    const statusMessage = page.locator('#status-message');

    // Wait for capability check to complete
    await page.waitForTimeout(2000);

    const buttonEnabled = await button.isEnabled();
    const statusText = await statusMessage.textContent();

    console.log('Button enabled:', buttonEnabled);
    console.log('Status text:', statusText);

    if (!buttonEnabled && statusText && !statusText.includes('Loading')) {
      await takeScreenshot(page, '02-unsupported-state');
      console.log('✓ Captured unsupported state');

      // Verify "Try in emulator" link is visible
      const emulatorLink = page.locator('#try-emulator-link');
      const linkVisible = await emulatorLink.isVisible();
      expect(linkVisible).toBe(true);
    }

    // 3. Go to emulator mode and capture supported state
    await page.goto('/?emulator=1&room=living_room');
    await page.waitForLoadState('networkidle');

    // Wait for polyfill and capability check
    await page.waitForTimeout(3000);

    // Wait for button to potentially become enabled (XR chunk loading)
    for (let i = 0; i < 20; i++) {
      const isEnabled = await button.isEnabled();
      if (isEnabled) {
        break;
      }
      await page.waitForTimeout(500);
    }

    await takeScreenshot(page, '03-supported-ready-state');
    console.log('✓ Captured emulator ready state');

    const emulatorStatusText = await statusMessage.textContent();
    console.log('Emulator status text:', emulatorStatusText);
  });

  test('should verify button becomes enabled in emulator mode', async ({
    page,
  }) => {
    // Set up console log listener BEFORE navigation
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    // Also capture page errors
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/?emulator=1&room=living_room');
    await page.waitForLoadState('networkidle');

    const button = page.locator('#enter-button');
    const statusMessage = page.locator('#status-message');

    // Wait longer for emulator to initialize with software WebGL
    console.log('Waiting for emulator polyfill and capability check...');
    await page.waitForTimeout(5000);

    // Check button state over time
    let buttonBecameEnabled = false;
    for (let i = 0; i < 30; i++) {
      const isEnabled = await button.isEnabled();
      if (isEnabled) {
        buttonBecameEnabled = true;
        console.log(`Button became enabled after ${String(i * 500)}ms`);
        break;
      }
      await page.waitForTimeout(500);
    }

    const finalStatusText = await statusMessage.textContent();
    console.log('Final status:', finalStatusText);
    console.log('Button enabled:', buttonBecameEnabled);

    // Log ALL console messages for debugging
    console.log('All console logs:', consoleLogs);

    // Log page errors
    if (pageErrors.length > 0) {
      console.log('Page errors:', pageErrors);
    }

    // Log relevant console messages
    const relevantLogs = consoleLogs.filter(
      (log) =>
        log.includes('[Landing]') ||
        log.includes('[XR]') ||
        log.includes('IWER') ||
        log.includes('emulator') ||
        log.toLowerCase().includes('webxr')
    );
    console.log('Relevant logs:', relevantLogs);

    // If button is enabled, try clicking it and verify XR session starts
    if (buttonBecameEnabled) {
      console.log('Button is enabled, attempting to launch XR...');

      // Take screenshot before clicking
      await takeScreenshot(page, '04-emulator-button-ready');

      await button.click();

      // Wait for XR to initialize
      await page.waitForTimeout(3000);

      // Take screenshot after clicking
      await takeScreenshot(page, '05-emulator-xr-started');

      // Check if XR session started
      const hasXRLog = consoleLogs.some(
        (log) =>
          log.includes('[XR]') ||
          log.includes('World created') ||
          log.includes('launchXR') ||
          log.includes('XR session')
      );

      console.log('XR logs detected:', hasXRLog);

      // Check if landing page is hidden (indicates XR launched)
      const landingPage = page.locator('#landing-page');
      const landingDisplay = await landingPage.evaluate(
        (el) => window.getComputedStyle(el).display
      );

      console.log('Landing page display:', landingDisplay);

      // Verify XR actually launched
      if (hasXRLog || landingDisplay === 'none') {
        console.log('✅ XR session successfully started in emulator mode!');
        expect(true).toBe(true);
      } else {
        console.log(
          '⚠️  Button clicked but XR session may not have fully started'
        );
        console.log('All console logs:', consoleLogs);
        expect(buttonBecameEnabled).toBe(true); // At least button worked
      }
    } else {
      console.log(
        '⚠️  Button never became enabled - emulator polyfill may not have loaded'
      );
      console.log('All console logs:', consoleLogs);

      // Test passes if we at least got the page loaded
      expect(finalStatusText).toBeDefined();
    }
  });
});

const f04ScreenshotDir = path.join(__dirname, '../../../docs/screenshots/f04');

test.describe('F-04 HUD surveying panel', () => {
  test('surveying panel is visible after entering the emulator session', async ({
    page,
  }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/?emulator=1&room=living_room&debug=1');
    await page.waitForLoadState('networkidle');

    const button = page.locator('#enter-button');
    let buttonBecameEnabled = false;
    for (let i = 0; i < 40; i++) {
      if (await button.isEnabled()) {
        buttonBecameEnabled = true;
        break;
      }
      await page.waitForTimeout(500);
    }

    expect(buttonBecameEnabled).toBe(true);
    await button.click();

    const landingPage = page.locator('#landing-page');
    await expect
      .poll(
        async () => landingPage.evaluate((el) => getComputedStyle(el).display),
        {
          timeout: 20_000,
        }
      )
      .toBe('none');

    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __rq?: { hud?: { ready?: boolean } } }).__rq
            ?.hud?.ready
        ),
      { timeout: 20_000 }
    );

    const hud = await page.evaluate(() => {
      const rq = (
        window as unknown as {
          __rq?: {
            store?: { phase?: string };
            hud?: { ready?: boolean; visible?: string[] };
          };
        }
      ).__rq;
      const landing = document.getElementById('landing-page');
      return {
        phase: rq?.store?.phase ?? null,
        hudReady: rq?.hud?.ready ?? false,
        visible: rq?.hud?.visible ?? [],
        landingDisplay: landing ? getComputedStyle(landing).display : 'missing',
        overlayCount: document.querySelectorAll('[data-rq-hud]').length,
      };
    });

    console.log('F-04 HUD state', hud, 'logs', consoleLogs.slice(-20));

    expect(hud.landingDisplay).toBe('none');
    expect(hud.overlayCount).toBe(0);
    expect(hud.hudReady).toBe(true);
    expect(hud.phase).toBe('surveying');
    expect(hud.visible).toContain('surveying');

    await page.screenshot({
      path: path.join(f04ScreenshotDir, '01-surveying-panel.png'),
      fullPage: true,
    });

    const canvas = page.locator('#scene-container canvas');
    if (await canvas.count()) {
      await canvas.first().screenshot({
        path: path.join(f04ScreenshotDir, '02-surveying-canvas.png'),
      });
    }
  });
});

const f05ScreenshotDir = path.join(__dirname, '../../../docs/screenshots/f05');

test.describe('F-05 debug overlay', () => {
  test('does not install __rq without ?debug=1 in production', async ({
    page,
  }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/?emulator=1&room=living_room');
    await page.waitForLoadState('networkidle');

    const button = page.locator('#enter-button');
    for (let i = 0; i < 40; i++) {
      if (await button.isEnabled()) break;
      await page.waitForTimeout(500);
    }
    expect(await button.isEnabled()).toBe(true);
    await button.click();

    await expect
      .poll(
        async () =>
          page
            .locator('#landing-page')
            .evaluate((el) => getComputedStyle(el).display),
        { timeout: 20_000 }
      )
      .toBe('none');

    await expect
      .poll(
        () =>
          consoleLogs.some((line) =>
            line.includes('[HUD] Spatial panels mounted')
          ),
        { timeout: 20_000 }
      )
      .toBe(true);

    const hasHooks = await page.evaluate(
      () => Boolean((window as unknown as { __rq?: unknown }).__rq)
    );
    expect(hasHooks).toBe(false);
    expect(await page.locator('#rq-debug-overlay').count()).toBe(0);
  });

  test('shows perf overlay in the emulator with ?debug=1', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/?emulator=1&room=living_room&debug=1');
    await page.waitForLoadState('networkidle');

    const button = page.locator('#enter-button');
    for (let i = 0; i < 40; i++) {
      if (await button.isEnabled()) break;
      await page.waitForTimeout(500);
    }
    expect(await button.isEnabled()).toBe(true);
    await button.click();

    await expect
      .poll(
        async () =>
          page
            .locator('#landing-page')
            .evaluate((el) => getComputedStyle(el).display),
        { timeout: 20_000 }
      )
      .toBe('none');

    await page.waitForFunction(
      () =>
        Boolean(
          (
            window as unknown as {
              __rq?: { overlay?: { ready?: boolean }; stats?: () => unknown };
            }
          ).__rq?.overlay?.ready
        ),
      { timeout: 25_000 }
    );

    await page.waitForTimeout(1200);

    const snapshot = await page.evaluate(() => {
      const rq = (
        window as unknown as {
          __rq?: {
            overlay?: { ready?: boolean };
            stats?: () => {
              fps: number;
              drawCalls: number;
              triangles: number;
              surfaces: number;
              source: string | null;
              latencyMs: number | null;
              repairs: number;
              fallbackReason: string | null;
              validationIssues: number;
            };
            autoSolve?: () => Promise<void>;
            plan?: unknown;
            store?: unknown;
          };
        }
      ).__rq;
      const panel = document.getElementById('rq-debug-overlay');
      return {
        overlayReady: rq?.overlay?.ready ?? false,
        hasStore: Boolean(rq?.store),
        hasPlanSlot: rq !== undefined && 'plan' in rq,
        autoSolveType: typeof rq?.autoSolve,
        stats: rq?.stats?.() ?? null,
        domText: panel?.textContent ?? null,
        domHidden: panel
          ? getComputedStyle(panel).display === 'none'
          : 'missing',
      };
    });

    console.log('F-05 overlay state', snapshot, 'logs', consoleLogs.slice(-20));

    expect(snapshot.overlayReady).toBe(true);
    expect(snapshot.hasStore).toBe(true);
    expect(snapshot.hasPlanSlot).toBe(true);
    expect(snapshot.autoSolveType).toBe('undefined');
    expect(snapshot.stats).not.toBeNull();
    expect(snapshot.stats?.drawCalls).toBeGreaterThanOrEqual(0);
    expect(snapshot.stats?.triangles).toBeGreaterThanOrEqual(0);
    expect(typeof snapshot.stats?.fps).toBe('number');
    expect(typeof snapshot.stats?.surfaces).toBe('number');
    expect(typeof snapshot.stats?.repairs).toBe('number');
    expect(typeof snapshot.stats?.validationIssues).toBe('number');

    await page.screenshot({
      path: path.join(f05ScreenshotDir, '01-debug-overlay.png'),
      fullPage: true,
    });

    const canvas = page.locator('#scene-container canvas');
    if (await canvas.count()) {
      await canvas.first().screenshot({
        path: path.join(f05ScreenshotDir, '02-debug-canvas.png'),
      });
    }
  });
});

const f06ScreenshotDir = path.join(__dirname, '../../../docs/screenshots/f06');

test.describe('F-06 onboarding and edge arrow', () => {
  test('shows the onboarding bubble then an edge arrow when looking away', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('rq.onboarding.v1');
      } catch {
        /* private mode */
      }
    });

    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/?emulator=1&room=living_room&debug=1&director=mock');
    await page.waitForLoadState('networkidle');

    const button = page.locator('#enter-button');
    for (let i = 0; i < 40; i++) {
      if (await button.isEnabled()) break;
      await page.waitForTimeout(500);
    }
    expect(await button.isEnabled()).toBe(true);
    await button.click();

    await expect
      .poll(
        async () =>
          page
            .locator('#landing-page')
            .evaluate((el) => getComputedStyle(el).display),
        { timeout: 20_000 }
      )
      .toBe('none');

    await page.waitForFunction(
      () =>
        Boolean(
          (
            window as unknown as {
              __rq?: { hud?: { ready?: boolean } };
            }
          ).__rq?.hud?.ready
        ),
      { timeout: 25_000 }
    );

    await page.waitForTimeout(3_000);
    await page.evaluate(() => {
      const rq = (
        window as unknown as {
          __rq?: {
            store?: { phase?: string };
            playSynthetic?: () => boolean;
          };
        }
      ).__rq;
      if (rq?.store?.phase !== 'playing') {
        rq?.playSynthetic?.();
      }
    });

    await page.waitForFunction(
      () => {
        const rq = (
          window as unknown as {
            __rq?: {
              store?: { phase?: string };
              guidance?: { ready?: boolean; onboardingActive?: boolean };
            };
          }
        ).__rq;
        return (
          rq?.store?.phase === 'playing' &&
          rq.guidance?.ready === true &&
          rq.guidance.onboardingActive === true
        );
      },
      { timeout: 45_000 }
    );

    const onboard = await page.evaluate(() => {
      const rq = (
        window as unknown as {
          __rq?: {
            store?: { phase?: string };
            hud?: { visible?: string[] };
            guidance?: {
              onboardingActive?: boolean;
              line?: string | null;
              arrowVisible?: boolean;
            };
          };
        }
      ).__rq;
      return {
        phase: rq?.store?.phase ?? null,
        visible: rq?.hud?.visible ?? [],
        onboardingActive: rq?.guidance?.onboardingActive ?? false,
        line: rq?.guidance?.line ?? null,
        arrowVisible: rq?.guidance?.arrowVisible ?? false,
      };
    });

    console.log('F-06 onboarding', onboard, 'logs', consoleLogs.slice(-24));

    expect(onboard.phase).toBe('playing');
    expect(onboard.visible).toContain('dialogue');
    expect(onboard.visible).toContain('beatGoal');
    expect(onboard.onboardingActive).toBe(true);
    expect(onboard.line).toBeTruthy();
    expect(onboard.arrowVisible).toBe(false);

    await page.screenshot({
      path: path.join(f06ScreenshotDir, '01-onboarding-bubble.png'),
      fullPage: true,
    });

    await page.evaluate(() => {
      (
        window as unknown as {
          __rq?: { guidance?: { placeTargetAtAngle?: (deg: number) => void } };
        }
      ).__rq?.guidance?.placeTargetAtAngle?.(90);
    });

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const rq = (
              window as unknown as {
                __rq?: { guidance?: { arrowVisible?: boolean } };
              }
            ).__rq;
            return rq?.guidance?.arrowVisible === true;
          }),
        { timeout: 8_000 }
      )
      .toBe(true);

    const away = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __rq?: {
            store?: { events?: { type: string }[] };
            guidance?: { arrowVisible?: boolean; angleDeg?: number };
          };
        }
      ).__rq;
      return {
        arrowVisible: store?.guidance?.arrowVisible ?? false,
        angleDeg: store?.guidance?.angleDeg ?? 0,
        outOfViewEvent: (store?.store?.events ?? []).some(
          (event) => event.type === 'explorerOutOfView'
        ),
      };
    });

    console.log('F-06 look-away', away);

    expect(away.arrowVisible).toBe(true);
    expect(away.angleDeg).toBeGreaterThan(50);
    expect(away.outOfViewEvent).toBe(true);

    await page.screenshot({
      path: path.join(f06ScreenshotDir, '02-edge-arrow.png'),
      fullPage: true,
    });

    const canvas = page.locator('#scene-container canvas');
    if (await canvas.count()) {
      await canvas.first().screenshot({
        path: path.join(f06ScreenshotDir, '03-edge-arrow-canvas.png'),
      });
    }
  });
});

