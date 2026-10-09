/**
 * Oct 20 MVP path: production/preview `/?emulator=1` through win HUD.
 *
 * Requires the production emulator SEM + SurfaceGraph getVectorView +
 * `__rq.replay` / `__rq.exit` fixes. Run against `vite preview`:
 *   MVP_BASE_URL=https://127.0.0.1:4173 pnpm --filter client e2e:mvp
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotDir = path.join(__dirname, '../../../docs/screenshots/e2e-mvp');
const API_ORIGIN = 'http://127.0.0.1:3999';

interface RqWindow {
  IWER_DEVICE?: unknown;
  __rq?: {
    store?: {
      phase?: string;
      planSource?: string | null;
      fallbackReason?: string | null;
      plan?: {
        seed?: string;
        placements?: { id: string; piece: string; playerBuilt: boolean }[];
      };
      events?: { type: string }[];
      result?: { stars?: number; gems?: number; timeMs?: number } | null;
    };
    hud?: { ready?: boolean; visible?: string[] };
    placement?: {
      grab: (id: string, hand: 'left' | 'right') => boolean;
      moveToTarget: (id?: string) => boolean;
      release: () => string;
    };
    gateLever?: { pull: (id: string) => boolean };
    slime?: { stun: (id: string) => boolean };
    platform?: { align: (id?: string) => boolean };
    guidance?: { skipOnboarding?: () => void };
    pause?: () => void;
    resume?: () => void;
    forceWin?: () => void;
    autoSolve?: () => Promise<void>;
    replay?: () => void;
    exit?: () => void;
  };
}

interface ResultPost {
  url: string;
  body: {
    completed?: boolean;
    stars?: number;
    gems?: number;
    timeMs?: number;
    planSource?: string;
    deviceId?: string;
  } | null;
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Content-Type, X-Device-Id, X-Client-Version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

async function mockApi(page: Page): Promise<void> {
  const handler = async (route: Route): Promise<void> => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    const url = req.url();
    const json = (status: number, body: unknown): Promise<void> =>
      route.fulfill({
        status,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (url.includes('/api/health')) {
      await json(200, { status: 'ok', db: 'down' });
      return;
    }
    if (url.includes('/result')) {
      await json(201, { id: 'e2e-mvp-session' });
      return;
    }
    await json(404, {
      error: { code: 'UNKNOWN_LEVEL', message: 'nope' },
    });
  };

  await page.route(`${API_ORIGIN}/**`, handler);
  await page.route('**/api/**', handler);
}

function captureResultPosts(page: Page, posts: ResultPost[]): void {
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !req.url().includes('/result')) return;
    let body: ResultPost['body'] = null;
    try {
      body = req.postDataJSON() as ResultPost['body'];
    } catch {
      body = null;
    }
    posts.push({ url: req.url(), body });
  });
}

async function enterSession(
  page: Page,
  query: string,
  shotPrefix: string
): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('rq.onboarding.v1');
    } catch {
      /* private mode */
    }
  });
  await page.goto(`/?emulator=1&debug=1&date=2026-10-09&${query}`);
  const button = page.locator('#enter-button');
  await expect
    .poll(async () => button.isEnabled(), { timeout: 25_000 })
    .toBe(true);
  await page.screenshot({
    path: path.join(screenshotDir, `${shotPrefix}-01-landing.png`),
    fullPage: true,
  });
  await button.click();
  await expect
    .poll(
      async () =>
        page
          .locator('#landing-page')
          .evaluate((el) => getComputedStyle(el).display),
      { timeout: 25_000 }
    )
    .toBe('none');
}

async function waitPlaying(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const rq = (window as unknown as RqWindow).__rq;
      return rq?.store?.phase === 'playing';
    },
    null,
    { timeout: 70_000 }
  );
}

async function interactPieces(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    const placements = rq?.store?.plan?.placements;
    if (!rq || !placements) return;
    rq.guidance?.skipOnboarding?.();
    for (const row of placements) {
      if (row.playerBuilt) {
        if (rq.placement?.grab(row.id, 'right')) {
          rq.placement.moveToTarget(row.id);
          rq.placement.release();
        }
      }
      if (row.piece === 'lever') rq.gateLever?.pull(row.id);
      if (row.piece === 'slime') rq.slime?.stun(row.id);
      if (row.piece === 'moving_platform') rq.platform?.align(row.id);
    }
  });
}

