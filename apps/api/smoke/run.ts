import { randomBytes, randomUUID } from 'node:crypto';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { validatePlan } from '@roomquest/level-core';
import {
  LevelRequest,
  LevelResponse,
  RateLimitError,
  ResultResponse,
  procLevelKey,
  type SurfaceGraph,
} from '@roomquest/schema';
import { z } from 'zod';
import { findRepoRoot } from '../eval/paths';
import { DIRECTOR_BUDGET_MS } from '../src/director/director.constants';
import { makeDailySeed } from '../src/levels/daily-seed';
import { CACHE_MISS_LIMIT } from '../src/levels/rate-limit.constants';
import type { SmokeOptions } from './args';
import { CLIENT_VERSION, PREVIEW_ORIGIN, SMOKE_DATE } from './constants';
import { header, smokeRequest, type SmokeResponse } from './http';
import { startComposePostgres, stopComposePostgres } from './postgres';

const HealthBody = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
  db: z.enum(['up', 'down', 'disabled']),
  llm: z.enum(['up', 'quota-cooldown', 'disabled']),
  time: z.string().min(1),
});

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface SmokeCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface SmokeReport {
  baseUrl: string;
  checks: SmokeCheck[];
  ok: boolean;
}

function uniqueRoomHash(): string {
  return randomBytes(6).toString('hex');
}

function cloneGraph(graph: SurfaceGraph, roomHash: string): SurfaceGraph {
  return { ...graph, roomHash };
}

function check(name: string, status: CheckStatus, detail: string): SmokeCheck {
  return { name, status, detail };
}

function fail(name: string, detail: string): SmokeCheck {
  return check(name, 'fail', detail);
}

function pass(name: string, detail: string): SmokeCheck {
  return check(name, 'pass', detail);
}

function skip(name: string, detail: string): SmokeCheck {
  return check(name, 'skip', detail);
}

function summarizeBody(body: unknown): string {
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function levelsHeaders(deviceId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
    'X-Client-Version': CLIENT_VERSION,
  };
}

async function postLevels(
  baseUrl: string,
  deviceId: string,
  body: LevelRequest
): Promise<SmokeResponse> {
  return smokeRequest(`${baseUrl}/api/v1/levels`, {
    method: 'POST',
    headers: levelsHeaders(deviceId),
    body: JSON.stringify(body),
  });
}

async function postResult(
  baseUrl: string,
  cacheKey: string,
  deviceId: string,
  planSource: LevelResponse['source']
): Promise<SmokeResponse> {
  return smokeRequest(
    `${baseUrl}/api/v1/levels/${encodeURIComponent(cacheKey)}/result`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        stars: 3,
        gems: 2,
        timeMs: 180_000,
        completed: true,
        planSource,
      }),
    }
  );
}

function parseLevelResponse(
  res: SmokeResponse,
  label: string
): { ok: true; value: LevelResponse } | { ok: false; check: SmokeCheck } {
  if (res.status !== 200) {
    return {
      ok: false,
      check: fail(
        label,
        `expected 200, got ${String(res.status)} ${summarizeBody(res.body)}`
      ),
    };
  }
  const parsed = LevelResponse.safeParse(res.body);
  if (!parsed.success) {
    return {
      ok: false,
      check: fail(label, `LevelResponse parse failed: ${parsed.error.message}`),
    };
  }
  if (parsed.data.latencyMs > DIRECTOR_BUDGET_MS) {
    return {
      ok: false,
      check: fail(
        label,
        `latencyMs ${String(parsed.data.latencyMs)} exceeded ${String(DIRECTOR_BUDGET_MS)} ms budget`
      ),
    };
  }
  return { ok: true, value: parsed.data };
}

async function checkHealth(
  baseUrl: string,
  expectedDb: 'up' | 'down'
): Promise<SmokeCheck> {
  const name =
    expectedDb === 'up'
      ? 'GET /api/health (version + db:up)'
      : 'GET /api/health (db:down after Postgres stop)';
  const res = await smokeRequest(`${baseUrl}/api/health`);
  if (res.status !== 200) {
    return fail(name, `expected 200, got ${String(res.status)}`);
  }
  const parsed = HealthBody.safeParse(res.body);
  if (!parsed.success) {
    return fail(name, `health shape: ${parsed.error.message}`);
  }
  if (parsed.data.db !== expectedDb) {
    return fail(
      name,
      `expected db:"${expectedDb}", got db:"${parsed.data.db}" version=${parsed.data.version}`
    );
  }
  return pass(
    name,
    `version=${parsed.data.version} db=${parsed.data.db} llm=${parsed.data.llm}`
  );
}

