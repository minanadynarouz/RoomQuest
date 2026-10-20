/**
 * Ask a DB-backed dependency whether the next query is the process's first
 * (connection setup / Neon resume). Mocks without the method count as warm.
 */
export function claimFirstQuery(dep: { claimFirstQuery?: () => boolean }): boolean {
  return dep.claimFirstQuery?.() ?? false;
}

/** Breakdown key for a DB stage: `<name>ColdMs` for the first query, else `<name>Ms`. */
export function dbStageKey(name: string, cold: boolean): string {
  return cold ? `${name}ColdMs` : `${name}Ms`;
}

export function roundMs(ms: number): number {
  return Math.round(ms * 10) / 10;
}
