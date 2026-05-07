# Enterprise Agentic SaaS Starter

Multi-tenant SaaS starter for teams that want the boring parts to be
deliberate: auth, organizations, database boundaries, email delivery, quality
gates, and agent-facing project knowledge.

> [!IMPORTANT]
> The demo domain is intentionally small, but the architecture is not a toy.
> Treat this repository as a starter for a SaaS product with organizations,
> permissions, auditability, and production-grade CI.

## Tech Stack

| Layer     | Stack                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Runtime   | Bun `1.3.12`                                                                                                              |
| Monorepo  | Bun workspaces, Turborepo                                                                                                 |
| Web       | Next.js `16`, React `19`, Tailwind CSS `4`, shadcn/ui                                                                     |
| API       | Elysia on Bun, Eden client, Elysia `t` / TypeBox (routes); [envin](https://github.com/turbostarter/envin) + Valibot (env) |
| Auth      | Better Auth, magic link, organization plugin                                                                              |
| Database  | Turso/libSQL, Drizzle ORM, Drizzle Kit                                                                                    |
| Email     | React Email, console dev logger, noop test sender                                                                         |
| Quality   | Oxlint, Oxfmt, Vitest, GitHub Actions                                                                                     |
| Agent ops | APM skills under `.apm/skills`                                                                                            |

> [!NOTE]
> Dependency versions are pinned in the root `workspaces.catalog`. Workspace
> packages consume external dependencies with `catalog:` and local packages with
> `workspace:*`.

## Workspace Map

```txt
apps/
  web/      Next.js frontend
  api/      Elysia API, Better Auth mount, Eden client export

packages/
  auth/     Better Auth factory and client entrypoint
  db/       Turso/libSQL Drizzle client and schema
  email/    React Email templates and sender adapters
  ui/       shared React UI primitives
```

Package boundaries are intentional:

- `apps/* -> packages/*` is allowed.
- `packages/* -> apps/*` is not allowed.
- `packages/auth -> packages/email` is not allowed; `apps/api` composes auth
  callbacks with email templates and senders.
- `apps/api` uses Elysia `t` / TypeBox for **route** schemas. **Environment** variables use Valibot via [envin](https://github.com/turbostarter/envin) in [`apps/api/src/env.ts`](apps/api/src/env.ts); do not add Valibot for HTTP bodies in the API package unless the project standard changes.

## Getting Started

### 1. Install

```sh
bun install --frozen-lockfile
```

### 2. Configure environment (per package)

Environment variables are validated with [envin](https://github.com/turbostarter/envin) and [Valibot](https://valibot.dev/) per runnable package. Bun loads `.env`, then mode-specific files (for example `.env.development` when `NODE_ENV=development`), then `.env.local`, from the **current working directory** of the command (`apps/api`, `packages/db`, and so on).

**Template index** (also at repo root [`.env.example`](.env.example)):

- **API:** copy [`apps/api/.env.example`](apps/api/.env.example) to `apps/api/.env.development` and `apps/api/.env.local` as needed. For Vitest, copy [`apps/api/.env.test.example`](apps/api/.env.test.example) to `apps/api/.env.test`.
- **Database / Drizzle:** copy [`packages/db/.env.example`](packages/db/.env.example) to `packages/db/.env.development` (and `.env.local` if needed). Keep `TURSO_DATABASE_URL` in sync with the API package for local dev.

Optional live preview: `bunx envin dev` (see [`@envin/cli`](https://www.npmjs.com/package/@envin/cli)).

Quick start — copy the committed examples:

```sh
cp apps/api/.env.example apps/api/.env.development
cp apps/api/.env.example apps/api/.env.local
cp packages/db/.env.example packages/db/.env.development
```

Use the same `TURSO_DATABASE_URL` (and token if any) in **both** `apps/api` and `packages/db` for local development.

Vitest for the API expects `apps/api/.env.test`. From the template:

```sh
cp apps/api/.env.test.example apps/api/.env.test
```

CI performs this copy automatically in workflows.

Optional variables (see `apps/api/.env.example`). Local dev is **portless**: HTTPS on `.localhost` hostnames (not `http://localhost:3000` / `:3001`).

```sh
# in apps/api/.env.development
PORT=3001
APP_BASE_URL=https://enterprise-agentic-saas.localhost
API_PUBLIC_URL=https://api.enterprise-agentic-saas.localhost
BETTER_AUTH_URL=https://api.enterprise-agentic-saas.localhost
NEXT_PUBLIC_API_BASE_URL=https://api.enterprise-agentic-saas.localhost
TRUSTED_ORIGINS=https://enterprise-agentic-saas.localhost
CORS_ORIGIN=https://enterprise-agentic-saas.localhost
```

Start the local Turso dev server from `@enterprise-agentic-saas/db` when using the default local
URL:

```sh
bun --cwd packages/db run dev
```

This also applies the current Drizzle schema with `drizzle-kit push`, inserts
development seed data on first run, and starts Drizzle Studio.

> [!NOTE]
> `turso dev` requires `sqld` on `PATH`. Turso Cloud database creation also
> requires `turso auth login` before running `turso db create ...`.

> [!WARNING]
> Do not commit real secrets. Prefer your local secret workflow
> (direnv/dotenvx/GitHub Secrets) and keep raw tokens out of source, docs, test
> snapshots, and telemetry.

### 3. Run development servers

```sh
bun run dev
```

Common direct commands:

```sh
bun --cwd apps/web run dev
bun --cwd apps/api run dev
```

### 4. Verify the workspace

```sh
bun run check
bun run build
```

`check` runs lint, format check, typecheck, and tests through Turbo.

> [!TIP]
> If `bun run build` fails while fetching Google Fonts, retry with network
> access enabled. The app build uses `next/font` and may need to reach Google
> Fonts in a fresh environment.

## Quality Gate

```sh
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run build
```

Each new workspace should carry its own README, Oxlint config, and focused
Vitest coverage. Agent-facing conventions belong in `.apm/skills` when the
decision should survive the current task.

## API Surface

- `@enterprise-agentic-saas/api/client`: Eden client factory.
- `@enterprise-agentic-saas/auth`: Better Auth server factory.
- `@enterprise-agentic-saas/auth/client`: Better Auth browser client factory.
- `@enterprise-agentic-saas/db`: Drizzle/libSQL client and schema exports.
- `@enterprise-agentic-saas/email`: React Email render helpers, templates, and local sender adapters.
- `@enterprise-agentic-saas/ui`: shared UI components, hooks, utilities, and global styles.

## Adding shadcn/ui Components

Run the shadcn CLI from the repository root and target the web app config:

```sh
bunx --bun shadcn@latest add button -c apps/web
```

Generated shared UI components live in `packages/ui/src/components`.

```tsx
import { Button } from "@enterprise-agentic-saas/ui/components/button";
```
