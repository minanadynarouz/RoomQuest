import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

async function healthWithDb(
  db: 'up' | 'down' | 'disabled'
): Promise<{
  db: 'up' | 'down' | 'disabled';
  status: 'ok';
  version: string;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: (config: Record<string, unknown>) => validateEnv(config),
      }),
    ],
    providers: [
      HealthService,
      {
        provide: PrismaService,
        useValue: { dbHealth: vi.fn(() => Promise.resolve(db)) },
      },
    ],
  }).compile();

  const health = moduleRef.get(HealthService);
  const body = await health.getHealth();
  await moduleRef.close();
  return body;
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
});
