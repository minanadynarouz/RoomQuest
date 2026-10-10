# Roomquest API

Source of truth for these endpoints: architecture §6 (`docs/ARCHITECTURE-AND-PLAN.md`).
This document describes the API contract. B-02 shipped the skeleton and mock director; B-10 adds optional Prisma/Neon (health `db` ping); B-05 adds the live LangChain director; B-06 adds the Postgres level cache, daily seed, and rate limits; B-07 adds the LLM eval harness (`pnpm --filter api eval`); B-09 adds `POST /api/v1/levels/:cacheKey/result`, helmet, the 16 KB body limit, request ids, and health `version` + `db`.

## Base URL

`VITE_API_BASE_URL` is the **bare origin** with no `/api` suffix (local default `http://localhost:3000`).

The Nest app mounts a global prefix of `api`, so the landing page pre-warms:

```
GET ${VITE_API_BASE_URL}/api/health
```

Production / staging hosts are assigned by Render (`roomquest-api` / `roomquest-api-staging`).

JSON only. Request body ≤ **16 KB**.

## Routes

| Method & path                              | Request                                                                           | Success                                     | Errors                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                          | none                                                                              | `200 {status:"ok", version, db, llm, time}` | none (always 200 if the process is up)                                                                                       |
| `POST /api/v1/levels`                      | Headers `X-Device-Id` (UUID v4), `X-Client-Version` (semver). Body `LevelRequest` | `200 LevelResponse`                         | `400 {error:{code:"INVALID_REQUEST", message, issues}}` · `413` oversized body (see below) · `429 {error:{code:"RATE_LIMITED", retryAfterS}}` · `500 {error:{code:"INTERNAL"}}` |
| `POST /api/v1/levels/:cacheKey/result`     | Path `:cacheKey` (16-hex cache hash **or** `proc:<seed>:<tier>`). Body `ResultRequest` | `201 {id}` · `202 {stored:false}` (no DB)   | `400 {error:{code:"INVALID_REQUEST", message, issues}}` (bad body, malformed `proc:` key, or `proc:` + non-`procedural` `planSource`) · `404 {error:{code:"UNKNOWN_LEVEL"}}` (director cache key missing) · `413` · `429 {error:{code:"RATE_LIMITED", retryAfterS}}` |

Out of scope here: `POST /api/v1/levels/:cacheKey/adapt` (post-MVP).

Every response includes `X-Request-Id` (echoed from the request, or a generated UUID). Helmet security headers are set on every response.

---

## `GET /api/health`

Always **200** while the Node process is up. Used by the landing-page pre-warm and by deploy health checks.

```json
{
  "status": "ok",
  "version": "dev",
  "db": "disabled",
  "llm": "disabled",
  "time": "2026-10-09T08:00:00.000Z"
}
```

