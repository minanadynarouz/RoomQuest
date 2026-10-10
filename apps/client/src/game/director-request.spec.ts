/**
 * In-flight directorRequest transitions for room-reading.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePlan } from '@roomquest/level-core';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import type { LevelResponse } from '@roomquest/schema';
import { createDirectorClient } from './director/client.js';
import { resetHealthPrewarmForTests } from './director/health-prewarm.js';
import type { FetchLike } from './director/types.js';
import { onDirectorRequest } from './on-director-request.js';
import { createGameStore } from './store.js';
import type { DirectorRequestState, GameEvent } from './types.js';

const GRAPH = SYNTHETIC_LIVING_ROOM;

function apiPayload(): LevelResponse {
  const plan = generatePlan(GRAPH, 'f1a2b3c4d5e6-2026-10-09', 'normal');
  return {
    plan,
    source: 'llm',
    cacheKey: 'abcd1234abcd1234',
    model: 'gemini-3.8-flash',
    promptVersion: 'v1',
    latencyMs: 40,
    repairs: [],
  };
}

function headerBag(headers: Record<string, string>) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    get(name: string) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function jsonResponse(
  payload: unknown,
  status = 200,
  headers?: Record<string, string>
): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
    headers: headers ? headerBag(headers) : undefined,
  };
}

function abortingFetch(): FetchLike {
  return (_url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
}

describe('directorRequest transitions', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetHealthPrewarmForTests();
  });

  function wired(
    fetchFn: FetchLike,
    extra?: Partial<Parameters<typeof createDirectorClient>[0]>
  ) {
    const now = 1_000;
    const store = createGameStore({
      clock: {
        now: () => now,
      },
    });
    const seen: DirectorRequestState[] = [];
    const stop = onDirectorRequest(store, (state) => {
      seen.push({ ...state });
    });
    const events: GameEvent['type'][] = [];
    store.subscribeEvents((event) => {
      events.push(event.type);
    });
    const director = createDirectorClient({
      fetch: fetchFn,
      apiBaseUrl: 'http://localhost:3000',
      deviceId: '11111111-2222-4333-8444-555555555555',
      date: '2026-10-09',
      nowMs: () => now,
      onRequestStart: () => {
        store.beginDirectorRequest();
      },
      onRequestEnd: (info) => {
        store.endDirectorRequest(info);
      },
      ...extra,
    });
    return {
      store,
      director,
      seen,
      events,
      stop,
    };
  }

  it('success: requesting then resolved with optional requestId', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(apiPayload(), 200, { 'X-Request-Id': 'req-ok' })
      )
    );
    const { store, director, seen, events, stop } = wired(fetchFn);

    expect(store.directorRequest.value.status).toBe('idle');
    const result = await director.requestPlan(GRAPH);
    stop();

    expect(result.usedFallback).toBe(false);
    expect(store.directorRequest.value).toMatchObject({
      status: 'resolved',
      source: 'llm',
      requestId: 'req-ok',
    });
    expect(seen.map((row) => row.status)).toEqual([
      'idle',
      'requesting',
      'resolved',
    ]);
    expect(events).toEqual([
      'directorRequestStarted',
      'directorRequestEnded',
    ]);
    const ended = store.events.find(
      (event) => event.type === 'directorRequestEnded'
    );
    expect(ended).toMatchObject({
      type: 'directorRequestEnded',
      source: 'llm',
      requestId: 'req-ok',
    });
  });

  it('timeout: requesting then fallback without requestId', async () => {
    const { store, director, seen } = wired(abortingFetch(), { budgetMs: 20 });
    const result = await director.requestPlan(GRAPH);

    expect(result.fallbackReason).toBe('timeout');
    expect(store.directorRequest.value).toMatchObject({
      status: 'fallback',
      source: 'procedural',
      fallbackReason: 'timeout',
    });
    expect(store.directorRequest.value.requestId).toBeUndefined();
    expect(seen.map((row) => row.status)).toEqual([
      'idle',
      'requesting',
      'fallback',
    ]);
  });

  it('cold start: requesting then cold-start-timeout', async () => {
    const { store, director } = wired(abortingFetch(), {
      budgetMs: 20,
      coldStartBudgetMs: 40,
      isHealthPrewarmPending: () => true,
    });
    const result = await director.requestPlan(GRAPH);

    expect(result.fallbackReason).toBe('cold-start-timeout');
    expect(store.directorRequest.value).toMatchObject({
      status: 'fallback',
      source: 'procedural',
      fallbackReason: 'cold-start-timeout',
    });
    expect(store.events.some((event) => event.type === 'directorRequestStarted'))
      .toBe(true);
  });

  it('network error: requesting then fallback', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.reject(new Error('Failed to fetch'))
    );
    const { store, director } = wired(fetchFn);
    const result = await director.requestPlan(GRAPH);

    expect(result.fallbackReason).toBe('network');
    expect(store.directorRequest.value).toMatchObject({
      status: 'fallback',
      source: 'procedural',
      fallbackReason: 'network',
    });
  });

  it('429: requesting then fallback; prefers Retry-After header', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse(
          { retryAfterS: 90 },
          429,
          { 'Retry-After': '12', 'X-Request-Id': 'req-429' }
        )
      )
    );
    const { store, director } = wired(fetchFn);
    const result = await director.requestPlan(GRAPH);

    expect(result.fallbackReason).toBe('rate-limited');
    expect(result.retryAfterS).toBe(12);
    expect(store.directorRequest.value).toMatchObject({
      status: 'fallback',
      source: 'procedural',
      fallbackReason: 'rate-limited',
      requestId: 'req-429',
    });
    const ended = store.events.find(
      (event) => event.type === 'directorRequestEnded'
    );
    expect(ended).toMatchObject({
      requestId: 'req-429',
      fallbackReason: 'rate-limited',
    });
  });

  it('director=off skips the requesting phase', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(apiPayload()))
    );
    const { store, director, seen, events } = wired(fetchFn, {
      directorMode: 'off',
    });
    const result = await director.requestPlan(GRAPH);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.fallbackReason).toBe('director-off');
    expect(store.directorRequest.value).toMatchObject({
      status: 'fallback',
      source: 'procedural',
      fallbackReason: 'director-off',
    });
    expect(seen.map((row) => row.status)).toEqual(['idle', 'fallback']);
    expect(events).toEqual(['directorRequestEnded']);
  });

  it('director=mock skips the requesting phase', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(apiPayload()))
    );
    const { store, director } = wired(fetchFn, { directorMode: 'mock' });
    await director.requestPlan(GRAPH);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(store.directorRequest.value.status).toBe('fallback');
    expect(store.directorRequest.value.fallbackReason).toBe('director-mock');
    expect(
      store.events.some((event) => event.type === 'directorRequestStarted')
    ).toBe(false);
  });

  it('exit resets directorRequest to idle', () => {
    const store = createGameStore();
    store.beginDirectorRequest();
    store.endDirectorRequest({
      status: 'resolved',
      source: 'llm',
      requestId: 'req-x',
    });
    store.exit();
    expect(store.directorRequest.value).toEqual({ status: 'idle' });
  });
});
