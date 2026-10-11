import {
  candidateRoutes,
  generatePlan,
  validatePlan,
} from '@roomquest/level-core';
import { LevelRequest } from '@roomquest/schema';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DIRECTOR_MODEL } from '../src/director/director.constants';
import {
  defaultDirectorChatFactory,
  wrapChatModel,
} from '../src/director/models';
import {
  DEFAULT_DIRECTOR_THINKING_ID,
  resolveDirectorThinkingId,
  thinkingVariantById,
} from '../src/director/thinking';
import { PROMPT_VERSION } from '../src/director/prompts';
import { runDirector } from '../src/director/run-director';
import {
  planToLlmJson,
  planToSlotLlmJson,
  mockDecorationJson,
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
import { planVariety } from './variety';

export type { EvalHarnessOptions } from './options';

/** Live reports keep the first-try candidate for offline Gemini re-checks. */
export function livePlanDump(
  mock: boolean,
  firstTryPlan: unknown,
  firstTryRawText: string | null
): { firstTryPlan?: unknown; firstTryRawText?: string | null } {
  if (mock) {
    return {};
  }
  return { firstTryPlan, firstTryRawText };
}

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

/** Gemini bills thinking tokens at the output rate. */
function runCost(telemetry: readonly LlmCallTelemetry[]): number {
  let usd = 0;
  for (const row of telemetry) {
    const thoughts = row.thoughtsTokenCount ?? row.thinkingTokens ?? 0;
    const output =
      row.outputTokens === null ? null : row.outputTokens + thoughts;
    usd += estimateCallCostUsd(row.model, row.inputTokens, output).usd;
  }
  return usd;
}

export const LIVE_FLAG_REQUIRED_REASON = [
  'Live eval needs an explicit --live flag (it spends the Gemini budget).',
  'Pass --mock to exercise the director pipeline with FakeListChatModel (no keys required).',
].join('\n');

export function classifySource(source: EvalRunRecord['source']): {
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
 * Run the director over rooms × tiers × seeds by calling `runDirector`
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

  if (options.mock && options.live === true) {
    throw new Error('Pass either --mock or --live, not both');
  }

  if (!options.mock && options.live !== true) {
    return {
      status: 'skipped',
      reason: LIVE_FLAG_REQUIRED_REASON,
      missingKeys: [],
    };
  }

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

  const thinkingId = resolveDirectorThinkingId(
    options.thinking ?? process.env.DIRECTOR_THINKING
  );
  const thinkingVariant = thinkingVariantById(thinkingId);

  const livePrimary =
    !options.mock && googleApiKey !== undefined
      ? wrapChatModel(
          defaultDirectorChatFactory.createPrimary({
            model: directorModel,
            apiKey: googleApiKey,
            thinking: thinkingVariant?.config,
          }),
          'google',
          directorModel
        )
      : undefined;

  const placements = options.placements ?? ['uv'];
  if (placements.length === 0) {
    throw new Error('Eval harness needs at least one placement arm');
  }

  // Round-robin: rooms vary fastest, then tiers, then seeds, then placement
  // arms, so a short `--runs N` still spreads across every room.
  const cells: {
    room: (typeof rooms)[number];
    date: string;
    tier: (typeof tiers)[number];
    placement: 'uv' | 'slot' | 'route';
  }[] = [];
  for (const placement of placements) {
    for (const date of seedDates) {
      for (const tier of tiers) {
        for (const room of rooms) {
          cells.push({ room, date, tier, placement });
        }
      }
    }
  }
  if (cells.length === 0) {
    throw new Error('Eval harness produced an empty run matrix');
  }

  const total = options.runCount ?? cells.length;
  const runs: EvalRunRecord[] = [];

  for (let i = 0; i < total; i += 1) {
    const cell = cells[i % cells.length];
    if (cell === undefined) {
      throw new Error('Eval harness: run matrix index out of range');
    }
    const { room, date, tier, placement } = cell;
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
              placement === 'route'
                ? mockDecorationJson(
                    candidateRoutes(room.graph, { seed, tier })
                  )
                : placement === 'slot'
                ? planToSlotLlmJson(
                    generatePlan(room.graph, seed, tier),
                    room.graph,
                    seed
                  )
                : planToLlmJson(generatePlan(room.graph, seed, tier)),
            ],
          }),
          'google',
          directorModel
        )
      : livePrimary;

    if (primary === undefined) {
      throw new Error('Eval harness: live primary chat model was not created');
    }

    const outcome = await runDirector(request, {
      primary,
      now,
      logger,
      placement,
    });

    const fallbackReason =
      outcome.response.source === 'procedural'
        ? outcome.response.fallbackReason
        : 'none';
    if (fallbackReason === undefined || fallbackReason.length === 0) {
      throw new Error(
        `Eval harness: procedural run without fallbackReason (room=${room.id} tier=${tier} date=${date} placement=${placement})`
      );
    }

    const flags = classifySource(outcome.response.source);
    const ttfts = outcome.telemetry
      .map((row) => row.ttftMs)
      .filter((value): value is number => value !== null);
    const variety = planVariety(outcome.response.plan, room.graph);
    const liveFirstTry = livePlanDump(
      options.mock,
      outcome.firstTryPlan,
      outcome.firstTryRawText
    );
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
      ttftMs: ttfts.length > 0 ? ttfts.reduce((a, b) => a + b, 0) : null,
      repairs: [...outcome.response.repairs],
      relaxed: [
        ...(outcome.response.relaxed ??
          validatePlan(outcome.response.plan, room.graph).relaxed),
      ],
      estimatedCostUsd: runCost(outcome.telemetry),
      telemetry: outcome.telemetry.map((row) => ({ ...row })),
      distinctSurfaces: variety.distinctSurfaces,
      distinctPieceTypes: variety.distinctPieceTypes,
      pieceTypes: variety.pieceTypes,
      surfaceLabels: variety.surfaceLabels,
      issuesFirstTry: outcome.validation.firstTry,
      issuesAfterLocal: outcome.validation.afterLocal,
      issuesAfterLlmRepair: outcome.validation.afterLlmRepair,
      repairedBy: outcome.repairedBy,
      placement: outcome.placement,
      requestedPlacement: placement,
      fallbackReason,
      stage: outcome.stage,
      failedAt: outcome.failedAt,
      lineCount: outcome.response.lines?.length ?? 0,
      droppedLines: outcome.routeDecoration?.droppedLines ?? 0,
      bannedWordHits: outcome.routeDecoration?.bannedWordHits ?? 0,
      ...liveFirstTry,
    });
  }

  const aggregate = aggregateRuns(runs);
  const generatedAt = new Date(now()).toISOString();
  const report = EvalReportSchema.parse({
    generatedAt,
    mock: options.mock,
    promptVersion: PROMPT_VERSION,
    directorModel,
    thinking: thinkingVariant?.label ?? DEFAULT_DIRECTOR_THINKING_ID,
    roomIds: rooms.map((room) => room.id),
    seedDates: [...seedDates],
    tiers: [...tiers],
    placements: [...placements],
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
  const thinkingFileId = thinkingVariant?.id ?? DEFAULT_DIRECTOR_THINKING_ID;
  const placementSuffix =
    placements.length === 1 && placements[0] === 'uv'
      ? ''
      : `-${placements.join('+')}`;
  const suffix =
    (thinkingFileId === DEFAULT_DIRECTOR_THINKING_ID
      ? ''
      : `-${thinkingFileId}`) + placementSuffix;
  const markdownPath = join(outDir, `${stamp}${suffix}.md`);
  const jsonPath = join(outDir, `${stamp}${suffix}.json`);
  writeFileSync(markdownPath, renderMarkdown(report), 'utf8');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { status: 'ok', report, markdownPath, jsonPath };
}