| Field     | Meaning                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`  | Always `"ok"`.                                                                                                                             |
| `version` | `GIT_SHA` env var. Local default `"dev"` when unset or empty. Staging/prod should set this to the git commit sha.                          |
| `db`      | `"up"` \| `"down"` \| `"disabled"`. `"disabled"` when `DATABASE_URL` is unset; `"up"` when a bounded `SELECT 1` ping succeeds; `"down"` when the URL is set but Postgres is unreachable (the ping is capped at 2 s). The process still returns 200. |
| `llm`     | `"up"` if `GOOGLE_API_KEY` is set and the Gemini quota breaker is closed; `"quota-cooldown"` if a 429 / `RESOURCE_EXHAUSTED` opened the breaker; `"disabled"` if the key is unset. Keys are not required to start the API. |
| `time`    | ISO 8601 UTC timestamp (`Date.toISOString()`).                                                                                             |

---

## `POST /api/v1/levels`

### Headers

| Header             | Rule                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `X-Device-Id`      | UUID v4 (required). Missing or invalid → 400.                                                 |
| `X-Client-Version` | Semver `MAJOR.MINOR.PATCH` with optional prerelease / build (required).                       |
| `X-Request-Id`     | Optional on every route. Echoed on the response and included as `requestId` in every pino log line. Generated as a UUID when omitted. |

### Body (`LevelRequest` from `@roomquest/schema`)

```json
{
  "graph": {
    "version": 1,
    "roomHash": "f1a2b3c4d5e6",
    "mode": "scene",
    "floorY": 0,
    "nodes": [],
    "edges": []
  },
  "date": "2026-10-14",
  "tier": "easy",
  "recentThemes": ["forest"]
}
```

`recentThemes` is optional, max 3. `date` is `YYYY-MM-DD`. `tier` is `"easy"` | `"normal"`.

### Success (`LevelResponse`)

Architecture server semantics:

1. Validate headers + body with zod (400 on failure).
2. `seed = roomHash + "-" + date` (the request `date` field, `YYYY-MM-DD`). `generatePlan` is deterministic for a given seed; the next date therefore yields a different seed. `cacheKey = sha256(roomHash\|date\|tier\|promptVersion)` as **hex**, then the **first 16 hex characters**. `promptVersion` is `PROMPT_VERSION` (`v1.1`).
3. **Cache** (when `DATABASE_URL` is set and Postgres is reachable): look up `LevelCache` by `cacheKey`. On a hit, **always** re-run `level-core.validatePlan` against the **incoming** graph (roomHash only covers the 6 largest surfaces). If valid, return `source:"cache"` (this does **not** count against the per-device cache-miss budget). If validation fails, treat it as a miss, regenerate, and overwrite the row.
4. **Mock** (`DIRECTOR_MODE=mock`, the default): `generatePlan` → `validatePlan` → `repairPlan` → `validatePlan` against the **request graph** (same bind path as the client director and the live procedural fallback). `source` is `"procedural"`. `model` is omitted. No LLM keys required.
5. **Live** (`DIRECTOR_MODE=live`): LangChain director with a **7 s whole-request** budget (the client aborts `/levels` at 8 s). One `AbortSignal` is shared by every step, measured from request arrival. LLM work is aborted **250 ms** before the 7 s wall so `generatePlan` and the HTTP response still finish in time.
   1. Primary: `ChatGoogleGenerativeAI` (`DIRECTOR_MODEL`, default `gemini-3.8-flash`), temperature 0.7, `thinkingConfig.thinkingLevel` from `DIRECTOR_THINKING` (default `low` → `LOW`; `minimal` → `MINIMAL`; `default` omits thinkingConfig). Gemini 3 uses `thinkingLevel`; `thinkingBudget: 0` may be ignored. If Gemini HTTP-400s a thinking level as unsupported, the director retries **once** in the same deadline without `thinkingConfig` and remembers that level process-wide. `.withStructuredOutput(LevelPlanLLMGeminiSchema)` then zod compact `LevelPlanLLM` (`th` + `pl`).
   2. Hydrate compact `LevelPlanLLM` (theme + placements) via level-core → `clampParTimeMs` → `LevelPlan.parse` → `validatePlan(plan, graph)`.
   3. If invalid: local deterministic repair (`repairPlan`, then `snapPlacementsToSlots` from level-core when that helper exists) and validate again. Only if still invalid: **one** LLM repair call that includes the issue messages (same static system prefix), **skipped** when fewer than **2 s** of the LLM window remain.
   4. Still invalid, out of time, or a Gemini provider error: `generatePlan(graph, seed, tier)` with `source:"procedural"`.
   5. HTTP 429 or `RESOURCE_EXHAUSTED` opens a process-wide quota breaker for `Retry-After` / `retryDelay` if present, otherwise `LLM_QUOTA_COOLDOWN_S` (default 600 s). While it is open, later misses skip Gemini and return `source:"procedural"` with `fallbackReason:"llm-quota"`. Cache lookup still runs first. Quota fallbacks are not written to `LevelCache` under the LLM key. The breaker logs one warn on open and one info on close, not once per request.
6. After a successful director/procedural result (except `fallbackReason:"llm-quota"`), the plan is upserted into `LevelCache`. The write is bounded (~200 ms or whatever remains of the 7 s budget) so it cannot push the response past the wall; if the wait elapses the insert continues in the background.
7. `source` is `"cache"` | `"llm"` | `"llm_repaired"` | `"procedural"`. Optional `fallbackReason` is `"llm-quota"` when the quota breaker skipped Gemini. `model` is set for LLM sources (and echoed from the cached row on a hit). `repairs` lists local repair actions (and `"llm-repair"` when the second call ran); cache hits return `repairs: []`.
8. `latencyMs` is server handling time in milliseconds.
9. If `DIRECTOR_MODE=live` but `GOOGLE_API_KEY` is unset, the API logs a warning and serves a procedural plan so it still starts. CI and local mock runs need no key.
10. If `DATABASE_URL` is unset or Postgres is unreachable, `/levels` still returns 200 (director/procedural only, no cache) and logs a warning. Do not create Neon/Render resources for local or CI — use Docker Postgres 17 or the GitHub Actions postgres service.

**Mock plan vs request graph:** mock and procedural plans are generated against the incoming `SurfaceGraph` (then validated and repaired). The client still re-validates with `level-core` as a defense in depth.

The API never returns 5xx for LLM problems (architecture §6.6): it degrades to the procedural plan with 200.

---

## `POST /api/v1/levels/:cacheKey/result`

Anonymous session result. Covered by the same per-IP `@nestjs/throttler` guard as `POST /api/v1/levels` (60/hour). The per-device cache-miss limiter does **not** apply. `X-Device-Id` / `X-Client-Version` are not required on this route; `deviceId` is in the body.

### Path `:cacheKey`

Two key shapes. Client and server must build `proc:` keys with `procLevelKey(seed, tier)` from `@roomquest/schema` (regex `PROC_LEVEL_KEY_RE`).

| Kind | Example | Lookup |
| --- | --- | --- |
| Director cache hash | `a1b2c3d4e5f67890` (first 16 hex chars of `sha256(roomHash\|date\|tier\|promptVersion)`) | Must exist on `LevelCache`. Missing → **404** `UNKNOWN_LEVEL` (only when the DB is up). |
| Client procedural | `proc:<seed>:<tier>` e.g. `proc:f1a2b3c4d5e6-2026-10-14:easy` | **Not** looked up in `LevelCache`. `seed` is the same string (or stringified number) passed to `generatePlan`; `tier` is `"easy"` \| `"normal"`. Seed must be non-empty and must not contain `:`. |

A key that starts with `proc:` but does not match `proc:<seed>:<easy\|normal>` is **400** (`INVALID_REQUEST`), not 404.

A valid `proc:` key **requires** `planSource: "procedural"`. Any other `planSource` is **400**.

Stored row: `SessionResult.levelKey` is always the posted key. `SessionResult.cacheKey` (FK to `LevelCache`) is set only for director cache hashes; it is `null` for `proc:` keys.

### Headers

| Header         | Rule                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- |
| `X-Request-Id` | Optional. Echoed on the response and included in pino logs. Generated as a UUID when omitted. |

### Body (`ResultRequest` from `@roomquest/schema`)

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "stars": 3,
  "gems": 2,
  "timeMs": 180000,
  "completed": true,
  "planSource": "procedural"
}
```

