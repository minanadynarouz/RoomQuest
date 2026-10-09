import {
  DIRECTOR_BUDGET_MS,
  PROCEDURAL_RESERVE_MS,
} from './director.constants';

export interface DirectorDeadline {
  readonly signal: AbortSignal;
  readonly startedMs: number;
  readonly budgetMs: number;
  /** Milliseconds left until the whole-request 7 s wall. */
  remainingMs(): number;
  /**
   * Milliseconds left until LLM work is aborted, leaving the procedural
   * reserve so generatePlan can still run inside the budget.
   */
  remainingForLlm(): number;
  /** True when an LLM call that needs at least `minRemainingMs` may start. */
  canStartLlm(minRemainingMs: number): boolean;
  dispose(): void;
}

export interface CreateDirectorDeadlineOptions {
  budgetMs?: number;
  proceduralReserveMs?: number;
  now?: () => number;
  startedMs?: number;
}

/**
 * One deadline shared by every director step. The AbortSignal fires at
 * `budgetMs - proceduralReserveMs` so generatePlan always has time left.
 */
export function createDirectorDeadline(
  options: CreateDirectorDeadlineOptions = {}
): DirectorDeadline {
  const now = options.now ?? Date.now;
  const startedMs = options.startedMs ?? now();
  const budgetMs = options.budgetMs ?? DIRECTOR_BUDGET_MS;
  const reserveMs = Math.min(
    options.proceduralReserveMs ?? PROCEDURAL_RESERVE_MS,
    budgetMs
  );
  const llmWindowMs = Math.max(0, budgetMs - reserveMs);
  const controller = new AbortController();

  const elapsedMs = (): number => Math.max(0, now() - startedMs);
  const remainingMs = (): number => Math.max(0, budgetMs - elapsedMs());
  const remainingForLlm = (): number => Math.max(0, llmWindowMs - elapsedMs());

  const abortIn = remainingForLlm();
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (abortIn <= 0) {
    controller.abort();
  } else {
    timer = setTimeout(() => {
      controller.abort();
    }, abortIn);
  }

  return {
    signal: controller.signal,
    startedMs,
    budgetMs,
    remainingMs,
    remainingForLlm,
    canStartLlm(minRemainingMs: number): boolean {
      return !controller.signal.aborted && remainingForLlm() >= minRemainingMs;
    },
    dispose(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
