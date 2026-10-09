# Deploy the Roomquest API (Render + Neon)

The Nest API is **meant** to run on **Render** (Oregon, Node 22) with Postgres on **Neon Free** (AWS us-west-2). This ticket (B-10) only ships the blueprint, Prisma config, and local Docker Postgres 17.

**Out of scope here:** do not create Render or Neon accounts, projects, services, or branches. Do not call the Render/Neon APIs or CLIs. Mina / the Lead create those later (M-10, L-03, L-04). Local verification is Docker only.

The complete API env-var list (name, required/optional, default, example, environments) lives in **`docs/api.md` § Environment variables** and in **`.env.example`**.

## 1. Neon project and branches (later — do not run in B-10)

1. Create a Neon project named `roomquest` in **AWS us-west-2** (closest to Render Oregon).
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

Build: `corepack enable && pnpm i --frozen-lockfile && pnpm turbo run build --filter=api...`  
Start: `node apps/api/dist/main.js`  
Health: `GET /api/health` (always 200 if the process is up; `db` may be `"up"`, `"down"`, or `"disabled"`).

## 3. Env vars (per Render service, later)

Set these in the Render Dashboard. They are declared with `sync: false` so `render.yaml` never holds secrets. See `docs/api.md` for defaults and local examples.

| Key | Staging | Production |
| --- | --- | --- |
| `DATABASE_URL` | Neon **staging** pooled URL | Neon **main** pooled URL |
| `DIRECT_URL` | Neon **staging** direct URL | Neon **main** direct URL |
| `GOOGLE_API_KEY` | Gemini key | Gemini key |
| `ANTHROPIC_API_KEY` | Claude fallback key | Claude fallback key |
| `DIRECTOR_MODE` | `live` | `live` |
| `DIRECTOR_MODEL` | `gemini-3.8-flash` | `gemini-3.8-flash` |
| `FALLBACK_MODEL` | `claude-haiku-4-5` | `claude-haiku-4-5` |
| `CORS_ORIGINS` | staging client origins (Vercel preview / `revision_branch` URL) | prod Vercel domain, GitHub Pages origin |
| `NODE_ENV` | `production` | `production` |
| `GIT_SHA` | git sha of the deployed commit (set by the deploy workflow) | same |
| `NODE_VERSION` | `22` (already in the blueprint) | `22` |

GitHub Actions (not Render) also needs:

- Environment **staging**: `DIRECT_URL_STAGING`, `RENDER_DEPLOY_HOOK_STAGING`
- Environment **production**: `DIRECT_URL_PROD`, `RENDER_DEPLOY_HOOK_PROD`
- Repository variables: `API_URL_STAGING`, `API_URL_PROD`

Migrations run in CI (`prisma migrate deploy` with `DIRECT_URL`) before the Render deploy hook, not inside the web process.

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
