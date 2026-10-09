/**
 * USD per 1M tokens for director eval cost estimates (B-07).
 *
 * Sources, checked 2026-10-09:
 * - `gemini-3.8-flash`: Google Gemini Developer API pricing
 *   https://ai.google.dev/gemini-api/docs/pricing — introductory
 *   $0.75 input / $3.75 output through 31 Dec 2026 (standard paid tier;
 *   output includes thinking tokens). Architecture §1.3.
 * - `claude-haiku-4-5`: Anthropic API pricing
 *   https://platform.claude.com/docs/en/about-claude/pricing —
 *   $1.00 input / $5.00 output (standard, not Batch).
 *
 * Estimates ignore cache reads/writes and Batch discounts. Unknown model
 * ids and missing usage metadata contribute $0 and are counted separately.
 */

export interface ModelTokenPrice {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export const MODEL_PRICES_USD_PER_MILLION: Record<string, ModelTokenPrice> = {
  'gemini-3.8-flash': {
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 3.75,
  },
  'claude-haiku-4-5': {
    inputUsdPerMillion: 1.0,
    outputUsdPerMillion: 5.0,
  },
};

export function priceForModel(model: string): ModelTokenPrice | undefined {
  return MODEL_PRICES_USD_PER_MILLION[model];
}

export function estimateCallCostUsd(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null
): { usd: number; missingUsage: boolean; unknownModel: boolean } {
  const price = priceForModel(model);
  const missingUsage = inputTokens === null || outputTokens === null;
  const unknownModel = price === undefined;
  if (missingUsage || price === undefined) {
    return { usd: 0, missingUsage, unknownModel };
  }
  const usd =
    (inputTokens * price.inputUsdPerMillion +
      outputTokens * price.outputUsdPerMillion) /
    1_000_000;
  return { usd, missingUsage: false, unknownModel: false };
}
