/**
 * Vercel preview hostnames for this project.
 *
 * Matches hyphen-delimited hostnames whose segments include `roomquest`, e.g.
 * `roomquest.vercel.app`, `roomquest-<hash>-<scope>.vercel.app`,
 * `<branch>-roomquest-<scope>.vercel.app`,
 * `roomquest-git-<branch>-<scope>.vercel.app`.
 */
export const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/(?:[a-z0-9-]+-)*roomquest(?:-[a-z0-9]+)*\.vercel\.app$/i;

/** `https://localhost` with an optional port, per architecture §6. */
export const LOCALHOST_HTTPS_ORIGIN = /^https:\/\/localhost(?::\d+)?$/i;

export function parseCorsOrigins(csv: string): string[] {
  return csv
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function isAllowedOrigin(
  origin: string,
  allowlist: readonly string[]
): boolean {
  if (allowlist.includes(origin)) {
    return true;
  }
  return (
    LOCALHOST_HTTPS_ORIGIN.test(origin) || VERCEL_PREVIEW_ORIGIN.test(origin)
  );
}
