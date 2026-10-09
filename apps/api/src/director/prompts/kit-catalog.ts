import { KIT_CATALOG, PIECE_IDS } from '@roomquest/schema';

function formatAllowed(
  allowed: readonly string[] | null | undefined
): string {
  if (allowed === null || allowed === undefined) {
    return 'any horizontal surface';
  }
  return allowed.join('/');
}

function formatPiece(id: (typeof PIECE_IDS)[number]): string {
  const piece = KIT_CATALOG[id];
  const bits: string[] = [
    `${piece.id}: ${piece.role}.`,
    `interaction=${piece.interaction}.`,
    `surfaces=${formatAllowed(piece.allowedSurfaces)}.`,
  ];
  if (piece.minArea !== undefined) {
    bits.push(`minArea=${String(piece.minArea)}m².`);
  }
  if (piece.minHeight !== undefined) {
    bits.push(`minHeight=${String(piece.minHeight)}m.`);
  }
  if (piece.maxHeight !== undefined) {
    bits.push(`maxHeight=${String(piece.maxHeight)}m.`);
  }
  if (piece.minGap !== undefined) {
    bits.push(`minGap=${String(piece.minGap)}m.`);
  }
  if (piece.maxGap !== undefined) {
    bits.push(`maxGap=${String(piece.maxGap)}m.`);
  }
  if (piece.maxDeltaHeight !== undefined) {
    bits.push(`maxDeltaHeight=${String(piece.maxDeltaHeight)}m.`);
  }
  if (piece.maxAngleFromForward !== undefined) {
    bits.push(`maxAngleFromForward=${String(piece.maxAngleFromForward)}°.`);
  }
  if (piece.maxReachDistance !== undefined) {
    bits.push(`maxReachDistance=${String(piece.maxReachDistance)}m.`);
  }
  if (piece.requiresSecondSurface === true) {
    bits.push('requires second surface (`to`).');
  }
  if (piece.maxPerLevel !== undefined) {
    bits.push(`maxPerLevel=${String(piece.maxPerLevel)}.`);
  }
  if (piece.mustBeOnPath === true) {
    bits.push('mustBeOnPath.');
  }
  return `- ${bits.join(' ')}`;
}

/**
 * Byte-stable kit listing. Built once at module load from KIT_CATALOG so
 * provider prompt caching sees the same prefix on every request.
 */
export const KIT_CATALOG_PROMPT: string = PIECE_IDS.map(formatPiece).join(
  '\n'
);
