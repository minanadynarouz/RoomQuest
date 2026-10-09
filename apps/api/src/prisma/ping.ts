/**
 * Bounded `SELECT 1` helper. Rejects after `timeoutMs` so health checks
 * never hang on a wedged connection. Callers treat a rejection as down.
 */
export async function pingWithTimeout(
  query: () => Promise<unknown>,
  timeoutMs: number
): Promise<boolean> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      query(),
      new Promise<never>((_, reject) => {
        handle = setTimeout(() => {
          reject(new Error(`Prisma ping timed out after ${String(timeoutMs)}ms`));
        }, timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (handle !== undefined) {
      clearTimeout(handle);
    }
  }
}
