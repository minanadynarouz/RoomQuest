/**
 * Before/after of server time from request start to the first Gemini invoke,
 * with mocked DB latency (no Postgres/Docker on this box) and a stubbed
 * model transport. Usage: tsx scripts/profile-precall-io.ts
 */
import { performance } from 'node:perf_hooks';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { LevelRequest } from '@roomquest/schema';
import { defaultDirectorChatFactory, wrapChatModel } from '../src/director/models';
import { runDirector } from '../src/director/run-director';
import type { StructuredChat } from '../src/director/structured-chat';

const COLD_DB_MS = Number(process.env.COLD_DB_MS ?? 1500); // Neon resume / first connect
const WARM_DB_MS = Number(process.env.WARM_DB_MS ?? 40); // one Postgres round trip
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const silent = { log: () => undefined, warn: () => undefined, debug: () => undefined };

function stubbed(chat: StructuredChat, onInvoke: () => void): StructuredChat {
  return {
    ...chat,
    invokeStructured: () => {
      onInvoke();
      return Promise.reject(new Error('stub'));
    },
  };
}

const newChat = () =>
  wrapChatModel(
    defaultDirectorChatFactory.createPrimary({
      model: 'gemini-3.8-flash',
      apiKey: 'test-profile',
      thinking: { thinkingLevel: 'MINIMAL' },
    }),
    'google',
    'gemini-3.8-flash'
  );

async function once(mode: 'before' | 'after', firstQuery: boolean, roomId: string, shared: StructuredChat) {
  const request = LevelRequest.parse({ graph: IWER_GRAPHS[roomId as 'living_room'], date: '2026-10-14', tier: 'easy' });
  const t0 = performance.now();
  await sleep(firstQuery ? COLD_DB_MS : WARM_DB_MS); // cache lookup (miss)
  let invokedAt = 0;
  if (mode === 'before') {
    await sleep(WARM_DB_MS); // daily counter consume, sequential
    const primary = newChat(); // rebuilt per request
    const decoration = newChat();
    await runDirector(request, {
      primary,
      decoration: stubbed(decoration, () => (invokedAt = performance.now())),
      placement: 'route',
      logger: silent,
    });
  } else {
    const gate = sleep(WARM_DB_MS).then(() => true); // overlaps prep
    await runDirector(request, {
      primary: shared,
      decoration: stubbed(shared, () => (invokedAt = performance.now())),
      placement: 'route',
      logger: silent,
      llmGate: gate,
    });
  }
  return invokedAt - t0;
}

async function main() {
  const shared = newChat();
  const rows: Record<string, string>[] = [];
  for (const mode of ['before', 'after'] as const) {
    let first = true;
    for (const pass of ['cold', 'warm'] as const) {
      for (const roomId of IWER_ROOM_IDS) {
        const ms = await once(mode, first, roomId, shared);
        rows.push({ mode, pass, room: roomId, firstDbQuery: first ? 'yes' : 'no', startOffsetMs: ms.toFixed(1) });
        first = false;
      }
    }
  }
  console.log(`mock DB latency: cold first query ${String(COLD_DB_MS)} ms, warm round trip ${String(WARM_DB_MS)} ms`);
  console.table(rows);
}
void main();
