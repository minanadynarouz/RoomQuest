# B-08 follow-up — patch notes

## Thinking tokens read 0 at `DIRECTOR_THINKING=low` (diagnosis)

Mocked proof: `apps/api/src/director/thinking-usage.spec.ts` builds a real
`ChatGoogleGenerativeAI` (dummy `test-*` key) and stubs
`client.generateContent` — no network.

1. **thinkingConfig is sent.** The outgoing request carries
   `generationConfig.thinkingConfig = { thinkingLevel: "LOW" }` (and none for
   `DIRECTOR_THINKING=default`). `@langchain/google-genai` 2.3.2 puts
   `this.thinkingConfig` into both the client's base generationConfig and
   `invocationParams().generationConfig`, which overrides it per request.
   So thinking is actually on at LOW.
2. **The usage is dropped by the library.** `convertUsageMetadata` in
   2.3.2 copies only `promptTokenCount → input_tokens`,
   `candidatesTokenCount → output_tokens`, `totalTokenCount → total_tokens`.
   `thoughtsTokenCount` is discarded: there is no
   `usage_metadata.output_token_details.reasoning`, and
   `response_metadata` never gets `usageMetadata`. Our reader therefore found
   nothing, and the eval summed it as 0.
3. **Fix.** `tokensFromRaw` still prefers explicit
   `output_token_details.reasoning` / `thoughtsTokenCount`. If neither is
   there, it derives thoughts as
   `total_tokens − input_tokens − output_tokens (− toolUsePromptTokenCount)`,
   because Gemini's totalTokenCount includes thoughts. It reports null rather
   than 0 when the derived value is ≤ 0. The eval cost now bills thinking
   tokens at the output rate, so earlier reports under-stated cost.

## Procedural fallbacks that had no reason (fixed)

Every procedural answer now carries a specific `fallbackReason`
(`@roomquest/schema` `FallbackReason`) plus `DirectorOutcome.failedAt`:

| Path | Before | Now |
| --- | --- | --- |
| first call aborted by deadline | none | `llm-timeout` / `draft` |
| first call provider error | none | `llm-error` / `draft` |
| local repair failed, repair gate skipped | none | `llm-invalid` / `llm-repair-gate` |
| LLM repair timed out / errored | none | `llm-timeout` / `llm-error` at `llm-repair` |
| LLM repair still invalid | none | `llm-invalid` / `llm-repair` |
| neither call parsed | none | `llm-parse-failed` / `llm-repair` |
| slot mode, unknown slot id | n/a | `slot-resolve-failed` / `slot-resolve` |
| unexpected exception in the loop (used to throw → 500) | throw | `director-error` / `director` |
| `DIRECTOR_MODE=mock` | none | `director-mock` / `mode` |
| live without `GOOGLE_API_KEY` | none | `llm-unconfigured` / `mode` |

**A bug found along the way:** when the model output was not JSON at all,
`repairPlan` replaced it with its built-in stub plan (title "Unrepaired").
On graphs that have `s1`/`s2` that stub validates, so it was served as
`source:"llm_repaired"` with the model name. `localRepairPlan` now flags
`usedStub`, the director never serves the stub, and the LLM repair prompt gets
the raw text instead of the stub.

Caching is unchanged: only `llm-quota` responses skip the Postgres cache.
Transient `llm-timeout` / `llm-error` procedural plans are still cached, as they
were before this change. Worth a follow-up decision.

## Other behaviour changes

- Local repair order is now snap → `repairRoute` (a pass-through hook;
  level-core has none yet) → `repairPlan` → validate. Because snap runs first,
  a misplaced piece (e.g. a slime on the floor) is now moved onto a legal slot
  instead of being dropped by `repairPlan`. The `director.plan_fixed stage=…`
  log names the stage that fixed the plan.
- `LLM_REPAIR_MIN_REMAINING_MS` now defaults to 3500 (it was 2000).
- `PROMPT_VERSION` is v1.2: the static prefix now states the numeric limits from
  level-core `VALIDATION_LIMITS`. This invalidates cached v1.1 plans.
- Test safety: the `apps/api` Vitest setup deletes `GOOGLE_API_KEY` /
  `GEMINI_API_KEY` and forces `DIRECTOR_MODE=mock` unless
  `RQ_ALLOW_LIVE_LLM=1`. Under test, `defaultDirectorChatFactory` throws
  before it builds `ChatGoogleGenerativeAI`. The only exception is a
  `test-*` dummy key, which the stubbed-transport specs need; it cannot
  authenticate. Live eval needs `--live`.
