import type { Tier } from '@roomquest/schema';
import type { DirectorLogger } from '../src/director/telemetry';

export interface EvalHarnessOptions {
  mock: boolean;
  /** Live Gemini requires an explicit `--live` flag (and a key). */
  live?: boolean;
  /** Placement arms (`--placement uv|slot|both`); default `['uv']`. */
  placements?: readonly ('uv' | 'slot')[];
  roomLimit?: number;
  seedLimit?: number;
  tiers?: readonly Tier[];
  now?: () => number;
  write?: boolean;
  outDir?: string;
  repoRoot?: string;
  logger?: DirectorLogger;
  googleApiKey?: string;
  directorModel?: string;
  thinking?: string;
  runCount?: number;
}
