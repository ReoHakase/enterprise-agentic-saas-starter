import { defineConfig, devices } from "@playwright/test"

import {
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
} from "./e2e/fixtures/agent-e2e-environment"
import { createOAuthDatabasePath } from "./e2e/fixtures/oauth-database"

const runId = parseAgentE2ERunId(process.env.AGENT_E2E_RUN_ID ?? process.pid)
process.env.AGENT_E2E_RUN_ID = String(runId)
delete process.env.OPENROUTER_API_KEY

const agentEnvironment = createAgentE2EEnvironment(runId)
const agentCallbackUrl = `${agentEnvironment.apiOrigin}/auth/oauth2/callback/github`

const oauthWebOrigin = "http://oauth-e2e.enterprise-agentic-saas.localhost:3100"
const oauthApiOrigin =
  "http://api.oauth-e2e.enterprise-agentic-saas.localhost:3101"
const oauthApiLoopbackOrigin = "http://127.0.0.1:3101"
const oauthGithubOrigin = "http://127.0.0.1:4101"
const oauthCookieDomain = "oauth-e2e.enterprise-agentic-saas.localhost"
const oauthDatabasePath = createOAuthDatabasePath(process.pid)
const oauthDatabaseUrl = `file:${oauthDatabasePath}`
const oauthCallbackUrl = `${oauthApiOrigin}/auth/oauth2/callback/github`

const inheritedEnvironment = Object.fromEntries(
  [
    "PATH",
    "HOME",
    "TMPDIR",
    "USER",
    "SHELL",
    "LANG",
    "LC_ALL",
    "CI",
    "TERM",
  ].flatMap((name) => {
    const value = process.env[name]
    return value === undefined ? [] : [[name, value]]
  })
)

const agentStackEnvironment = {
  ...inheritedEnvironment,
  AGENT_E2E_OBSERVABILITY:
    process.env.AGENT_E2E_OBSERVABILITY === "1" ? "1" : "0",
  NODE_ENV: "development",
  APP_NAME: "Enterprise Agentic SaaS Deterministic E2E",
  APP_BASE_URL: agentEnvironment.webOrigin,
  API_PUBLIC_URL: agentEnvironment.apiOrigin,
  BETTER_AUTH_URL: agentEnvironment.apiOrigin,
  AUTH_COOKIE_DOMAIN: agentEnvironment.cookieDomain,
  TRUSTED_ORIGINS: agentEnvironment.webOrigin,
  CORS_ORIGIN: agentEnvironment.webOrigin,
  GITHUB_OAUTH_EMULATOR_URL: `${agentEnvironment.githubOrigin}/emulate/github`,
  GITHUB_OAUTH_EMULATOR_CLIENT_ID: "enterprise-agentic-saas-local",
  GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: "enterprise-agentic-saas-local-secret",
  GITHUB_OAUTH_CALLBACK_URL: agentCallbackUrl,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_BROWSER_TEST: "true",
}

const oauthStackEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: "development",
  APP_NAME: "Enterprise Agentic SaaS Deterministic OAuth E2E",
  APP_BASE_URL: oauthWebOrigin,
  API_PUBLIC_URL: oauthApiOrigin,
  BETTER_AUTH_URL: oauthApiOrigin,
  BETTER_AUTH_SECRET:
    "oauth-e2e-only-secret-with-at-least-thirty-two-characters",
  AUTH_COOKIE_DOMAIN: oauthCookieDomain,
  TRUSTED_ORIGINS: oauthWebOrigin,
  CORS_ORIGIN: oauthWebOrigin,
  TURSO_DATABASE_URL: oauthDatabaseUrl,
  TURSO_AUTH_TOKEN: "oauth-e2e-unused-token",
  EMAIL_PROVIDER: "noop",
  EMAIL_FROM: "noreply@example.test",
  MAILPIT_URL: "",
  GITHUB_CLIENT_ID: "unused-in-emulator",
  GITHUB_CLIENT_SECRET: "unused-in-emulator",
  GITHUB_OAUTH_EMULATOR_URL: `${oauthGithubOrigin}/emulate/github`,
  GITHUB_OAUTH_EMULATOR_CLIENT_ID: "enterprise-agentic-saas-local",
  GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: "enterprise-agentic-saas-local-secret",
  GITHUB_OAUTH_CALLBACK_URL: oauthCallbackUrl,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_BROWSER_TEST: "true",
}

export default defineConfig({
  testDir: "./e2e/deterministic",
  outputDir: "./test-results/deterministic",
  globalTeardown: "./e2e/fixtures/oauth-global-teardown.ts",
  metadata: {
    agentE2ERunId: agentEnvironment.runId,
    agentE2EApiOrigin: agentEnvironment.apiLoopbackOrigin,
    agentE2EMode: "scripted",
    oauthDatabasePath,
  },
  fullyParallel: true,
  failOnFlakyTests: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/deterministic" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "e1-scripted-agent-chromium",
      testMatch: "scripted-agent-*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: agentEnvironment.webOrigin,
        viewport: { width: 1280, height: 720 },
        video: "off",
      },
    },
    {
      name: "e1-oauth-chromium",
      fullyParallel: false,
      testMatch: "github-oauth.spec.ts",
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: oauthWebOrigin,
        viewport: { width: 1280, height: 720 },
        video: "on",
      },
    },
  ],
  webServer: [
    {
      command: "bun --no-env-file run e2e:emulate:github",
      url: `http://127.0.0.1:${agentEnvironment.githubPort}/emulate/github/meta`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...agentStackEnvironment,
        NEXT_DIST_DIR: `.next-e2e-agent-${runId}`,
        PORT: String(agentEnvironment.githubPort),
        PORTLESS_URL: agentEnvironment.githubOrigin,
      },
    },
    {
      command: "bun --no-env-file e2e/fixtures/agent-stack.ts",
      url: `http://127.0.0.1:${agentEnvironment.apiPort}/ready`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        ...agentStackEnvironment,
        AGENT_E2E_RUN_ID: String(agentEnvironment.runId),
        AGENT_E2E_SCRIPTED: "1",
      },
    },
    {
      command: `next build && next start --hostname 0.0.0.0 --port ${agentEnvironment.webPort}`,
      url: `http://127.0.0.1:${agentEnvironment.webPort}/auth/sign-in`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...agentStackEnvironment,
        NODE_ENV: "production",
        API_PUBLIC_URL: agentEnvironment.apiLoopbackOrigin,
        NEXT_DIST_DIR: ".next-e2e-deterministic-agent",
        NEXT_PUBLIC_API_BASE_URL: agentEnvironment.apiOrigin,
      },
    },
    {
      command: "bun --no-env-file run e2e:emulate:github",
      url: `${oauthGithubOrigin}/emulate/github/meta`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...oauthStackEnvironment,
        NEXT_DIST_DIR: `.next-e2e-oauth-${process.pid}`,
        PORT: "4101",
        PORTLESS_URL: oauthGithubOrigin,
      },
    },
    {
      command: "bun --no-env-file e2e/fixtures/oauth-api.ts",
      url: `${oauthApiLoopbackOrigin}/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...oauthStackEnvironment,
        PORT: "3101",
      },
    },
    {
      command: "next build && next start --hostname 0.0.0.0 --port 3100",
      url: "http://127.0.0.1:3100/auth/sign-in",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...oauthStackEnvironment,
        NODE_ENV: "production",
        API_PUBLIC_URL: oauthApiLoopbackOrigin,
        NEXT_DIST_DIR: ".next-e2e-deterministic-oauth",
        NEXT_PUBLIC_API_BASE_URL: oauthApiOrigin,
      },
    },
  ],
})
