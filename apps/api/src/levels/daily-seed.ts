/**
 * Daily seed for generatePlan / the director user message (architecture §6,
 * PRD FR-6). Uses the request `date` (`YYYY-MM-DD`, client local day). A
 * later date produces a different seed; generatePlan stays deterministic
 * for a given seed.
 */
export function makeDailySeed(roomHash: string, date: string): string {
  return `${roomHash}-${date}`;
}
