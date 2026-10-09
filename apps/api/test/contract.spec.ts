import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { LevelRequest, LevelResponse } from '@roomquest/schema';
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
      expect(body.db).toBe('down');
      expect(body.llm === 'configured' || body.llm === 'missing').toBe(true);
      expect(typeof body.time).toBe('string');
      expect(Number.isNaN(Date.parse(body.time))).toBe(false);
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
