import { defineConfig, devices } from "@playwright/test"

import {
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
} from "./e2e/fixtures/agent-e2e-environment"

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
  APP_NAME: "Enterprise Agentic SaaS Scripted Agent E2E",
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
  SENTRY_ENVIRONMENT: "agent-e2e-scripted",
  SENTRY_RELEASE: "",
  SENTRY_SPOTLIGHT: "",
  SENTRY_TRACES_SAMPLE_RATE: "0",
  NEXT_PUBLIC_SENTRY_DSN: "",
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: "agent-e2e-scripted",
  NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE: "0",
  NEXT_PUBLIC_SENTRY_SPOTLIGHT: "",
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0",
  NEXT_TELEMETRY_DISABLED: "1",
}

export default defineConfig({
  testDir: "./e2e/agent",
  testMatch: "scripted-agent.spec.ts",
  outputDir: "test-results/scripted-agent",
  metadata: {
    agentE2ERunId: environment.runId,
    agentE2EApiOrigin: environment.apiOrigin,
    agentE2EMode: "scripted",
  },
  fullyParallel: true,
  failOnFlakyTests: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: environment.webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "e2-scripted-agent-chromium",
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
      timeout: 60_000,
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
      timeout: 240_000,
      env: {
        ...commonEnvironment,
        AGENT_E2E_RUN_ID: String(environment.runId),
        AGENT_E2E_SCRIPTED: "1",
      },
    },
    {
      command: `next build && next start --hostname 0.0.0.0 --port ${environment.webPort}`,
      url: `${environment.webOrigin}/auth/sign-in`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...commonEnvironment,
        NODE_ENV: "production",
        API_PUBLIC_URL: environment.apiOrigin,
        NEXT_DIST_DIR: ".next-e2e-scripted-agent",
        NEXT_PUBLIC_API_BASE_URL: environment.apiOrigin,
      },
    },
  ],
})
