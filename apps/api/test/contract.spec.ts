import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import {
  LevelRequest,
  LevelResponse,
  ResultDeferred,
  ResultRequest,
  procLevelKey,
} from '@roomquest/schema';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JSON_BODY_LIMIT_BYTES, PROMPT_VERSION } from '../src/common/constants';
import { createApp } from '../src/create-app';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_VERSION = '0.0.1';

interface ErrorEnvelope {
  error: {
    code: string;
    message?: string;
    issues?: unknown[];
  };
}

interface HealthBody {
  status: string;
  version: string;
  db: string;
  llm: string;
  llmToday: { used: number; max: number };
  time: string;
}

const validBody = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

function levelsPost(app: INestApplication) {
  return request(httpServer(app))
    .post('/api/v1/levels')
    .set('X-Device-Id', DEVICE_ID)
    .set('X-Client-Version', CLIENT_VERSION);
}

describe('API contract (B-02)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.LLM_DAILY_MAX;
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('returns 200 with the documented shape while the process is up', async () => {
      const res = await request(httpServer(app)).get('/api/health').expect(200);
      const body = res.body as HealthBody;

      expect(body.status).toBe('ok');
      expect(typeof body.version).toBe('string');
      expect(body.version.length).toBeGreaterThan(0);
      expect(body.db).toBe('disabled');
      expect(
        body.llm === 'up' ||
          body.llm === 'quota-cooldown' ||
          body.llm === 'disabled'
      ).toBe(true);
      expect(body.llmToday).toEqual({ used: 0, max: 150 });
      expect(typeof body.time).toBe('string');
      expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    });

    it('echoes an incoming X-Request-Id', async () => {
      const res = await request(httpServer(app))
        .get('/api/health')
        .set('X-Request-Id', 'client-req-123')
        .expect(200);
      expect(res.headers['x-request-id']).toBe('client-req-123');
    });

    it('generates a request id when the header is omitted', async () => {
      const res = await request(httpServer(app)).get('/api/health').expect(200);
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('sends helmet security headers', async () => {
      const res = await request(httpServer(app)).get('/api/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });
  });

  describe('POST /api/v1/levels', () => {
    it('returns 200 whose body parses as LevelResponse', async () => {
      const res = await levelsPost(app).send(validBody).expect(200);
      const parsed = LevelResponse.parse(res.body as unknown);

      expect(parsed.source).toBe('procedural');
      expect(parsed.promptVersion).toBe(PROMPT_VERSION);
      expect(parsed.repairs).toEqual([]);
      expect(parsed.plan.title).toBe('The Living Room Quest');
      expect(parsed.latencyMs).toBeGreaterThanOrEqual(0);

      const expectedKey = createHash('sha256')
        .update(
          `${validBody.graph.roomHash}|${validBody.date}|${validBody.tier}|${PROMPT_VERSION}`
        )
        .digest('hex')
        .slice(0, 16);
      expect(parsed.cacheKey).toBe(expectedKey);
    });

    it('returns 400 INVALID_REQUEST for a bad body', async () => {
      const res = await levelsPost(app)
        .send({ date: 'not-a-date', tier: 'easy' })
        .expect(400);
      const body = res.body as ErrorEnvelope;

      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(typeof body.error.message).toBe('string');
      expect(Array.isArray(body.error.issues)).toBe(true);
      expect(body.error.issues?.length ?? 0).toBeGreaterThan(0);
      expect(JSON.stringify(body)).not.toMatch(/^\s*at\s+/m);
    });

    it('returns 400 for a missing X-Device-Id', async () => {
      const res = await request(httpServer(app))
        .post('/api/v1/levels')
        .set('X-Client-Version', CLIENT_VERSION)
        .send(validBody)
        .expect(400);
      const body = res.body as ErrorEnvelope;

      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(Array.isArray(body.error.issues)).toBe(true);
    });

    it('returns 400 for an invalid X-Device-Id', async () => {
      const res = await request(httpServer(app))
        .post('/api/v1/levels')
        .set('X-Device-Id', 'not-a-uuid')
        .set('X-Client-Version', CLIENT_VERSION)
        .send(validBody)
        .expect(400);
      const body = res.body as ErrorEnvelope;

      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(Array.isArray(body.error.issues)).toBe(true);
    });

    it('rejects a JSON body over 16 KB', async () => {
      const oversized = {
        ...validBody,
        pad: 'x'.repeat(JSON_BODY_LIMIT_BYTES),
      };
      const res = await levelsPost(app).send(oversized);
      const body = res.body as ErrorEnvelope;

      expect(res.status).toBe(413);
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message ?? '').toMatch(/16 KB/i);
      expect(typeof res.headers['x-request-id']).toBe('string');
    });
  });

  describe('POST /api/v1/levels/:cacheKey/result', () => {
    const validResult = ResultRequest.parse({
      deviceId: DEVICE_ID,
      stars: 3,
      gems: 2,
      timeMs: 120_000,
      completed: true,
      planSource: 'procedural',
    });

    function resultPost(cacheKey: string) {
      return request(httpServer(app)).post(
        `/api/v1/levels/${cacheKey}/result`
      );
    }

    it('returns 202 { stored:false } when there is no database', async () => {
      const res = await resultPost('0123456789abcdef').send(validResult);
      expect(res.status).toBe(202);
      expect(ResultDeferred.parse(res.body as unknown)).toEqual({
        stored: false,
      });
    });

    it('returns 400 INVALID_REQUEST for a bad body', async () => {
      const res = await resultPost('0123456789abcdef')
        .send({ ...validResult, stars: 4 })
        .expect(400);
      const body = res.body as ErrorEnvelope;
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(Array.isArray(body.error.issues)).toBe(true);
    });

    it('rejects a JSON body over 16 KB', async () => {
      const oversized = {
        ...validResult,
        pad: 'x'.repeat(JSON_BODY_LIMIT_BYTES),
      };
      const res = await resultPost('0123456789abcdef').send(oversized);
      const body = res.body as ErrorEnvelope;
      expect(res.status).toBe(413);
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message ?? '').toMatch(/16 KB/i);
    });

    it('returns 400 for a malformed proc: key', async () => {
      for (const bad of ['proc:not-a-valid-key', 'proc:seed:hard', 'proc:']) {
        const res = await resultPost(bad).send(validResult);
        expect(res.status).toBe(400);
        const body = res.body as ErrorEnvelope;
        expect(body.error.code).toBe('INVALID_REQUEST');
      }
    });

    it('returns 400 when a proc: key is not planSource procedural', async () => {
      const key = procLevelKey('client-seed-1', 'easy');
      const res = await resultPost(key)
        .send({ ...validResult, planSource: 'llm' })
        .expect(400);
      const body = res.body as ErrorEnvelope;
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message ?? '').toMatch(/procedural/i);
    });

    it('returns 202 { stored:false } for a valid proc: key when there is no database', async () => {
      const key = procLevelKey('client-seed-1', 'easy');
      const res = await resultPost(key).send(validResult);
      expect(res.status).toBe(202);
      expect(ResultDeferred.parse(res.body as unknown)).toEqual({
        stored: false,
      });
    });
  });

  describe('CORS', () => {
    it('allows an allowlisted origin', async () => {
      const res = await request(httpServer(app))
        .get('/api/health')
        .set('Origin', 'https://localhost:5173')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://localhost:5173'
      );
    });

    it('allows a Vercel preview origin', async () => {
      const origin = 'https://feat-b02-api-roomquest-minanadynarouz.vercel.app';
      const res = await request(httpServer(app))
        .get('/api/health')
        .set('Origin', origin)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(origin);
    });

    it('does not reflect a blocked origin', async () => {
      const res = await request(httpServer(app))
        .get('/api/health')
        .set('Origin', 'https://evil.example')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