| Field        | Rule                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| `deviceId`   | UUID v4.                                                                                      |
| `stars`      | Integer 0–3.                                                                                  |
| `gems`       | Integer ≥ 0.                                                                                  |
| `timeMs`     | Positive integer, max `3600000` (1 hour).                                                     |
| `completed`  | Boolean.                                                                                      |
| `planSource` | Same enum as `LevelResponse.source`: `"cache"` \| `"llm"` \| `"llm_repaired"` \| `"procedural"`. |

### Success

**201** when the row is inserted into `SessionResult`. For a director cache hash the `:cacheKey` must exist on `LevelCache`. For a valid `proc:` key there is no cache lookup.

```json
{ "id": "clxyz0123456789" }
```

**202** when `DATABASE_URL` is unset or Postgres is unreachable. The client must not treat this as an error:

```json
{ "stored": false }
```

### Errors

| Status | Envelope |
| --- | --- |
| 400 | `{error:{code:"INVALID_REQUEST", message, issues}}` — zod failed on the body, the `proc:` key is malformed, or a `proc:` key was posted with `planSource` other than `"procedural"` |
| 404 | `{error:{code:"UNKNOWN_LEVEL", message}}` — no `LevelCache` row for a **non-proc** `:cacheKey` (only when the DB is up). `proc:` keys never 404. |
| 413 | `{error:{code:"INVALID_REQUEST", message:"Request body exceeds 16 KB limit"}}` |
| 429 | `{error:{code:"RATE_LIMITED", retryAfterS}}` — per-IP budget |

