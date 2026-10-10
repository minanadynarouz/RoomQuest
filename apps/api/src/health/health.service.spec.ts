import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../config/env';
import { LLM_DAILY_USAGE } from '../director/daily-usage';
import { LLM_QUOTA_BREAKER } from '../director/quota-breaker';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService, type HealthResponse } from './health.service';

async function healthWith(options: {
  db: 'up' | 'down' | 'disabled';
  gitSha?: string;
  env?: Record<string, string>;
  quotaOpen?: boolean;
  llmToday?: { used: number; max: number; failClosed?: boolean };
}): Promise<HealthResponse> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: (config: Record<string, unknown>) =>
          validateEnv({
            ...config,
            GOOGLE_API_KEY: '',
            ...(options.gitSha === undefined
              ? {}
              : { GIT_SHA: options.gitSha }),
            ...options.env,
          }),
      }),
    ],
    providers: [
      HealthService,
      {
        provide: PrismaService,
        useValue: { dbHealth: vi.fn(() => Promise.resolve(options.db)) },
      },
      ...(options.quotaOpen === undefined
        ? []
        : [
            {
              provide: LLM_QUOTA_BREAKER,
              useValue: { isOpen: () => options.quotaOpen },
            },
          ]),
      ...(options.llmToday === undefined
        ? []
        : [
            {
              provide: LLM_DAILY_USAGE,
              useValue: (() => {
                const today = options.llmToday;
                return {
                  snapshot: () =>
                    Promise.resolve({
                      used: today.used,
                      max: today.max,
                      failClosed: today.failClosed ?? false,
                    }),
                  today: () =>
                    Promise.resolve({
                      used: today.used,
                      max: today.max,
                    }),
                };
              })(),
            },
          ]),
    ],
  }).compile();

  const health = moduleRef.get(HealthService);
  const body = await health.getHealth();
  await moduleRef.close();
  return body;
}

async function healthWithDb(
  db: 'up' | 'down' | 'disabled',
  gitSha?: string
): Promise<HealthResponse> {
  return healthWith({ db, gitSha });
}

describe('HealthService', () => {
  it("reports db:'up' when the Prisma ping succeeds", async () => {
    const body = await healthWithDb('up');
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(body.version.length).toBeGreaterThan(0);
  });

  it("reports db:'down' when the Prisma ping fails", async () => {
    const body = await healthWithDb('down');
    expect(body.status).toBe('ok');
    expect(body.db).toBe('down');
  });

  it("reports db:'disabled' when DATABASE_URL is unset", async () => {
    const body = await healthWithDb('disabled');
    expect(body.status).toBe('ok');
    expect(body.db).toBe('disabled');
  });

  it('reports GIT_SHA as version', async () => {
    const body = await healthWithDb('up', 'abc123deadbeef');
    expect(body.version).toBe('abc123deadbeef');
  });

  it("reports llm:'disabled' when GOOGLE_API_KEY is unset", async () => {
    const body = await healthWith({ db: 'up' });
    expect(body.llm).toBe('disabled');
  });

  it("reports llm:'up' when the Gemini key is set and the breaker is closed", async () => {
    const body = await healthWith({
      db: 'up',
      env: { GOOGLE_API_KEY: 'test-google-key' },
      quotaOpen: false,
    });
    expect(body.llm).toBe('up');
  });

  it("reports llm:'quota-cooldown' when the breaker is open", async () => {
    const body = await healthWith({
      db: 'up',
      env: { GOOGLE_API_KEY: 'test-google-key' },
      quotaOpen: true,
    });
    expect(body.llm).toBe('quota-cooldown');
  });

  it('reports llmToday used/max and quota-cooldown while the daily cap is hit', async () => {
    const body = await healthWith({
      db: 'up',
      env: { GOOGLE_API_KEY: 'test-google-key', LLM_DAILY_MAX: '20' },
      llmToday: { used: 20, max: 20 },
    });
    expect(body.llm).toBe('quota-cooldown');
    expect(body.llmToday).toEqual({ used: 20, max: 20 });
  });

  it("reports llm:'quota-cooldown' when the daily counter is fail-closed", async () => {
    const body = await healthWith({
      db: 'down',
      env: { GOOGLE_API_KEY: 'test-google-key' },
      llmToday: { used: 0, max: 150, failClosed: true },
    });
    expect(body.llm).toBe('quota-cooldown');
    expect(body.llmToday).toEqual({ used: 0, max: 150 });
  });

  it('defaults llmToday.max from LLM_DAILY_MAX when no counter is injected', async () => {
    const body = await healthWith({
      db: 'disabled',
      env: { LLM_DAILY_MAX: '40' },
    });
    expect(body.llmToday).toEqual({ used: 0, max: 40 });
  });
});
