# Enterprise Agentic SaaS Starter

Multi-tenant SaaS starter for teams that want the boring parts to be
deliberate: auth, organizations, database boundaries, email delivery, quality
gates, and agent-facing project knowledge.

Developer setup, architecture, security, testing, and deployment runbooks are
indexed in [`docs/README.md`](docs/README.md).

> [!IMPORTANT]
> The demo domain is intentionally small, but the architecture is not a toy.
> Treat this repository as a starter for a SaaS product with organizations,
> permissions, auditability, and production-grade CI.

## Tech Stack

| Layer     | Stack                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Runtime   | Bun `1.3.13`                                                                                                              |
| Monorepo  | Bun workspaces, Turborepo                                                                                                 |
| Web       | Next.js `16`, React `19`, Tailwind CSS `4`, shadcn/Base UI, TanStack Query/Form/Table, Jotai                               |
| API       | Elysia on Bun/Cloudflare, Eden client, Valibot Standard Schema; [envin](https://github.com/turbostarter/envin) + Valibot |
| Auth      | Better Auth, magic link, organization plugin                                                                              |
| Database  | Turso/libSQL, Drizzle ORM, Drizzle Kit                                                                                    |
| Email     | React Email, Cloudflare Email Sending, console dev logger, noop test sender                                               |
| Telemetry | Sentry for Next.js/Bun/Cloudflare Workers, Spotlight for local development                                                |
| Quality   | Oxlint, Oxfmt, Vitest/Testing Library, Storybook a11y/interaction, Playwright, GitHub Actions                            |
| Agent ops | repo skills under `.agents/local-skills`, runtime skills and MCP config via Nix                                           |

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
- `packages/auth` may compose the shared DB singleton and `packages/email`
  templates/sender for Better Auth callbacks. `packages/email` must never
  depend back on auth or an app. API-owned invitation flows compose the same
  email package from `apps/api`.
- `apps/api`はAPI-localなValibot Standard SchemaをElysia routeへ直接渡します。`apps/web`はbrowser-localなValibot schemaを持ち、API packageからimportしてよい公開面は`@enterprise-agentic-saas/api/client`だけです。schema共有だけを目的に`packages/validators`を追加しません。

## Getting Started

### 1. Install

With [Nix](https://nixos.org/) and [direnv](https://direnv.net/), use the dev shell from the repo flake:

```sh
direnv allow    # once per clone; loads `use flake` from `.envrc`
# or: nix develop
```

The shell provides `bun`, `turso`, `sqld` (for `turso dev`), `mailpit`,
`dotenvx`, `curl`, and `jq` (see [`flake.nix`](flake.nix)). CI runs
`nix flake check` in parallel with the Bun quality job (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

The Nix dev shell’s `bun` is whatever [`nixpkgs`](https://github.com/NixOS/nixpkgs) provides at the revision recorded in [`flake.lock`](flake.lock) (no per-platform zip hashes in this repo). After `nix flake lock --update-input nixpkgs`, match [`package.json`](package.json) `packageManager` / `engines` to `nix develop -c bun --version`.

If you use lefthook and Nix, commits that touch `flake.nix` or `flake.lock` run `nix flake check`; if `nix` is not on your `PATH`, that hook is skipped.

**Quieter direnv:** Nix dev shells set many variables, so direnv prints a huge `direnv: export +…` line. Copy or merge [`config/direnv/direnv.toml`](config/direnv/direnv.toml) into `~/.config/direnv/direnv.toml` (add `[global]` / `hide_env_diff` if you already have settings there).

The dev shell also runs `sync-agent-config`, which syncs repo-local and
Nix-pinned external skills into ignored `.agents/skills/*` directories and
writes local MCP config for Codex, VS Code, and Cursor. Run it manually with:

```sh
nix run .#sync-agent-config
```

```sh
bun install --frozen-lockfile
```

### 2. Configure environment (per package)

API、auth、DBのruntime環境変数は、それぞれを所有するpackageで
[envin](https://github.com/turbostarter/envin) +
[Valibot](https://valibot.dev/) により検証します。Webは
[`apps/web/lib/env.server.ts`](apps/web/lib/env.server.ts) と
[`apps/web/lib/env.client.ts`](apps/web/lib/env.client.ts) の明示的なallowlistを
server/browserで分離し、browserへ公開する値を`NEXT_PUBLIC_*`に限定します。
Bunはcommandの**current working directory**（`apps/api`、`packages/db`など）から
`.env`、mode別のfile（`NODE_ENV=development`なら`.env.development`）、
`.env.local`の順に読み込みます。

**Template index:**

- **API:** copy [`apps/api/.env.example`](apps/api/.env.example) to `apps/api/.env.development` and `apps/api/.env.local` as needed. For Vitest, copy [`apps/api/.env.test.example`](apps/api/.env.test.example) to `apps/api/.env.test`.
- **Database / Drizzle:** copy [`packages/db/.env.example`](packages/db/.env.example) to `packages/db/.env.development` (and `.env.local` if needed). Keep `TURSO_DATABASE_URL` in sync with the API package for local dev.

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

CI does not create this file. The workflow injects the equivalent test
environment variables directly into each job.

Optional variables (see `apps/api/.env.example`). Local dev is **portless**: HTTPS on `.localhost` hostnames (not `http://localhost:3000` / `:3001`).

`EMAIL_FROM`はlocal/testでは省略でき、その場合は配送不能な`noreply@example.test`を使います。productionではCloudflare Email Sendingで検証済みのsender addressが必須で、未設定なら起動時にfail-fastします。

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

The root development command in the next step also starts the persistent local
Turso process through the DB task's `with` relationship, waits for the
database, applies committed Drizzle migrations with `generate + migrate`, and
starts Drizzle Studio. It does not seed sample data, reconcile R2 fixtures, or
run tests, and it never resets existing data. See
[`docs/database-lifecycle.md`](docs/database-lifecycle.md) for DB-only commands
and the explicit local-only seed/reset commands.

> [!NOTE]
> `turso dev` expects the **`sqld`** binary on `PATH` (provided by the Nix dev shell as `pkgs.sqld`, or install Turso’s tooling by other means). Turso Cloud database creation also
> requires `turso auth login` before running `turso db create ...`.

> [!WARNING]
> Do not commit real secrets. Prefer your local secret workflow
> (direnv/dotenvx/GitHub Secrets) and keep raw tokens out of source, docs, test
> snapshots, and telemetry.

### 3. Run development servers

```sh
bun run dev
```

Wait for the DB task to report that migration has completed before opening the
application for the first time. The Web process is `next dev --turbopack`, with
Next Fast Refresh. The API process is `wrangler dev` with `src/worker.ts` as its
configured main; Wrangler watches source imports, rebundles, and replaces the
Worker isolate after a save. This is not state-preserving Bun HMR, but it also
does not run a prebuilt Worker artifact. Local Turso, R2, and Mailpit data remain
persisted across API reloads. Changes to the supervisor or its environment still
require restarting `bun run dev`.

Do not keep a separate DB-only dev task running alongside the full stack; both
would try to own the same local port and database process.

Sample DB data and R2 fixtures are opt-in. With `bun run dev` still running,
execute this in a second terminal only when those fixtures are needed:

```sh
bun run seed
```

`bun run seed` first checks that the local development stack is ready. If it is
not running, the command exits quickly with an instruction to start `bun run
dev`; it does not wait for a missing database process.

The root `bun run dev` command also starts the persistent Mailpit inbox at
`https://mailpit.enterprise-agentic-saas.localhost` and the React Email template
preview at `https://email.enterprise-agentic-saas.localhost` in the main
checkout. Portless adds the current worktree prefix in linked worktrees, and the
API resolves that effective Mailpit URL automatically. Development email
defaults to Mailpit, so magic links, verification messages, and invitations are
visible without adding a provider override. The Worker still has local
`FILES`, `IMAGES`, Cache, and `EMAIL` bindings; selecting the Cloudflare email
provider explicitly exercises Wrangler's simulated email binding instead of the
default Mailpit inbox.

Common direct commands:

```sh
bun --cwd apps/web run dev
bunx turbo run dev --filter=@enterprise-agentic-saas/api...
```

The first command starts only the web process. The filtered Turbo command starts
the API and its local DB and email dependencies, including Mailpit. Running the
API package script directly assumes those dependencies are already running.

When you intentionally need only Turso, migrations, and Drizzle Studio,
run this from the repository root instead of `bun run dev`:

```sh
bun run dev:db
```

Sentry-compatible errors, traces, and structured logsをlocalだけで確認する場合:

```sh
bun run dev:spotlight
```

Spotlight UIは`http://localhost:8969`。production DSN、Cloudflare Email domain/binding、monitor/alertの設定は[`docs/deployment-operations.md`](docs/deployment-operations.md)、telemetryのprivacy/sampling/runbookは[`docs/observability.md`](docs/observability.md)を参照してください。

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
Vitest coverage. Agent-facing conventions belong in `.agents/local-skills`
when the decision should survive the current task. `.agents/local-skills` is
the source of truth; generated runtime skills under `.agents/skills` should not
be edited in this repo.

## API Surface

- `@enterprise-agentic-saas/api/client`: Eden client factory.
- `@enterprise-agentic-saas/auth`: Better Auth server factory.
- `@enterprise-agentic-saas/auth/client`: Better Auth browser client factory.
- `@enterprise-agentic-saas/db`: Drizzle/libSQL client and schema exports.
- `@enterprise-agentic-saas/email`: React Email render helpers, templates, Cloudflare/Mailpit/console/noop adapters, and runtime selector.
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
