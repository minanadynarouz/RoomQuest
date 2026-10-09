import { REQUEST_TIMEOUT_MS } from './constants';

export interface SmokeResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function smokeRequest(
  url: string,
  init: RequestInit = {}
): Promise<SmokeResponse> {
  const res = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return {
    status: res.status,
    headers: res.headers,
    body: await parseBody(res),
  };
}

export function header(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? undefined;
}
