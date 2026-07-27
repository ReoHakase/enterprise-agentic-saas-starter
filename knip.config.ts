import type { KnipConfig } from "knip"

// Tracking: one-shot harness migration §3.3. Owner: CI/quality maintainers.
// Cloudflare's `cloudflare:workers` protocol is a runtime builtin, not an npm package.
// Remove this exception when Knip classifies that protocol without an unlisted dependency.
const cloudflareRuntimeBuiltin = ["cloudflare"]

const config: KnipConfig = {
  treatConfigHintsAsErrors: true,
  workspaces: {
    ".": {
      entry: [
        ".codex/hooks/**/*.ts",
        "*.config.{js,mjs,ts}",
        "scripts/**/*.ts",
      ],
      project: [
        ".codex/**/*.ts",
        ".github/**/*.ts",
        "*.config.{js,mjs,ts}",
        "scripts/**/*.ts",
      ],
      // Issue: Knip's Bun plugin only parses bunfig.toml `test.preload` and does
      // not recognize `install.security.scanner`. Owner: CI/quality maintainers.
      // Reason: Bun dynamically loads this scanner during install. Remove when
      // Knip recognizes dependencies configured by `install.security.scanner`.
      ignoreDependencies: ["@socketsecurity/bun-security-scanner"],
    },
    "apps/agent": {
      entry: ["src/mastra/index.ts!", "src/mastra/server.ts"],
      project: [
        "src/mastra/**/*.ts!",
        "!src/mastra/**/*.test.ts!",
        "!src/mastra/e2e/**!",
        "!src/mastra/evals/**!",
        "!src/mastra/server.ts!",
        "!src/mastra/test-support/**!",
      ],
      ignoreDependencies: [
        ...cloudflareRuntimeBuiltin,
        // Mastra Studio is invoked through a nested Portless shell command.
        // Remove when the command no longer needs child-process `$PORT` expansion.
        "mastra",
      ],
      // Turso CLI is supplied by the Nix development environment, not npm.
      ignoreBinaries: ["turso"],
      wrangler: {
        config: ["wrangler*.jsonc"],
      },
    },
    "apps/api": {
      entry: [
        "smoke/images/run.ts",
        "src/**/*.test.ts",
        "src/dev.ts",
        "src/index.ts!",
        "src/smoke/upload-memory/worker.ts!",
      ],
      // Knip strict implies production mode. Keep the production graph explicit
      // while normal mode still audits every test/development support module.
      project: [
        "smoke/**/*.ts!",
        "src/**/*.ts!",
        "!smoke/images/client.ts!",
        "!smoke/images/cloudflare-env.d.ts!",
        "!smoke/**/*.test.ts!",
        "!src/**/*.fixture-support.ts!",
        "!src/**/*.test-support.ts!",
        "!src/**/*.test-database-support.ts!",
        "!src/**/*.test.ts!",
        "!src/dev.ts!",
        "!src/development/**/*.ts!",
        "!src/smoke/upload-memory/run.ts!",
        "!src/smoke/upload-memory/metrics.ts!",
        "!src/test/**/*.ts!",
      ],
      ignoreDependencies: cloudflareRuntimeBuiltin,
      wrangler: {
        config: ["wrangler*.jsonc", "src/**/wrangler*.jsonc"],
      },
    },
    "apps/emulate": {
      project: ["src/**/*.ts!", "!src/**/*.test.ts!", "!src/test-support/**!"],
    },
    "apps/web": {
      entry: [
        "e2e/fixtures/agent-stack.ts",
        "e2e/fixtures/oauth-api.ts",
        "src/features/auth/auth-plugin.ts!",
        "open-next.config.ts",
        "test-support/storybook/next-link.tsx",
        "test-support/storybook/next-navigation.ts",
        "test-support/storybook/sentry-nextjs.ts",
        "test-support/storybook/server-only.ts",
      ],
      project: [
        "src/{app,components,features,hooks,lib}/**/*.{ts,tsx}!",
        "!**/*.test.{ts,tsx}!",
        "!**/*.stories.{ts,tsx}!",
        "!src/features/**/test-support/**!",
      ],
      playwright: {
        config: ["playwright*.config.ts"],
      },
      storybook: true,
    },
    "packages/agent-contracts": {
      project: ["src/**/*.ts!", "!src/**/*.test.ts!"],
    },
    "packages/agent-tools": {
      project: ["src/**/*.ts!", "!src/**/*.test.ts!"],
    },
    "packages/auth": {
      project: ["src/**/*.ts!", "!src/**/*.test.ts!", "!src/test-support/**!"],
    },
    "packages/db": {
      entry: [
        "drizzle.config.ts",
        "scripts/*.ts",
        "src/agent-rollout-drain.ts!",
        "src/file-activity-rollout.ts!",
      ],
      project: [
        "src/**/*.ts!",
        "!src/**/*.test.ts!",
        "!src/development/assert-local.ts!",
        "!src/migrations/helpers.ts!",
        "!src/development/reset.ts!",
        "!src/development/seed.ts!",
        "!src/development/wait.ts!",
        "!src/test-support/**!",
      ],
      // Turso CLI is supplied by the Nix development environment, not npm.
      ignoreBinaries: ["turso"],
      drizzle: false,
    },
    "packages/email": {
      entry: ["src/development/mailpit-server.ts", "src/templates/**/*.tsx!"],
      project: [
        "src/**/*.{ts,tsx}!",
        "!src/**/*.test.{ts,tsx}!",
        "!src/development/mailpit-server.ts!",
        "!src/test-support/**!",
      ],
      // Mailpit is supplied by the Nix development environment, not npm.
      ignoreBinaries: ["mailpit"],
      ignoreDependencies: [
        ...cloudflareRuntimeBuiltin,
        // React Email's CLI and its UI package run behind Portless so `$PORT`
        // is expanded in the child process. Remove when Knip resolves that nested command.
        "react-email",
        "@react-email/ui",
      ],
      // The plugin marks template entries as development-only. The explicit
      // workspace entry above keeps the same templates in both full and strict graphs.
      "react-email": false,
    },
    "packages/typescript-config": {
      entry: ["test-fixtures/**/*.{ts,tsx}"],
      project: ["test-fixtures/**/*.{ts,tsx}"],
    },
    "packages/ui": {
      project: [
        "src/**/*.{css,ts,tsx}!",
        "!src/**/*.stories.{ts,tsx}!",
        "!src/**/*.test.{ts,tsx}!",
      ],
      // Tailwind reads this package from the exported CSS `@source` directive.
      // Remove when Knip follows CSS dependency references.
      ignoreDependencies: ["streamdown"],
      storybook: true,
    },
  },
}

export default config
