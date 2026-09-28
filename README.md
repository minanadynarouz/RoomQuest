# Roomquest

Your room, a new quest every day. Hands-only WebXR MR puzzle game for Meta Quest (IWSDK).

**Competition:** Meta VR Start Developer Competition 2026 · Track **Gaming** · Division **New Experience**

## Overview

Roomquest turns your real room into a tiny puzzle adventure. An AI game director reads your furniture through Quest scene understanding and builds a short quest where a pocket-sized explorer has to get from your table to your couch. You help with your bare hands: pinch bridges into place, drag platforms, pull levers, poke slimes. Every room is a different level, and your room gets a new level every day.

## Tech Stack

- **Client:** Vite 7 + IWSDK 1.0.0-rc.2 (WebXR AR) + Three.js + TypeScript 5.9
- **API:** NestJS 11 + Prisma 7 + PostgreSQL 17 (Neon)
- **AI:** LangChain + Google Gemini 3.8 Flash (primary) / Claude Haiku 4.5 (fallback)
- **Monorepo:** pnpm 10 + Turborepo 2
- **Hosting:** Vercel (client) + Render (API) + Neon (DB)

## Repository Structure

```
roomquest/
├─ apps/
│  ├─ client/          # IWSDK WebXR app (Vite)
│  └─ api/             # NestJS API server
├─ packages/
│  ├─ schema/          # Shared zod schemas
│  ├─ level-core/      # Validator, solvability check, procedural generator
│  └─ fixtures/        # Test fixtures and emulator room data
├─ docs/               # Architecture, PRD, and other documentation
└─ .github/            # CI workflows and PR template
```

## Prerequisites

- **Node.js:** 22 LTS (≥22.12.0, see `.nvmrc`)
- **pnpm:** 10.x (`npm install -g pnpm@10`)

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

For the client, set `VITE_API_BASE_URL` (defaults to `http://localhost:3000`).

For the API (see `apps/api/.env.example` for full details):
- `DATABASE_URL` - PostgreSQL connection string (pooled)
- `DIRECT_URL` - Direct PostgreSQL connection (for migrations)
- `GOOGLE_API_KEY` - Google AI API key for Gemini
- `ANTHROPIC_API_KEY` - Anthropic API key (fallback)
- `DIRECTOR_MODE` - `mock` (default for local dev) or `live`

### 3. Development

Start all services in parallel:

```bash
pnpm dev
```

This starts:
- **Client** at `https://localhost:5173` (HTTPS for WebXR, with IWER emulator)
- **API** at `http://localhost:3000`

Or run individually:

```bash
# Client only
pnpm --filter client dev

# API only
pnpm --filter api dev
```

### 4. Building

```bash
pnpm build
```

### 5. Testing

```bash
# Run all tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Development Workflow

1. **Create a feature branch** from `revision_branch`:
   ```bash
   git checkout -b feat/<ticket>-<slug>
   ```

2. **Make your changes** and ensure all checks pass:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```

3. **Commit** using Conventional Commits format:
   ```bash
   git commit -m "feat(client): add surface graph system"
   ```

4. **Push** and open a PR against `revision_branch`:
   ```bash
   git push -u origin feat/<ticket>-<slug>
   ```

5. **PR requirements:**
   - CI checks pass (lint, typecheck, test, build)
   - 1 approval
   - All conversations resolved
   - Compliance checklist completed (for XR changes)

## Scripts

Root workspace scripts (via Turborepo):

- `pnpm dev` - Start all apps in dev mode
- `pnpm build` - Build all packages and apps
- `pnpm lint` - Lint all packages
- `pnpm typecheck` - Type check all packages
- `pnpm test` - Run all tests
- `pnpm clean` - Clean all build artifacts

## Project Documentation

Comprehensive documentation is available in the `docs/` directory:

- `PRD.md` - Product Requirements Document
- `ARCHITECTURE-AND-PLAN.md` - Technical architecture and 2-week development plan
- `api.md` - API contract and endpoint documentation
- Additional docs will be added as development progresses

## License

MIT License - Copyright (c) 2026 Mina Nady Narouz

See [LICENSE](./LICENSE) for details.

## Links

- [Meta VR Start Program](https://developers.meta.com/horizon/programs/start/)
- [Competition Details](https://start-developer-competition-26.devpost.com/)
- [IWSDK Documentation](https://iwsdk.dev/)
