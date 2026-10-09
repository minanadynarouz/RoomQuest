import { execFileSync } from 'node:child_process';

function runCompose(repoRoot: string, args: string[], useSudo: boolean): void {
  const file = useSudo ? 'sudo' : 'docker';
  const argv = useSudo ? ['docker', 'compose', ...args] : ['compose', ...args];
  execFileSync(file, argv, {
    cwd: repoRoot,
    stdio: 'pipe',
    timeout: 30_000,
  });
}

function tryCompose(repoRoot: string, args: string[]): void {
  try {
    runCompose(repoRoot, args, false);
  } catch (first) {
    try {
      runCompose(repoRoot, args, true);
    } catch {
      const message = first instanceof Error ? first.message : 'unknown error';
      throw new Error(`docker compose ${args.join(' ')} failed: ${message}`);
    }
  }
}

/** Stop the compose `postgres` service (local docker only). */
export function stopComposePostgres(repoRoot: string): void {
  tryCompose(repoRoot, ['stop', 'postgres']);
}

/** Start it again so a local smoke run does not leave Postgres down. */
export function startComposePostgres(repoRoot: string): void {
  tryCompose(repoRoot, ['start', 'postgres']);
}