async function waitForHealthDb(
  baseUrl: string,
  expected: 'up' | 'down',
  attempts = 20
): Promise<SmokeCheck> {
  let last = fail(
    `GET /api/health (db:${expected})`,
    'did not reach expected db status'
  );
  for (let i = 0; i < attempts; i += 1) {
    last = await checkHealth(baseUrl, expected);
    if (last.status === 'pass') {
      return last;
    }
    await sleep(500);
  }
  return last;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function loadRooms(): { id: string; graph: SurfaceGraph }[] {
  // Mock director always returns SYNTHETIC_LIVING_ROOM_PLAN. IWER graphs from
  // #57 are for live eval; they fail validatePlan against the mock fixture.
  return [{ id: 'synthetic_living_room', graph: SYNTHETIC_LIVING_ROOM }];
}

export async function runSmoke(
  options: SmokeOptions,
  repoRoot: string = findRepoRoot(__dirname)
): Promise<SmokeReport> {
  const checks: SmokeCheck[] = [];
  const deviceId = randomUUID();
  const rateLimitDeviceId = randomUUID();
  const rooms = loadRooms().map((room) => ({
    ...room,
    graph: cloneGraph(room.graph, uniqueRoomHash()),
  }));

  checks.push(await waitForHealthDb(options.baseUrl, 'up'));

  let firstBody: LevelRequest | undefined;
  let firstResponse: LevelResponse | undefined;

  for (const room of rooms) {
    const name = `POST /api/v1/levels valid plan (${room.id})`;
    const body = LevelRequest.parse({
      graph: room.graph,
      date: SMOKE_DATE,
      tier: 'easy',
    });
    const res = await postLevels(options.baseUrl, deviceId, body);
    const parsed = parseLevelResponse(res, name);
    if (!parsed.ok) {
      checks.push(parsed.check);
      continue;
    }
    const validation = validatePlan(parsed.value.plan, room.graph);
    if (!validation.ok) {
      const codes = validation.issues.map((issue) => issue.code).join(', ');
      checks.push(fail(name, `validatePlan failed: ${codes}`));
      continue;
    }
    checks.push(
      pass(
        name,
        `source=${parsed.value.source} cacheKey=${parsed.value.cacheKey} latencyMs=${String(parsed.value.latencyMs)}`
      )
    );
    firstBody ??= body;
    firstResponse ??= parsed.value;
  }

  if (firstBody !== undefined && firstResponse !== undefined) {
    const cacheName = 'POST /api/v1/levels repeat → source:cache';
    const res = await postLevels(options.baseUrl, deviceId, firstBody);
    const parsed = parseLevelResponse(res, cacheName);
    if (!parsed.ok) {
      checks.push(parsed.check);
    } else if (parsed.value.source !== 'cache') {
      checks.push(
        fail(cacheName, `expected source:"cache", got "${parsed.value.source}"`)
      );
    } else if (parsed.value.cacheKey !== firstResponse.cacheKey) {
      checks.push(
        fail(
          cacheName,
          `cacheKey drifted (${parsed.value.cacheKey} vs ${firstResponse.cacheKey})`
        )
      );
    } else {
      checks.push(pass(cacheName, `cacheKey=${parsed.value.cacheKey}`));
    }

    const resultName = 'POST /result with returned cacheKey → 201';
    const stored = await postResult(
      options.baseUrl,
      firstResponse.cacheKey,
      deviceId,
      firstResponse.source
    );
    const storedParsed = ResultResponse.safeParse(stored.body);
    if (stored.status !== 201 || !storedParsed.success) {
      checks.push(
        fail(
          resultName,
          `expected 201 {id}, got ${String(stored.status)} ${summarizeBody(stored.body)}`
        )
      );
    } else {
      checks.push(pass(resultName, `id=${storedParsed.data.id}`));
    }

    const seed = makeDailySeed(firstBody.graph.roomHash, firstBody.date);
    const procKey = procLevelKey(seed, firstBody.tier);
    const procName = 'POST /result with procLevelKey(seed,tier) → 201';
    const proc = await postResult(
      options.baseUrl,
      procKey,
      deviceId,
      'procedural'
    );
    const procParsed = ResultResponse.safeParse(proc.body);
    if (proc.status !== 201 || !procParsed.success) {
      checks.push(
        fail(
          procName,
          `expected 201 {id}, got ${String(proc.status)} ${summarizeBody(proc.body)}`
        )
      );
    } else {
      checks.push(pass(procName, `key=${procKey} id=${procParsed.data.id}`));
    }
  } else {
    checks.push(fail('POST /api/v1/levels', 'no fixture room produced a plan'));
  }

  checks.push(await checkCorsPreflight(options.baseUrl));
  checks.push(
    await checkRateLimit(options.baseUrl, rateLimitDeviceId, rooms[0]?.graph)
  );

  if (options.stopPostgres) {
    const down = await checkDbDown(options.baseUrl, repoRoot, deviceId);
    checks.push(...down);
  } else {
    checks.push(
      skip(
        'Postgres stop → health db:down + /levels 200',
        'pass --stop-postgres (or SMOKE_STOP_POSTGRES=1) on localhost only'
      )
    );
  }

  return {
    baseUrl: options.baseUrl,
    checks,
    ok: checks.every((item) => item.status !== 'fail'),
  };
}

async function checkCorsPreflight(baseUrl: string): Promise<SmokeCheck> {
  const name = 'CORS preflight from Vercel preview origin';
  const res = await smokeRequest(`${baseUrl}/api/v1/levels`, {
    method: 'OPTIONS',
    headers: {
      Origin: PREVIEW_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers':
        'content-type,x-device-id,x-client-version,x-request-id',
    },
  });
  if (res.status !== 204 && res.status !== 200) {
    return fail(name, `expected 204/200, got ${String(res.status)}`);
  }
  const allowOrigin = header(res.headers, 'access-control-allow-origin');
  if (allowOrigin !== PREVIEW_ORIGIN) {
    return fail(
      name,
      `expected Access-Control-Allow-Origin ${PREVIEW_ORIGIN}, got ${allowOrigin ?? '(none)'}`
    );
  }
  return pass(name, `status=${String(res.status)} origin=${allowOrigin}`);
}

async function checkRateLimit(
  baseUrl: string,
  deviceId: string,
  template: SurfaceGraph | undefined
): Promise<SmokeCheck> {
  const name = 'POST /levels 429 path returns retryAfterS';
  const graph = cloneGraph(template ?? SYNTHETIC_LIVING_ROOM, uniqueRoomHash());
  for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
    const body = LevelRequest.parse({
      graph,
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      tier: 'easy',
    });
    const res = await postLevels(baseUrl, deviceId, body);
    if (res.status !== 200) {
      return fail(
        name,
        `miss ${String(i + 1)} expected 200, got ${String(res.status)} ${summarizeBody(res.body)}`
      );
    }
  }
  const body = LevelRequest.parse({
    graph,
    date: '2026-01-31',
    tier: 'easy',
  });
  const res = await postLevels(baseUrl, deviceId, body);
  const parsed = RateLimitError.safeParse(res.body);
  if (res.status !== 429 || !parsed.success) {
    return fail(
      name,
      `expected 429 RATE_LIMITED, got ${String(res.status)} ${summarizeBody(res.body)}`
    );
  }
  if (
    typeof parsed.data.error.retryAfterS !== 'number' ||
    parsed.data.error.retryAfterS < 1
  ) {
    return fail(
      name,
      `retryAfterS missing or invalid: ${String(parsed.data.error.retryAfterS)}`
    );
  }
  const retryHeader = header(res.headers, 'retry-after');
  return pass(
    name,
    `retryAfterS=${String(parsed.data.error.retryAfterS)} Retry-After=${retryHeader ?? '(none)'}`
  );
}

