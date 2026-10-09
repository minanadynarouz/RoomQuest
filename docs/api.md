# Roomquest API

Source of truth for these endpoints: architecture §6 (`docs/ARCHITECTURE-AND-PLAN.md`).
This document describes the API contract. B-02 shipped the skeleton and mock director; B-10 adds optional Prisma/Neon (health `db` ping). Later tickets (B-05 live director, B-06 cache/rate limits, B-09 results) extend the same contract.

## Base URL

`VITE_API_BASE_URL` is the **bare origin** with no `/api` suffix (local default `http://localhost:3000`).

The Nest app mounts a global prefix of `api`, so the landing page pre-warms:

```
GET ${VITE_API_BASE_URL}/api/health
```

Production / staging hosts are assigned by Render (`roomquest-api` / `roomquest-api-staging`).

JSON only. Request body ≤ **16 KB**.

## Routes

| Method & path         | Request                                                                           | Success                                     | Errors                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`     | none                                                                              | `200 {status:"ok", version, db, llm, time}` | none (always 200 if the process is up)                                                                                       |
| `POST /api/v1/levels` | Headers `X-Device-Id` (UUID v4), `X-Client-Version` (semver). Body `LevelRequest` | `200 LevelResponse`                         | `400 {error:{code:"INVALID_REQUEST", message, issues}}` · `413` oversized body (see below) · `500 {error:{code:"INTERNAL"}}` |

Out of scope here: `POST /api/v1/levels/:cacheKey/result` (B-09), `POST /api/v1/levels/:cacheKey/adapt` (post-MVP), `429 RATE_LIMITED` (B-06).

---

## `GET /api/health`

Always **200** while the Node process is up. Used by the landing-page pre-warm and by deploy health checks.

```json
{
  "status": "ok",
  "version": "dev",
  "db": "down",
  "llm": "missing",
  "time": "2026-10-09T08:00:00.000Z"
}
```

| Field     | Meaning                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`  | Always `"ok"`.                                                                                                                             |
| `version` | `GIT_SHA` env var. Local default `"dev"` when unset or empty. Staging/prod should set this to the git commit sha.                          |
| `db`      | `"ok"` or `"down"`. `"ok"` when `DATABASE_URL` is set and a `SELECT 1` ping succeeds; `"down"` when the URL is unset or the database is unreachable. The process still returns 200. |
| `llm`     | `"configured"` if `GOOGLE_API_KEY` or `ANTHROPIC_API_KEY` is a non-empty string, else `"missing"`. Keys are not required to start the API. |
| `time`    | ISO 8601 UTC timestamp (`Date.toISOString()`).                                                                                             |

---

## `POST /api/v1/levels`

### Headers

| Header             | Rule                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `X-Device-Id`      | UUID v4 (required). Missing or invalid → 400.                                                 |
| `X-Client-Version` | Semver `MAJOR.MINOR.PATCH` with optional prerelease / build (required).                       |
| `X-Request-Id`     | Optional. Echoed on the response and included in pino logs. Generated as a UUID when omitted. |

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

Architecture server semantics that B-02 **does** implement:

1. Validate headers + body with zod (400 on failure).
2. `cacheKey = sha256(roomHash\|date\|tier\|promptVersion)` as **hex**, then the **first 16 hex characters**.
3. Mock director (`DIRECTOR_MODE=mock`, the default): return the `synthetic_living_room` plan fixture from `@roomquest/fixtures`, parsed with `LevelPlan` before it is wrapped in `LevelResponse`.
4. `source` is always `"procedural"` in mock mode.
5. `promptVersion` is the API constant `v1` (B-05 will bump this with the live prompt).
6. `latencyMs` is server handling time in milliseconds.
7. `repairs` is `[]` (no validator repair loop until B-04 / B-05).
8. `model` is omitted (procedural / mock).

**Mock plan vs request graph:** the fixture plan’s surface ids (`s1`, `s2`, `s4`, …) belong to the synthetic living-room graph. They will **not** match an arbitrary client `SurfaceGraph`. That is intentional for B-02. The client must re-validate with `level-core` and fall back locally (architecture §6 client semantics).

