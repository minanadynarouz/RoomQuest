import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { assignRequestId, requestIdFrom } from './request-id';

function reqWith(header: string | string[] | undefined): IncomingMessage {
  return { headers: { 'x-request-id': header } } as unknown as IncomingMessage;
}

describe('requestIdFrom', () => {
  it('returns the incoming header', () => {
    expect(requestIdFrom(reqWith('incoming-id'))).toBe('incoming-id');
  });

  it('uses the first value of a multi-value header', () => {
    expect(requestIdFrom(reqWith(['first', 'second']))).toBe('first');
  });

  it('generates a UUID when the header is missing', () => {
    expect(requestIdFrom(reqWith(undefined))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});

describe('assignRequestId', () => {
  it('writes the same id onto the request and response', () => {
    const req = reqWith('echo-me');
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as ServerResponse;

    const id = assignRequestId(req, res);
    expect(id).toBe('echo-me');
    expect(req.headers['x-request-id']).toBe('echo-me');
    expect(headers['X-Request-Id']).toBe('echo-me');
  });
});
