import { z } from 'zod';

/**
 * Semver core `MAJOR.MINOR.PATCH` with optional prerelease / build metadata.
 * Architecture §6 only says `<semver>`; this is the conventional grammar.
 */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const LevelHeaders = z.object({
  'x-device-id': z.uuidv4(),
  'x-client-version': z.string().regex(SEMVER),
});

export type LevelHeaders = z.infer<typeof LevelHeaders>;
