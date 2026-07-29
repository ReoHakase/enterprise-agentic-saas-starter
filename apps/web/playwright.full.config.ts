import { defineConfig, devices } from "@playwright/test"

import {
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
} from "./e2e/fixtures/agent-e2e-environment"

const suppliedOpenRouterApiKey = process.env.OPENROUTER_API_KEY?.trim()
const paidE2EApproved = process.env.PAID_E2E_APPROVED === "1"
const validOpenRouterApiKey =
  suppliedOpenRouterApiKey !== undefined &&
  suppliedOpenRouterApiKey.length > 0 &&
  !/[\r\n]/u.test(suppliedOpenRouterApiKey)
process.env.FULL_E2E_GATE_ERROR = !paidE2EApproved
  ? "test:e2e:full requires PAID_E2E_APPROVED=1"
  : !validOpenRouterApiKey
    ? "test:e2e:full requires OPENROUTER_API_KEY"
    : ""
delete process.env.OPENROUTER_API_KEY
delete process.env.PAID_E2E_APPROVED
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1"
process.env.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE = "/dev/null"

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
  APP_NAME: "Enterprise Agentic SaaS Full E2E",
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
  NEXT_TELEMETRY_DISABLED: "1",
}

export default defineConfig({
  testDir: "./e2e/full",
  testMatch: "real-agent.spec.ts",
  outputDir: `${environment.temporaryRoot}/playwright-results/full`,
  globalSetup: "./e2e/fixtures/full-e2e-global-setup.ts",
  metadata: {
    agentE2ERunId: environment.runId,
    agentE2EApiOrigin: environment.apiOrigin,
    agentE2EMode: "full",
    agentE2EWebWorkspace: process.cwd(),
  },
  fullyParallel: false,
  failOnFlakyTests: true,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  preserveOutput: "never",
  timeout: 600_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: environment.webOrigin,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "e2-full-stack-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer:
    process.env.FULL_E2E_GATE_ERROR === ""
      ? [
          {
            command: "bun --no-env-file run e2e:emulate:github",
            url: `http://127.0.0.1:${environment.githubPort}/meta`,
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
              OPENROUTER_API_KEY: suppliedOpenRouterApiKey ?? "",
            },
          },
          {
            command: `next build && next start --hostname 0.0.0.0 --port ${environment.webPort}`,
            url: `http://127.0.0.1:${environment.webPort}/auth/sign-in`,
            reuseExistingServer: false,
            timeout: 180_000,
            env: {
              ...commonEnvironment,
              NODE_ENV: "production",
              API_PUBLIC_URL: environment.apiLoopbackOrigin,
              NEXT_DIST_DIR: environment.nextDistDirectory,
              NEXT_PUBLIC_API_BASE_URL: environment.apiOrigin,
            },
          },
        ]
      : [],
})
