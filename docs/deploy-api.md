# Deploy the Roomquest API (Render + Neon)

The Nest API is **meant** to run on **Render** (Frankfurt, Node 22) with Postgres on **Neon Free** (AWS us-west-2). This ticket (B-10) only ships the blueprint, Prisma config, and local Docker Postgres 17.

**Out of scope here:** do not create Render or Neon accounts, projects, services, or branches. Do not call the Render/Neon APIs or CLIs. Mina / the Lead create those later (M-10, L-03, L-04). Local verification is Docker only.

The complete API env-var list (name, required/optional, default, example, environments) lives in **`docs/api.md` § Environment variables** and in **`.env.example`**.

## 1. Neon project and branches (later — do not run in B-10)

1. Create a Neon project named `roomquest` in **AWS us-west-2** (closest to Render Frankfurt).
2. The default branch is **`main`** — use this for production.
3. Create a second branch named **`staging`**.
4. For each branch, copy both connection strings from **Connect**:
   - **Pooled** (`-pooler` in the hostname) → `DATABASE_URL` (runtime, Prisma Neon adapter).
   - **Direct** (no `-pooler`) → `DIRECT_URL` (Prisma CLI / `migrate deploy`).

Until then, use Docker Postgres 17 (section 4).

## 2. Create the Render blueprint (later — do not run in B-10)

1. In Render: **New → Blueprint**.
2. Select this repo. Render reads `render.yaml` at the repo root.
3. The blueprint defines two web services:
   - `roomquest-api-staging` (free)
   - `roomquest-api-prod` (free now; move prod to Starter before 1 Nov)
4. `autoDeploy` is **false**. Deploys are triggered later by GitHub deploy-hook URLs (do not turn auto-deploy on).
5. After creation, copy each service’s **deploy hook** URL into GitHub Environments (`RENDER_DEPLOY_HOOK_STAGING` / `RENDER_DEPLOY_HOOK_PROD`).

Build: `corepack enable && pnpm i --frozen-lockfile && pnpm turbo run build --filter=api... && pnpm --filter api db:migrate:deploy`  
Start: `node apps/api/dist/main.js`  
Health: `GET /api/health` (always 200 if the process is up; `db` may be `"up"`, `"down"`, or `"disabled"`).

## 3. Env vars (per Render service, later)

Set these in the Render Dashboard. They are declared with `sync: false` so `render.yaml` never holds secrets. See `docs/api.md` for defaults and local examples.

| Key | Staging | Production |
| --- | --- | --- |
| `DATABASE_URL` | Neon **staging** pooled URL | Neon **main** pooled URL |
| `DIRECT_URL` | Neon **staging** direct URL | Neon **main** direct URL |
| `GOOGLE_API_KEY` | Gemini key | Gemini key |
| `DIRECTOR_MODE` | `live` | `live` |
| `DIRECTOR_MODEL` | `gemini-3.8-flash` | `gemini-3.8-flash` |
| `DIRECTOR_THINKING` | `low` | `low` |
| `LLM_QUOTA_COOLDOWN_S` | `600` | `600` |
| `CORS_ORIGINS` | staging client origins (Vercel preview / `revision_branch` URL) | prod Vercel domain, GitHub Pages origin |
| `NODE_ENV` | `production` | `production` |
| `GIT_SHA` | git sha of the deployed commit (set by the deploy workflow) | same |
| `NODE_VERSION` | `22` (already in the blueprint) | `22` |

GitHub Actions (not Render) also needs:

- Environment **staging**: `DIRECT_URL_STAGING`, `RENDER_DEPLOY_HOOK_STAGING`
- Environment **production**: `DIRECT_URL_PROD`, `RENDER_DEPLOY_HOOK_PROD`
- Repository variables: `API_URL_STAGING`, `API_URL_PROD`

Migrations run at the **end of the Render build** (`pnpm --filter api db:migrate:deploy`). `apps/api/prisma.config.ts` prefers `DIRECT_URL` (Neon unpooled) over `DATABASE_URL`. `migrate deploy` is idempotent, so L-03 / L-04 may also run it in GitHub Actions before the deploy hook. The start command does not migrate.

## 4. Local Postgres 17 (this ticket)

```bash
docker compose up -d
# wait until pg_isready (the compose healthcheck covers this)
cp .env.example .env   # or apps/api/.env
# uncomment DATABASE_URL and DIRECT_URL (Docker defaults are already there)
pnpm --filter api db:migrate
pnpm --filter api db:generate   # also runs as part of build / lint / typecheck / test
pnpm --filter api dev
```

`GET /api/health` reports `db: "up"` when `DATABASE_URL` points at a reachable Postgres, `db: "disabled"` when the URL is unset, and `db: "down"` when the URL is set but the database is unreachable. The process still starts either way; `POST /api/v1/levels` does not need a database (it skips the cache, logs a warning, and still returns 200). `POST /api/v1/levels/:cacheKey/result` returns `202 { stored: false }` in those same no-DB cases.

## 5. HTTP smoke (`pnpm --filter api smoke`)

Contract check against a **running** API. Engineering Lead can point this at staging/prod later. It does not start the process and does not create Render/Neon resources.

```bash
# local — API already listening the way Render starts it:
#   NODE_ENV=production DIRECTOR_MODE=mock node apps/api/dist/main.js
pnpm --filter api smoke

# staging / prod
BASE_URL=https://roomquest-api-staging.onrender.com pnpm --filter api smoke
```

`--base-url` overrides `BASE_URL`. Default is `http://localhost:3000`.

| Check | Notes |
| --- | --- |
| `GET /api/health` | 200 with a non-empty `version` and `db:"up"` |
| `POST /api/v1/levels` | Fixture graphs from `@roomquest/fixtures` (and `packages/fixtures/rooms/*.json` when present). Body parses as `LevelResponse`; `level-core.validatePlan` must succeed; `latencyMs` ≤ 7 s |
| Repeat `/levels` | `source:"cache"` |
| `POST /api/v1/levels/:cacheKey/result` | 201 `{id}` using the returned `cacheKey` |
| Proc result | 201 using `procLevelKey(seed, tier)` with `planSource:"procedural"` |
| CORS preflight | `OPTIONS` from the client Vercel preview origin pattern |
| 429 | Per-device cache-miss limiter; body includes `retryAfterS` |

**Postgres down (local only):** `SMOKE_STOP_POSTGRES=1 pnpm --filter api smoke` or `pnpm --filter api smoke -- --stop-postgres`. Stops the docker compose `postgres` service, asserts health `db:"down"` while `/levels` still returns 200 `procedural`, then starts Postgres again. Refused when `BASE_URL` is not loopback — never run this against staging/prod.

CI job `smoke-api` runs the HTTP checks against a `postgres:17` service container (same production start command). It does **not** stop Postgres; that path stays a local script flag.
