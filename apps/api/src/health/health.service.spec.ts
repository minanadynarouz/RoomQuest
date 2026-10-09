import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

async function healthWithPing(ping: () => Promise<boolean>): Promise<{
  db: 'ok' | 'down';
  status: 'ok';
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
        useValue: { ping: vi.fn(ping) },
      },
    ],
  }).compile();

  const health = moduleRef.get(HealthService);
  const body = await health.getHealth();
  await moduleRef.close();
  return body;
}

describe('HealthService', () => {
  it("reports db:'ok' when the Prisma ping succeeds", async () => {
    const body = await healthWithPing(() => Promise.resolve(true));
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
  });

  it("reports db:'down' when the Prisma ping fails", async () => {
    const body = await healthWithPing(() => Promise.resolve(false));
    expect(body.status).toBe('ok');
    expect(body.db).toBe('down');
  });
});
