import { DEFAULT_BASE_URL } from './constants';

export interface SmokeOptions {
  /** Bare origin, no trailing slash (e.g. `http://localhost:3000`). */
  baseUrl: string;
  /**
   * Stop local docker compose Postgres after the live-DB checks and assert
   * health `db:"down"` plus `/levels` still 200. Never used against a remote
   * `BASE_URL`.
   */
  stopPostgres: boolean;
}

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return argv[index + 1];
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/u, '');
}

export function isLocalBaseUrl(baseUrl: string): boolean {
  const host = new URL(baseUrl).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function parseBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid BASE_URL "${raw}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`BASE_URL must be http(s) (got ${parsed.protocol})`);
  }
  return stripTrailingSlash(parsed.origin === 'null' ? raw : parsed.origin);
}

/**
 * Resolve smoke options from argv + env.
 * `--base-url` wins over `BASE_URL`, which wins over localhost.
 * `--stop-postgres` / `SMOKE_STOP_POSTGRES=1` enable the local db-down check;
 * `--no-stop-postgres` wins over the env flag.
 */
export function parseSmokeArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): SmokeOptions {
  const args = argv.filter((item) => item !== '--');
  const flagUrl = flagValue(args, '--base-url');
  const envUrl = env.BASE_URL;
  const raw =
    flagUrl ??
    (envUrl !== undefined && envUrl.length > 0 ? envUrl : DEFAULT_BASE_URL);
  const baseUrl = parseBaseUrl(raw);

  let stopPostgres = env.SMOKE_STOP_POSTGRES === '1';
  if (args.includes('--stop-postgres')) {
    stopPostgres = true;
  }
  if (args.includes('--no-stop-postgres')) {
    stopPostgres = false;
  }

  if (stopPostgres && !isLocalBaseUrl(baseUrl)) {
    throw new Error(
      '--stop-postgres / SMOKE_STOP_POSTGRES is only allowed for a localhost BASE_URL'
    );
  }

  return { baseUrl, stopPostgres };
}
