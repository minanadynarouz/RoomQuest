import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const apiRoot = process.cwd();

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

/** Keys validated by Nest at startup (`apps/api/src/config/env.ts`). */
const NEST_ENV_KEYS = [
  'PORT',
  'NODE_ENV',
  'DIRECTOR_MODE',
  'CORS_ORIGINS',
  'GIT_SHA',
  'GOOGLE_API_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'DIRECTOR_MODEL',
] as const;

/** Render injects PORT; NODE_VERSION is a native runtime pin, not Nest. */
const RENDER_DECLARED_KEYS = NEST_ENV_KEYS.filter((key) => key !== 'PORT');

describe('API env var inventory', () => {
  const envTs = readFileSync(path.join(apiRoot, 'src/config/env.ts'), 'utf8');
  const renderYaml = read('render.yaml');
  const rootExample = read('.env.example');
  const apiExample = read('apps/api/.env.example');
  const apiDocs = read('docs/api.md');
  const deployDocs = read('docs/deploy-api.md');

  it('env.ts still lists the expected Nest keys', () => {
    for (const key of NEST_ENV_KEYS) {
      expect(envTs).toContain(`${key}:`);
    }
  });

  it('lists every Nest-read key in render.yaml (except PORT), .env.example, and docs/api.md', () => {
    for (const key of RENDER_DECLARED_KEYS) {
      expect(renderYaml).toContain(`key: ${key}`);
    }
    expect(renderYaml).not.toContain('key: PORT');

    for (const key of NEST_ENV_KEYS) {
      expect(rootExample).toContain(`${key}=`);
      expect(apiExample).toContain(`${key}=`);
      expect(apiDocs).toContain(`\`${key}\``);
    }
  });

  it('documents NODE_VERSION, TEST_DATABASE_URL, and the smoke script', () => {
    expect(renderYaml).toContain('key: NODE_VERSION');
    expect(rootExample).toContain('NODE_VERSION');
    expect(apiExample).toContain('NODE_VERSION');
    expect(apiDocs).toContain('`NODE_VERSION`');
    expect(apiDocs).toContain('`TEST_DATABASE_URL`');
    expect(deployDocs).toContain('pnpm --filter api smoke');
    expect(deployDocs).toContain('db:migrate:deploy');
  });
});