`DIRECTOR_MODE=live` is **not implemented** in B-02 (that is B-05 / LangChain). The API still starts and serves the same mock plan, and logs a warning.

The API never returns 5xx for LLM problems (architecture §6.6). There is no LLM call yet.

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

---

## Runtime extras

- **helmet** security headers.
- **nestjs-pino** structured JSON logs (pino-pretty in `NODE_ENV=development`). Each request has an id (`X-Request-Id`).
- Env is validated with a zod schema at startup (see **Environment variables** below). Extra keys are stripped. Missing optional keys use the documented defaults.

## Environment variables

Validated in `apps/api/src/config/env.ts`. Copy `.env.example` (repo root or `apps/api/.env.example`) to `.env` — never commit secrets.

None of these are required to start the API. CI does not set a database. Local DB, when used, is **Docker Postgres 17** only (B-10 does not create Render or Neon projects).

| Name | Required | Default | Example | Environments |
| --- | --- | --- | --- | --- |
| `PORT` | optional | `3000` | `3000` | **local**. Render injects `PORT` at runtime; it is not in `render.yaml`. |
| `NODE_ENV` | optional | `development` | `development` / `test` / `production` | **local** `development`; **CI** / Vitest `test`; **staging** / **prod** `production`. |
| `DIRECTOR_MODE` | optional | `mock` | `mock` / `live` | **local** / **CI** `mock`; **staging** / **prod** `live` (or `mock` until B-05). |
| `CORS_ORIGINS` | optional | `http://localhost:5173,https://localhost:5173` | `http://localhost:5173,https://localhost:5173,https://roomquest.vercel.app` | **all**. Comma-separated extra origins. Vercel preview hosts and `https://localhost:*` are hardcoded in CORS. |
| `GIT_SHA` | optional | `dev` (empty/unset also becomes `dev`) | `9f8e7d6c5b4a3210` | **local** `dev`; **staging** / **prod** = deployed git sha (set by the deploy workflow). |
| `DIRECTOR_MODEL` | optional | unset (B-05 uses `gemini-3.8-flash`) | `gemini-3.8-flash` | **staging** / **prod**; **local** only when exercising live director. |
| `FALLBACK_MODEL` | optional | unset (B-05 uses `claude-haiku-4-5`) | `claude-haiku-4-5` | **staging** / **prod**; **local** only when exercising live director. |
| `GOOGLE_API_KEY` | optional | unset | Gemini API key (never commit) | **staging** / **prod** when `DIRECTOR_MODE=live`; **local** only for live director tests. Blank → health `llm:"missing"`. |
| `ANTHROPIC_API_KEY` | optional | unset | Anthropic API key (never commit) | **staging** / **prod** fallback; **local** only for live director tests. Either key makes health `llm:"configured"`. |
| `DATABASE_URL` | optional | unset | `postgresql://postgres:postgres@localhost:5432/roomquest` | **local** Docker Postgres 17 (runtime / pooled). **staging** / **prod**: Neon pooled URL — declared in `render.yaml`, values set later (M-10). Unset or unreachable → health `db:"down"`; process still 200. |
| `DIRECT_URL` | optional | unset | `postgresql://postgres:postgres@localhost:5432/roomquest` | **local** Docker (Prisma CLI / `pnpm --filter api db:migrate`). **staging** / **prod**: Neon unpooled URL for `migrate deploy` (GitHub Environments, L-03 / L-04). |
| `NODE_VERSION` | Render build only (not read by Nest) | `22` in `render.yaml` | `22` | **staging** / **prod** Render native runtime. **local** uses `.nvmrc` (`22`). |

`render.yaml` lists the staging/prod keys with `sync: false` so the blueprint never stores secret values. How to fill them later: `docs/deploy-api.md`.

## Local run (no database)

```bash
pnpm --filter api dev
```

Listens on `PORT` (default 3000). `GET /api/health` returns `db: "down"` when `DATABASE_URL` is unset.

With Docker Postgres 17 (`docker compose up -d` + `pnpm --filter api db:migrate`), the same endpoint returns `db: "ok"`. See `docs/deploy-api.md`.