---

## Errors

No stack traces are included in responses.

### 400 Invalid request

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Validation failed",
    "issues": []
  }
}
```

`issues` is the zod 4 issue list for header or body validation failures.

### 413 Body too large

JSON bodies larger than 16 KB are rejected **before** zod parsing:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request body exceeds 16 KB limit"
  }
}
```

Architecture §6 lists 400 / 429 / 500. 413 is the HTTP status for payload too large; the envelope still uses `INVALID_REQUEST`.

### 404 Unknown level

Returned only by `POST /api/v1/levels/:cacheKey/result` when the database is up, the key is **not** a `proc:` key, and no `LevelCache` row matches `:cacheKey`:

```json
{
  "error": {
    "code": "UNKNOWN_LEVEL",
    "message": "Unknown cache key"
  }
}
```

### 429 Rate limited

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "retryAfterS": 3540
  }
}
```

The `Retry-After` header is set to the same `retryAfterS` value (seconds).

Two independent limiters (both **in-memory in this process** for the MVP — they reset on deploy / Render sleep; not shared across instances, no Redis):

| Limiter | Key | Budget | Counts |
| --- | --- | --- | --- |
| `@nestjs/throttler` guard | client IP (`X-Forwarded-For` when `trust proxy` is on) | **60 / hour** | every `POST` under `/api/v1/levels`, including cache hits and `/result` |
| Custom limiter in the levels service | `X-Device-Id` | **10 / hour** | **cache misses only** (a valid cache hit is free) |

The 11th cache miss from one device in an hour is 429. Health is not throttled.

### 500 Internal

```json
{
  "error": {
    "code": "INTERNAL"
  }
}
```

No `message`, no `issues`, no stack.

---

## CORS

Allowlist (all must match the request `Origin`):

1. **Explicit origins** from `CORS_ORIGINS` (comma-separated). Default: `http://localhost:5173,https://localhost:5173`. Put the prod Vercel domain and the GitHub Pages mirror origin here.
2. **This project’s Vercel preview domains**, hostname regex:
   `^https://(?:[a-z0-9-]+-)*roomquest(?:-[a-z0-9]+)*\.vercel\.app$`
3. **`https://localhost` with any port** (`https://localhost`, `https://localhost:5173`, …).

Requests with no `Origin` (curl, server-side) are allowed. Blocked origins are not reflected in `Access-Control-Allow-Origin` (the route still runs).

`Access-Control-Expose-Headers` includes `X-Request-Id` and `Retry-After` so the cross-origin client can read them.

---

## Runtime extras

