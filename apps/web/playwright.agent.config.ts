import { defineConfig, devices } from "@playwright/test"

import {
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
} from "./e2e/fixtures/agent-e2e-environment"

// Playwright evaluates this module again in its worker process. Persist the
// coordinator's run id so every process derives the same ports and temp root.
const runId = parseAgentE2ERunId(process.env.AGENT_E2E_RUN_ID ?? process.pid)
process.env.AGENT_E2E_RUN_ID = String(runId)
const environment = createAgentE2EEnvironment(runId)
const callbackUrl = `${environment.apiOrigin}/auth/oauth2/callback/github`

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

const commonEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: "development",
  APP_NAME: "Enterprise Agentic SaaS Agent E2E",
  APP_BASE_URL: environment.webOrigin,
  API_PUBLIC_URL: environment.apiOrigin,
  BETTER_AUTH_URL: environment.apiOrigin,
  AUTH_COOKIE_DOMAIN: environment.cookieDomain,
  TRUSTED_ORIGINS: environment.webOrigin,
  CORS_ORIGIN: environment.webOrigin,
  GITHUB_OAUTH_EMULATOR_URL: environment.githubOrigin,
  GITHUB_OAUTH_EMULATOR_CLIENT_ID: "enterprise-agentic-saas-local",
  GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: "enterprise-agentic-saas-local-secret",
  GITHUB_OAUTH_CALLBACK_URL: callbackUrl,
  SENTRY_DSN: "",
  SENTRY_ENVIRONMENT: "agent-e2e",
  SENTRY_RELEASE: "",
  SENTRY_SPOTLIGHT: "",
  SENTRY_TRACES_SAMPLE_RATE: "0",
  NEXT_PUBLIC_SENTRY_DSN: "",
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: "agent-e2e",
  NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE: "0",
  NEXT_PUBLIC_SENTRY_SPOTLIGHT: "",
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0",
  NEXT_TELEMETRY_DISABLED: "1",
}

const suppliedOpenRouterApiKey = process.env.OPENROUTER_API_KEY
delete process.env.OPENROUTER_API_KEY
const optionalOpenRouterEnvironment: Record<string, string> = {}
if (suppliedOpenRouterApiKey) {
  optionalOpenRouterEnvironment.OPENROUTER_API_KEY = suppliedOpenRouterApiKey
}

export default defineConfig({
  testDir: "./e2e/agent",
  outputDir: `${environment.temporaryRoot}/playwright-results`,
  metadata: {
    agentE2ERunId: environment.runId,
    agentE2EApiOrigin: environment.apiOrigin,
  },
  fullyParallel: false,
  failOnFlakyTests: true,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 600_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: environment.webOrigin,
    // The paid response body must not be copied into test artifacts.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "real-agent-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: [
    {
      command: "bun --no-env-file run e2e:github-emulator",
      url: `${environment.githubOrigin}/meta`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...commonEnvironment,
        PORT: String(environment.githubPort),
        PORTLESS_URL: environment.githubOrigin,
      },
    },
    {
      command: "bun --no-env-file e2e/fixtures/agent-stack.ts",
      url: `${environment.apiOrigin}/ready`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...commonEnvironment,
        ...optionalOpenRouterEnvironment,
        AGENT_E2E_RUN_ID: String(environment.runId),
      },
    },
    {
      command: `next dev --hostname 0.0.0.0 --port ${environment.webPort} --turbopack`,
      url: `${environment.webOrigin}/auth/sign-in`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...commonEnvironment,
        API_PUBLIC_URL: environment.apiOrigin,
        NEXT_DIST_DIR: ".next-e2e-agent",
        NEXT_PUBLIC_API_BASE_URL: environment.apiOrigin,
      },
    },
  ],
})
