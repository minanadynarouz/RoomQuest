export const DIRECTOR_PLACEMENTS = ['uv', 'slot'] as const;
export type DirectorPlacement = (typeof DIRECTOR_PLACEMENTS)[number];

export const DEFAULT_DIRECTOR_PLACEMENT: DirectorPlacement = 'uv';

export function isDirectorPlacement(
  value: string
): value is DirectorPlacement {
  return (DIRECTOR_PLACEMENTS as readonly string[]).includes(value);
}

export function resolveDirectorPlacement(
  value: string | undefined
): DirectorPlacement {
  if (value === undefined) {
    return DEFAULT_DIRECTOR_PLACEMENT;
  }
  const trimmed = value.trim().toLowerCase();
  if (isDirectorPlacement(trimmed)) {
    return trimmed;
  }
  throw new Error('DIRECTOR_PLACEMENT must be uv or slot');
}
