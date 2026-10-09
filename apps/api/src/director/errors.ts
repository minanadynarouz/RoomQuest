export class DirectorTimeoutError extends Error {
  constructor(message = 'Director budget exceeded') {
    super(message);
    this.name = 'AbortError';
  }
}

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof DirectorTimeoutError) {
    return true;
  }
  if (typeof err === 'object' && err !== null && 'name' in err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return true;
    }
  }
  if (err instanceof Error && /aborted|timeout/i.test(err.message)) {
    return true;
  }
  return false;
}

export async function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    throw new DirectorTimeoutError();
  }
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new DirectorTimeoutError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    if (onAbort !== undefined) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
