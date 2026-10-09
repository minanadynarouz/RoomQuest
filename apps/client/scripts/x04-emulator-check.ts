/**
 * Headed Chromium check for X-04 against `pnpm dev`.
 *
 * `?fixture=synthetic_living_room` boots without a WebXR session, so IWER
 * cannot inject left/right pinch poses. This script records that, then drives
 * PlacementSystem's grab/release API for both hands and screenshots the snap.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../../../docs/img/x04');
const BASE_URL = process.env.X04_BASE_URL ?? 'https://localhost:5173';

interface PlacementApi {
  grab: (id: string, hand: 'left' | 'right') => boolean;
  moveTo: (x: number, y: number, z: number) => boolean;
  moveToTarget: () => boolean;
  release: () => 'snap' | 'return' | 'idle';
  ghostVisible: () => boolean;
  heldHand: () => 'left' | 'right' | null;
  piecePose: (
    id: string
  ) => { x: number; y: number; z: number; yaw: number } | null;
  emulatorHandDriving: boolean;
  emulatorHandDrivingNote: string;
}

interface RqWindow {
  __rq?: {
    store: { events: { type: string; placementId?: string }[] };
    snapTargets: { placementId: string; pose: { position: number[] } }[];
    placement: PlacementApi | null;
  };
  xr?: unknown;
  IWER?: unknown;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--ignore-certificate-errors',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage();
  const url = `${BASE_URL}/?fixture=synthetic_living_room`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean((window as unknown as RqWindow).__rq?.placement),
    null,
    { timeout: 30_000 }
  );

  const probe = await page.evaluate(() => {
    const w = window as unknown as RqWindow;
    const xr = navigator.xr;
    return {
      hasRq: Boolean(w.__rq),
      hasPlacement: Boolean(w.__rq?.placement),
      emulatorHandDriving: w.__rq?.placement?.emulatorHandDriving ?? false,
      emulatorHandDrivingNote: w.__rq?.placement?.emulatorHandDrivingNote ?? '',
      hasIwer: typeof w.IWER !== 'undefined',
      hasNavigatorXr: Boolean(xr),
    };
  });
  console.log('[X-04 emulator] probe', probe);
  if (probe.emulatorHandDriving) {
    throw new Error('Expected emulatorHandDriving to be false on the fixture path');
  }

  await page.screenshot({
    path: path.join(OUT_DIR, '01-tray.png'),
    type: 'png',
  });

  const leftReturn = await page.evaluate(() => {
    const placement = (window as unknown as RqWindow).__rq?.placement;
    if (!placement) return { ok: false as const, reason: 'no placement api' };
    const grabbed = placement.grab('p2', 'left');
    placement.moveTo(3, 1.2, 3);
    const ghost = placement.ghostVisible();
    const released = placement.release();
    return {
      ok: grabbed && released === 'return' && !ghost,
      grabbed,
      ghost,
      released,
      hand: 'left' as const,
    };
  });
  console.log('[X-04 emulator] left-hand return', leftReturn);
  if (!leftReturn.ok) {
    throw new Error(`left-hand return failed: ${JSON.stringify(leftReturn)}`);
  }
  await page.waitForTimeout(300);

  const rightPrep = await page.evaluate(() => {
    const placement = (window as unknown as RqWindow).__rq?.placement;
    if (!placement) return { ok: false as const, reason: 'no placement api' };
    const grabbed = placement.grab('p2', 'right');
    const moved = placement.moveToTarget();
    const ghost = placement.ghostVisible();
    return { ok: grabbed && moved && ghost, grabbed, moved, ghost };
  });
  console.log('[X-04 emulator] right-hand ghost', rightPrep);
  if (!rightPrep.ok) {
    throw new Error(`right-hand ghost failed: ${JSON.stringify(rightPrep)}`);
  }
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(OUT_DIR, 'plank-ghost.png'),
    type: 'png',
  });

  const rightSnap = await page.evaluate(() => {
    const rq = (window as unknown as RqWindow).__rq;
    if (!rq?.placement) {
      return { ok: false as const, reason: 'no placement api' };
    }
    const placement = rq.placement;
    const released = placement.release();
    const pose = placement.piecePose('p2');
    const target = rq.snapTargets.find((t) => t.placementId === 'p2');
    const events = rq.store.events.filter((e) => e.type === 'pieceBuilt');
    const dx = pose && target ? Math.abs(pose.x - (target.pose.position[0] ?? 0)) : 99;
    const dy = pose && target ? Math.abs(pose.y - (target.pose.position[1] ?? 0)) : 99;
    const dz = pose && target ? Math.abs(pose.z - (target.pose.position[2] ?? 0)) : 99;
    return {
      ok:
        released === 'snap' &&
        events.some((e) => e.placementId === 'p2') &&
        dx < 0.001 &&
        dy < 0.001 &&
        dz < 0.001,
      released,
      events,
      pose,
      dx,
      dy,
      dz,
      hand: 'right' as const,
    };
  });
  console.log('[X-04 emulator] right-hand snap', rightSnap);
  if (!rightSnap.ok) {
    throw new Error(`right-hand snap failed: ${JSON.stringify(rightSnap)}`);
  }

  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(OUT_DIR, 'plank-snapped.png'),
    type: 'png',
  });

  await browser.close();
  console.log('[X-04 emulator] wrote', path.join(OUT_DIR, 'plank-snapped.png'));
  console.log(
    '[X-04 emulator] HAND DRIVING: not possible on fixture path. Covered with PlacementController grab/release for left and right hands.'
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
