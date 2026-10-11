import type { Tier } from '@roomquest/schema';
import type { DirectorLogger } from '../src/director/telemetry';

export interface EvalHarnessOptions {
  mock: boolean;
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
