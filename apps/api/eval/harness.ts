import { generatePlan, validatePlan } from '@roomquest/level-core';
import { LevelRequest } from '@roomquest/schema';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DIRECTOR_MODEL } from '../src/director/director.constants';
import {
  defaultDirectorChatFactory,
  wrapChatModel,
} from '../src/director/models';
import { PROMPT_VERSION } from '../src/director/prompts';
import { runDirector } from '../src/director/run-director';
import {
  planToLlmJson,
  silentLogger,
  structuredFromFake,
  UsageFakeListChatModel,
} from '../src/director/test-fakes';
import type { LlmCallTelemetry } from '../src/director/telemetry';
import { makeDailySeed } from '../src/levels/daily-seed';
import {
  EVAL_MAX_ROOMS,
  EVAL_REPORT_DIR_SEGMENTS,
  EVAL_SEED_DATES,
  EVAL_TIERS,
} from './constants';
import type { EvalHarnessOptions } from './options';
import { findRepoRoot } from './paths';
import { estimateCallCostUsd } from './prices';
import {
  aggregateRuns,
  evaluateBar,
  EvalReportSchema,
  renderMarkdown,
  type EvalReport,
  type EvalRunRecord,
} from './report';
import { loadEvalRooms } from './rooms';

export type { EvalHarnessOptions } from './options';

export type EvalHarnessResult =
  | {
      status: 'ok';
      report: EvalReport;
      markdownPath?: string;
      jsonPath?: string;
    }
  | { status: 'skipped'; reason: string; missingKeys: string[] };

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function resolveKey(
  explicit: string | undefined,
  provided: boolean,
  envName: 'GOOGLE_API_KEY'
): string | undefined {
  if (provided) {
    return nonEmpty(explicit);
  }
  return nonEmpty(process.env[envName]);
}

function runCost(telemetry: readonly LlmCallTelemetry[]): number {
  let usd = 0;
  for (const row of telemetry) {
    usd += estimateCallCostUsd(
      row.model,
      row.inputTokens,
      row.outputTokens
    ).usd;
  }
  return usd;
}

function classifySource(source: EvalRunRecord['source']): {
  validBeforeRepair: boolean;
  validAfterRepair: boolean;
  fallbackToProcedural: boolean;
} {
  if (source === 'llm') {
    return {
      validBeforeRepair: true,
      validAfterRepair: true,
      fallbackToProcedural: false,
    };
  }
  if (source === 'llm_repaired') {
    return {
      validBeforeRepair: false,
      validAfterRepair: true,
      fallbackToProcedural: false,
    };
  }
  return {
    validBeforeRepair: false,
    validAfterRepair: false,
    fallbackToProcedural: true,
  };
}

export function skipReason(missingKeys: string[]): string {
  const listed = missingKeys.join(' / ');
  return [
    `${listed} missing. Live eval skipped.`,
    'Pass --mock to exercise the director pipeline with FakeListChatModel (no keys required).',
    'Never hardcode API keys.',
  ].join('\n');
}

/**
 * Run the director over rooms × seeds × tiers by calling `runDirector`
 * directly (no HTTP, cache, or rate limits).
 */
export async function runEvalHarness(
  options: EvalHarnessOptions
): Promise<EvalHarnessResult> {
  const now = options.now ?? (() => Date.now());
  const logger = options.logger ?? silentLogger;
  const repoRoot = options.repoRoot ?? findRepoRoot(__dirname);
  const directorModel =
    nonEmpty(options.directorModel) ??
    nonEmpty(process.env.DIRECTOR_MODEL) ??
    DEFAULT_DIRECTOR_MODEL;

  const googleApiKey = resolveKey(
    options.googleApiKey,
    Object.hasOwn(options, 'googleApiKey'),
    'GOOGLE_API_KEY'
  );

  if (!options.mock && googleApiKey === undefined) {
    const missingKeys = ['GOOGLE_API_KEY'];
    return {
      status: 'skipped',
      reason: skipReason(missingKeys),
      missingKeys,
    };
  }

  const roomLimit = options.roomLimit ?? EVAL_MAX_ROOMS;
  const rooms = loadEvalRooms(repoRoot, logger, roomLimit);
  if (rooms.length === 0) {
    throw new Error('Eval harness found no room fixtures');
  }

  const seedDates = EVAL_SEED_DATES.slice(
    0,
    Math.max(1, options.seedLimit ?? EVAL_SEED_DATES.length)
  );
  const tiers = options.tiers ?? EVAL_TIERS;
  if (tiers.length === 0) {
    throw new Error('Eval harness needs at least one tier');
  }

  const livePrimary =
    !options.mock && googleApiKey !== undefined
      ? wrapChatModel(
          defaultDirectorChatFactory.createPrimary({
            model: directorModel,
            apiKey: googleApiKey,
          }),
          'google',
          directorModel
        )
      : undefined;

  const runs: EvalRunRecord[] = [];

  for (const room of rooms) {
    for (const date of seedDates) {
      for (const tier of tiers) {
        const seed = makeDailySeed(room.graph.roomHash, date);
        const request = LevelRequest.parse({
          graph: room.graph,
          date,
          tier,
        });

        const primary = options.mock
          ? structuredFromFake(
              new UsageFakeListChatModel({
                responses: [
                  planToLlmJson(generatePlan(room.graph, seed, tier)),
                ],
              }),
              'google',
              directorModel
            )
          : livePrimary;

        if (primary === undefined) {
          throw new Error(
            'Eval harness: live primary chat model was not created'
          );
        }

        const outcome = await runDirector(request, {
          primary,
          now,
          logger,
        });

        const flags = classifySource(outcome.response.source);
        runs.push({
          roomId: room.id,
          roomHash: room.graph.roomHash,
          date,
          seed,
          tier,
          source: outcome.response.source,
          model: outcome.response.model,
          ...flags,
          latencyMs: outcome.response.latencyMs,
          repairs: [...outcome.response.repairs],
          relaxed: [
            ...(outcome.response.relaxed ??
              validatePlan(outcome.response.plan, room.graph).relaxed),
          ],
          estimatedCostUsd: runCost(outcome.telemetry),
          telemetry: outcome.telemetry.map((row) => ({ ...row })),
        });
      }
    }
  }

  const aggregate = aggregateRuns(runs);
  const generatedAt = new Date(now()).toISOString();
  const report = EvalReportSchema.parse({
    generatedAt,
    mock: options.mock,
    promptVersion: PROMPT_VERSION,
    directorModel,
    roomIds: rooms.map((room) => room.id),
    seedDates: [...seedDates],
    tiers: [...tiers],
    bar: evaluateBar(aggregate),
    aggregate,
    runs,
  });

  if (options.write !== true) {
    return { status: 'ok', report };
  }

  const outDir = options.outDir ?? join(repoRoot, ...EVAL_REPORT_DIR_SEGMENTS);
  mkdirSync(outDir, { recursive: true });
  const stamp = generatedAt.slice(0, 10);
  const markdownPath = join(outDir, `${stamp}.md`);
  const jsonPath = join(outDir, `${stamp}.json`);
  writeFileSync(markdownPath, renderMarkdown(report), 'utf8');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { status: 'ok', report, markdownPath, jsonPath };
}