- **helmet** security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Cross-Origin-Resource-Policy: cross-origin`, and the rest of helmet 8 defaults).
- **nestjs-pino** structured JSON logs (pino-pretty in `NODE_ENV=development`). Each request has an id (`X-Request-Id`); the same value is the `requestId` field on every log line.
- **`@nestjs/throttler`** per-IP guard (60/h) on every `POST` under `/api/v1/levels` (including `/result`), plus the per-device cache-miss limiter (10/h) on `/levels` only. In-memory; see **429 Rate limited**.
- **16 KB JSON body limit** — larger bodies return 413 before zod parsing.
- Env is validated with a zod schema at startup (see **Environment variables** below). Extra keys are stripped. Missing optional keys use the documented defaults.

## Environment variables

Validated in `apps/api/src/config/env.ts`. Copy `.env.example` (repo root or `apps/api/.env.example`) to `.env` — never commit secrets.

None of these are required to start the API. CI sets `TEST_DATABASE_URL` on the `test` and `smoke-api` jobs (`postgres:17` service). Local DB, when used, is **Docker Postgres 17** only (B-10 does not create Render or Neon projects).

| Name | Required | Default | Example | Environments |
| --- | --- | --- | --- | --- |
| `PORT` | optional | `3000` | `3000` | **local**. Render injects `PORT` at runtime; it is not in `render.yaml`. |
| `NODE_ENV` | optional | `development` | `development` / `test` / `production` | **local** `development`; **CI** / Vitest `test`; **staging** / **prod** `production`. |
| `DIRECTOR_MODE` | optional | `mock` | `mock` / `live` | **local** / **CI** `mock`; **staging** / **prod** `live`. |
| `CORS_ORIGINS` | optional | `http://localhost:5173,https://localhost:5173` | `http://localhost:5173,https://localhost:5173,https://roomquest.vercel.app` | **all**. Comma-separated extra origins. Vercel preview hosts and `https://localhost:*` are hardcoded in CORS. |
| `GIT_SHA` | optional | `dev` (empty/unset also becomes `dev`) | `9f8e7d6c5b4a3210` | **local** `dev`; **staging** / **prod** = deployed git sha (set by the deploy workflow). |
| `DIRECTOR_MODEL` | optional | `gemini-3.8-flash` | `gemini-3.8-flash` | **staging** / **prod**; **local** only when exercising live director. |
| `DIRECTOR_THINKING` | optional | `low` | `minimal` / `low` / `default` | **staging** / **prod**. Gemini 3 `thinkingLevel`: `LOW` (default; `MINIMAL` 400s on gemini-3.8-flash and is retried once without thinkingConfig), or omit (`default`). |
| `GOOGLE_API_KEY` | optional | unset | Gemini API key (never commit) | **staging** / **prod** when `DIRECTOR_MODE=live`. **CI / eval / smoke / e2e never call live Gemini** (mock or director-off only). Blank → health `llm:"disabled"`. |
| `LLM_QUOTA_COOLDOWN_S` | optional | `600` | `600` | **all**. Seconds to skip Gemini after HTTP 429 / `RESOURCE_EXHAUSTED` when the error has no `Retry-After` / `retryDelay`. Health reports `llm:"quota-cooldown"` while the breaker is open. |
| `DATABASE_URL` | optional | unset | `postgresql://postgres:postgres@localhost:5432/roomquest` | **local** Docker Postgres 17 (runtime / pooled). **staging** / **prod**: Neon pooled URL — declared in `render.yaml`, values set later (M-10). Unset → health `db:"disabled"`; unreachable → health `db:"down"`. `/levels` still serves without cache (warning logged); `/result` returns `202 {stored:false}`; process still 200. |
| `DIRECT_URL` | optional | unset | `postgresql://postgres:postgres@localhost:5432/roomquest` | **local** Docker (Prisma CLI / `pnpm --filter api db:migrate`). **staging** / **prod**: Neon unpooled URL for `migrate deploy` at the end of the Render build (`render.yaml`) and later in GitHub Environments (L-03 / L-04). |
| `NODE_VERSION` | Render build only (not read by Nest) | `22` in `render.yaml` | `22` | **staging** / **prod** Render native runtime. **local** uses `.nvmrc` (`22`). |
| `TEST_DATABASE_URL` | tests only (not read by Nest) | unset | `postgresql://postgres:postgres@localhost:5432/roomquest` | **CI** test job (GitHub Actions `postgres:17` service). **local** cache integration tests when Docker Postgres is up. When unset, those tests skip unless `CI=true` (then they fail). |

