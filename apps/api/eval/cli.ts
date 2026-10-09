import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
import type { DirectorLogger } from '../src/director/telemetry';
import { parseEvalArgs } from './args';
import { runEvalHarness } from './harness';
import { findRepoRoot } from './paths';
import { printSummary } from './report';

const consoleLogger: DirectorLogger = {
  log: (message: string): void => {
    console.log(message);
  },
  warn: (message: string): void => {
    console.warn(message);
  },
  debug: (message: string): void => {
    console.debug(message);
  },
};

function loadEnvFiles(repoRoot: string): void {
  loadDotenv({ path: join(repoRoot, '.env'), quiet: true });
  loadDotenv({ path: join(repoRoot, 'apps', 'api', '.env'), quiet: true });
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot(__dirname);
  loadEnvFiles(repoRoot);
  const options = parseEvalArgs(process.argv.slice(2));
  const result = await runEvalHarness({
    ...options,
    repoRoot,
    logger: consoleLogger,
  });

  if (result.status === 'skipped') {
    console.error(result.reason);
    return;
  }

  printSummary(result.report);
  if (result.markdownPath !== undefined) {
    console.log(`wrote ${result.markdownPath}`);
  }
  if (result.jsonPath !== undefined) {
    console.log(`wrote ${result.jsonPath}`);
  }
}

void main().catch((err: unknown) => {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(message);
  process.exitCode = 1;
});
