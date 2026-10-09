import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdFrom(req: IncomingMessage): string {
  const header = req.headers[REQUEST_ID_HEADER];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  const first = Array.isArray(header) ? header[0] : undefined;
  if (typeof first === 'string' && first.length > 0) {
    return first;
  }
  return randomUUID();
}

/** Stamp incoming and response headers so 413s (pre-Nest) still echo an id. */
export function assignRequestId(
  req: IncomingMessage,
  res: ServerResponse
): string {
  const id = requestIdFrom(req);
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader('X-Request-Id', id);
  return id;
}
