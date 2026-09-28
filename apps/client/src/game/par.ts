/**
 * Default par time helper - F-02
 * 
 * Returns a documented constant (180000ms = 3 minutes) for now.
 * This is a placeholder until the backend's level-core provides
 * a deterministic par time calculation based on level structure.
 * 
 * @param _plan - Level plan (unused for now, reserved for future use)
 * @returns Par time in milliseconds
 */
export function defaultParTimeMs(_plan?: unknown): number {
  // 3 minutes - consistent with the 3-6 minute target session length
  return 180000;
}
