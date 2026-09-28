/**
 * Stars formula - F-02
 * Pure function for calculating star rating
 */

/**
 * Calculate star rating based on time and gems
 * 
 * Rules from spec:
 * - 3 stars if time ≤ par AND gems ≥ 3
 * - 2 stars if either condition holds (time ≤ par OR gems ≥ 3)
 * - 1 star otherwise
 * 
 * @param timeMs - Completion time in milliseconds
 * @param parTimeMs - Par time in milliseconds
 * @param gemsCollected - Number of gems collected
 * @returns Star rating (1, 2, or 3)
 */
export function calculateStars(
  timeMs: number,
  parTimeMs: number,
  gemsCollected: number,
): 1 | 2 | 3 {
  const timeCondition = timeMs <= parTimeMs;
  const gemsCondition = gemsCollected >= 3;

  if (timeCondition && gemsCondition) {
    return 3;
  }

  if (timeCondition || gemsCondition) {
    return 2;
  }

  return 1;
}