No extra env knobs for rate limits: 60/h per IP and 10 cache-misses/h per device are constants. Counters live in process memory.

`render.yaml` lists the staging/prod keys with `sync: false` so the blueprint never stores secret values. How to fill them later: `docs/deploy-api.md`.

## Director eval (B-07)

`pnpm --filter api eval` calls the LangChain director module **directly** (no HTTP, no Postgres cache, no rate limits) over every available room fixture (up to 5; **`IWER_GRAPHS` from `@roomquest/fixtures` first**, then extra `packages/fixtures/rooms/*.json`, otherwise `synthetic_living_room`) × 2 tiers × 4 seed dates, capped at `--runs` (default **20**). `--runs` cycles rooms, then tiers, then seeds. The report banner is actual rooms × tiers × seeds (and the `--runs` count when it differs). It includes valid/repaired %, which repair stage fixed each plan, a per-`validatePlan` issue-code table, p50/p95, `thoughtsTokenCount`, distinct surfaces/piece types per plan, and mean pairwise Jaccard overlap of piece-type sets and surface-label sets across rooms (IWER graphs so that overlap is meaningful). Live JSON also stores each run's raw first-try LLM plan (`firstTryPlan`) and, when parse failed, `firstTryRawText`.

It writes `docs/eval/<YYYY-MM-DD>.md` and `docs/eval/<YYYY-MM-DD>.json`, prints a summary, and reports whether the bar is met (≥ 90% valid after repair **and** p95 ≤ 7 s). The process exits non-zero only on harness errors — a missed bar is still exit 0.

| Flag                        | Meaning                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `--mock`                    | Drive `FakeListChatModel` (the existing director test fake) so the pipeline runs without LLM keys. |
| `--rooms N`                 | Cap rooms (default: all available, max 5).                                                         |
| `--seeds N`                 | Cap seed dates (default: 4).                                                                       |
| `--tiers easy\|normal\|all` | Subset of tiers (default: both).                                                                   |
| `--runs N`                  | Total director invocations (default: 20). Cycles the room × tier × seed matrix.                    |
| `--thinking minimal\|low\|default` | Gemini thinking (default: `DIRECTOR_THINKING` or `low`).                                     |
| `--out-dir DIR`             | Report directory (default: `docs/eval`).                                                           |
| `--no-write`                | Print only; do not write files.                                                                    |

CI, smoke, e2e and `eval.yml` **never** call live Gemini (billing cap). The GitHub workflow always runs `--mock` (`FakeListChatModel`). If you run the harness without `--mock` and `GOOGLE_API_KEY` is unset, it prints that clearly and **skips** (exit 0). Never hardcode keys. Prices used for the cost estimate live in `apps/api/eval/prices.ts`.

### GitHub Actions `eval.yml`

Manual **`workflow_dispatch` only** — it does **not** run on pull requests. It always uses `--mock` (`DIRECTOR_MODE=mock`) and does **not** read `GOOGLE_API_KEY`. The markdown + JSON report is uploaded as the `director-eval-report` artifact.

## Local run (no database)

```bash
pnpm --filter api dev
```

Listens on `PORT` (default 3000). `GET /api/health` returns `db: "disabled"` when `DATABASE_URL` is unset.

With Docker Postgres 17 (`docker compose up -d` + `pnpm --filter api db:migrate`), the same endpoint returns `db: "up"`. See `docs/deploy-api.md`.

HTTP contract smoke against a running process (local, staging, or prod):

```bash
pnpm --filter api smoke
BASE_URL=https://roomquest-api-staging.onrender.com pnpm --filter api smoke
```

Details and the optional local Postgres-down check: `docs/deploy-api.md` § 5.
