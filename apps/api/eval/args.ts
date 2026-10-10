import type { Tier } from '@roomquest/schema';
import {
  DIRECTOR_PLACEMENTS,
  isDirectorPlacement,
  resolveDirectorPlacement,
  type DirectorPlacement,
} from '../src/director/placement';
import { EVAL_DEFAULT_RUNS, EVAL_TIERS } from './constants';
import type { EvalHarnessOptions } from './options';

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return argv[index + 1];
}

function parsePositiveInt(
  raw: string | undefined,
  label: string
): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function isTier(value: string): value is Tier {
  for (const tier of EVAL_TIERS) {
    if (tier === value) {
      return true;
    }
  }
  return false;
}

function parsePlacements(
  raw: string | undefined
): readonly DirectorPlacement[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === 'all') {
    return [...DIRECTOR_PLACEMENTS];
  }
  const placements: DirectorPlacement[] = [];
  for (const part of raw.split(',').map((item) => item.trim())) {
    if (!isDirectorPlacement(part)) {
      throw new Error(`Unknown placement "${part}" (use uv, slot, or all)`);
    }
    placements.push(part);
  }
  return placements;
}

function parseTiers(raw: string | undefined): readonly Tier[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === 'all') {
    return EVAL_TIERS;
  }
  const tiers: Tier[] = [];
  for (const part of raw.split(',').map((item) => item.trim())) {
    if (!isTier(part)) {
      throw new Error(`Unknown tier "${part}" (use easy, normal, or all)`);
    }
    tiers.push(part);
  }
  return tiers;
}

export function parseEvalArgs(argv: string[]): EvalHarnessOptions {
  const args = argv.filter((item) => item !== '--');
  const rooms = parsePositiveInt(flagValue(args, '--rooms'), '--rooms');
  const seeds = parsePositiveInt(flagValue(args, '--seeds'), '--seeds');
  const runs = parsePositiveInt(flagValue(args, '--runs'), '--runs');
  return {
    mock: args.includes('--mock'),
    roomLimit: rooms,
    seedLimit: seeds,
    tiers: parseTiers(flagValue(args, '--tiers')),
    write: !args.includes('--no-write'),
    outDir: flagValue(args, '--out-dir'),
    thinking: flagValue(args, '--thinking'),
    runCount: runs ?? EVAL_DEFAULT_RUNS,
    placements:
      parsePlacements(flagValue(args, '--placement')) ??
      parsePlacements(flagValue(args, '--placements')) ?? [
        resolveDirectorPlacement(process.env.DIRECTOR_PLACEMENT),
      ],
  };
}
