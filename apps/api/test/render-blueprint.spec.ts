import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const yaml = readFileSync(
  path.resolve(process.cwd(), '../../render.yaml'),
  'utf8'
);

describe('render.yaml (B-10)', () => {
  it('declares both API services with Node 22, health checks, and autoDeploy off', () => {
    expect(yaml).toContain('name: roomquest-api-staging');
    expect(yaml).toContain('name: roomquest-api-prod');
    expect(yaml).toContain('runtime: node');
    expect(yaml).toContain('region: frankfurt');
    expect(yaml).toContain('autoDeploy: false');
    expect(yaml).toContain('healthCheckPath: /api/health');
    expect(yaml).toContain(
      'buildCommand: corepack enable && pnpm i --frozen-lockfile && pnpm turbo run build --filter=api... && pnpm --filter api db:migrate:deploy'
    );
    expect(yaml).toContain('startCommand: node apps/api/dist/main.js');
    expect(yaml).toContain('db:migrate:deploy');
    expect(yaml).toContain("value: '22'");
  });

  it('lists secret env keys with sync: false and no secret values', () => {
    const secretKeys = [
      'DATABASE_URL',
      'DIRECT_URL',
      'GOOGLE_API_KEY',
      'DIRECTOR_MODE',
      'DIRECTOR_MODEL',
      'DIRECTOR_THINKING',
      'CORS_ORIGINS',
      'NODE_ENV',
      'GIT_SHA',
    ];
    for (const key of secretKeys) {
      expect(yaml).toContain(`key: ${key}`);
    }
    expect(yaml).toMatch(/key: DATABASE_URL\s+sync: false/);
    expect(yaml).not.toMatch(/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i);
    expect(yaml).not.toMatch(/sk-[A-Za-z0-9]+/);
  });
});