function levelKeyOf(url: string): string {
  const match = /\/api\/v1\/levels\/([^/]+)\/result/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

test.describe('e2e-mvp emulator flow', () => {
  test('office_small mock: place, lever, platform, slime, win, replay, done', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const posts: ResultPost[] = [];
    captureResultPosts(page, posts);
    await mockApi(page);
    await enterSession(page, 'room=office_small&director=mock', 'office_small');
    await waitPlaying(page);

    const loaded = await page.evaluate(() => {
      const w = window as unknown as RqWindow;
      return {
        phase: w.__rq?.store?.phase ?? null,
        source: w.__rq?.store?.planSource ?? null,
        hasIwer: Boolean(w.IWER_DEVICE),
        hudReady: w.__rq?.hud?.ready ?? false,
      };
    });
    expect(loaded.phase).toBe('playing');
    expect(loaded.source).toBe('procedural');
    expect(loaded.hasIwer).toBe(true);
    expect(loaded.hudReady).toBe(true);

    await interactPieces(page);
    const auto = await page.evaluate(() => {
      const rq = (window as unknown as RqWindow).__rq;
      if (typeof rq?.autoSolve !== 'function') return false;
      void rq.autoSolve();
      return true;
    });
    expect(auto).toBe(true);

    await page.waitForFunction(
      () => (window as unknown as RqWindow).__rq?.store?.phase === 'won',
      null,
      { timeout: 90_000 }
    );

    const win = await page.evaluate(() => {
      const rq = (window as unknown as RqWindow).__rq;
      const events = (rq?.store?.events ?? []).map((event) => event.type);
      return {
        phase: rq?.store?.phase ?? null,
        visible: rq?.hud?.visible ?? [],
        stars: rq?.store?.result?.stars ?? null,
        gems: rq?.store?.result?.gems ?? 0,
        timeMs: rq?.store?.result?.timeMs ?? null,
        events,
      };
    });
    await page.screenshot({
      path: path.join(screenshotDir, 'office_small-02-win.png'),
      fullPage: true,
    });
    expect(win.phase).toBe('won');
    expect(win.visible).toContain('win');
    expect(win.stars).toBeGreaterThan(0);
    expect(win.events).toContain('leverPulled');
    expect(win.events).toContain('gateOpened');
    expect(win.events).toContain('slimeStunned');
    expect(win.events).toContain('platformAligned');
    expect(win.events).toContain('gemCollected');

    const replayed = await page.evaluate(() => {
      const rq = (window as unknown as RqWindow).__rq;
      rq?.replay?.();
      return typeof rq?.replay === 'function';
    });
    expect(replayed).toBe(true);
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as unknown as RqWindow).__rq?.store?.phase ?? null
        )
      )
      .toBe('playing');

    const exited = await page.evaluate(() => {
      const rq = (window as unknown as RqWindow).__rq;
      rq?.exit?.();
      return typeof rq?.exit === 'function';
    });
    expect(exited).toBe(true);
    await expect
      .poll(async () =>
        page
          .locator('#landing-page')
          .evaluate((el) => getComputedStyle(el).display !== 'none')
      )
      .toBe(true);

    const winPost = posts.find((post) => post.body?.completed === true);
    expect(winPost, 'completed result POST').toBeTruthy();
    expect(winPost?.body?.stars).toBeGreaterThan(0);
    expect(winPost?.body?.planSource).toBe('procedural');
    expect(levelKeyOf(winPost?.url ?? '')).toMatch(/^proc:[^:]+:/);
  });

  test('living_room director=off loads procedural fallback, pause, forceWin', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const posts: ResultPost[] = [];
    captureResultPosts(page, posts);
    await mockApi(page);
    await enterSession(page, 'room=living_room&director=off', 'living_room_off');
    await waitPlaying(page);

    const loaded = await page.evaluate(() => {
      const rq = (window as unknown as RqWindow).__rq;
      return {
        phase: rq?.store?.phase ?? null,
        fallback: rq?.store?.fallbackReason ?? null,
        source: rq?.store?.planSource ?? null,
      };
    });
    expect(loaded.phase).toBe('playing');
    expect(loaded.source).toBe('procedural');
    expect(loaded.fallback).toBe('director-off');

    await page.evaluate(() => {
      (window as unknown as RqWindow).__rq?.guidance?.skipOnboarding?.();
      (window as unknown as RqWindow).__rq?.pause?.();
    });
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as unknown as RqWindow).__rq?.store?.phase ?? null
        )
      )
      .toBe('paused');
    await page.evaluate(() => {
      (window as unknown as RqWindow).__rq?.resume?.();
    });
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as unknown as RqWindow).__rq?.store?.phase ?? null
        )
      )
      .toBe('playing');

    await page.evaluate(() => {
      (window as unknown as RqWindow).__rq?.forceWin?.();
    });
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as unknown as RqWindow).__rq?.store?.phase ?? null
        )
      )
      .toBe('won');

    const winPost = posts.find((post) => post.body?.completed === true);
    expect(winPost).toBeTruthy();
    expect(levelKeyOf(winPost?.url ?? '')).toMatch(/^proc:[^:]+:/);
  });
});
