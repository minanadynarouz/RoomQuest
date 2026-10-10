import './missing-key-env';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { LevelRequest, LevelResponse } from '@roomquest/schema';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/create-app';
import {
  DIRECTOR_CHAT_FACTORY,
  type DirectorChatFactory,
} from '../src/director/models';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_VERSION = '0.0.1';

const validBody = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});

describe('POST /api/v1/levels live mode without Google key', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const factory: DirectorChatFactory = {
      createPrimary: () => {
        throw new Error('must not construct a model without a key');
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DIRECTOR_CHAT_FACTORY)
      .useValue(factory)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      bodyParser: false,
    });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with a procedural LevelResponse', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/levels')
      .set('X-Device-Id', DEVICE_ID)
      .set('X-Client-Version', CLIENT_VERSION)
      .send(validBody)
      .expect(200);
    const parsed = LevelResponse.parse(res.body as unknown);
    expect(parsed.source).toBe('procedural');
    expect(parsed.model).toBeUndefined();
  });
});