async function checkDbDown(
  baseUrl: string,
  repoRoot: string,
  deviceId: string
): Promise<SmokeCheck[]> {
  const results: SmokeCheck[] = [];
  try {
    stopComposePostgres(repoRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return [fail('docker compose stop postgres', message)];
  }

  results.push(await waitForHealthDb(baseUrl, 'down'));

  const name = 'POST /levels still 200 procedural after db down';
  const body = LevelRequest.parse({
    graph: cloneGraph(SYNTHETIC_LIVING_ROOM, uniqueRoomHash()),
    date: SMOKE_DATE,
    tier: 'easy',
  });
  const res = await postLevels(baseUrl, deviceId, body);
  const parsed = parseLevelResponse(res, name);
  if (!parsed.ok) {
    results.push(parsed.check);
  } else if (parsed.value.source !== 'procedural') {
    results.push(
      fail(name, `expected source:"procedural", got "${parsed.value.source}"`)
    );
  } else {
    results.push(pass(name, `source=${parsed.value.source} status=200`));
  }

  try {
    startComposePostgres(repoRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    results.push(fail('docker compose start postgres (restore)', message));
  }

  return results;
}

export function formatSmokeTable(report: SmokeReport): string {
  const rows = [
    '| Check | Result | Detail |',
    '| --- | --- | --- |',
    ...report.checks.map((item) => {
      const result = item.status.toUpperCase();
      const detail = item.detail.replace(/\|/gu, '\\|');
      return `| ${item.name} | ${result} | ${detail} |`;
    }),
  ];
  return rows.join('\n');
}
