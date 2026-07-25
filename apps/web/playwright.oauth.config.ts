import { defineConfig, devices } from "@playwright/test"

import { createOAuthDatabasePath } from "./e2e/fixtures/oauth-database"

const webOrigin = "http://oauth-e2e.enterprise-agentic-saas.localhost:3100"
const apiOrigin = "http://api.oauth-e2e.enterprise-agentic-saas.localhost:3101"
const githubOrigin =
  "http://github.oauth-e2e.enterprise-agentic-saas.localhost:4101"
const cookieDomain = "oauth-e2e.enterprise-agentic-saas.localhost"
const databasePath = createOAuthDatabasePath(process.pid)
const databaseUrl = `file:${databasePath}`
const callbackUrl = `${apiOrigin}/auth/oauth2/callback/github`

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

const oauthEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: "development",
  APP_NAME: "Enterprise Agentic SaaS OAuth E2E",
  APP_BASE_URL: webOrigin,
  API_PUBLIC_URL: apiOrigin,
  BETTER_AUTH_URL: apiOrigin,
  BETTER_AUTH_SECRET:
    "oauth-e2e-only-secret-with-at-least-thirty-two-characters",
  AUTH_COOKIE_DOMAIN: cookieDomain,
  TRUSTED_ORIGINS: webOrigin,
  CORS_ORIGIN: webOrigin,
  TURSO_DATABASE_URL: databaseUrl,
  TURSO_AUTH_TOKEN: "oauth-e2e-unused-token",
  EMAIL_PROVIDER: "noop",
  EMAIL_FROM: "noreply@example.test",
  MAILPIT_URL: "",
  GITHUB_CLIENT_ID: "unused-in-emulator",
  GITHUB_CLIENT_SECRET: "unused-in-emulator",
  GITHUB_OAUTH_EMULATOR_URL: githubOrigin,
  GITHUB_OAUTH_EMULATOR_CLIENT_ID: "enterprise-agentic-saas-local",
  GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: "enterprise-agentic-saas-local-secret",
  GITHUB_OAUTH_CALLBACK_URL: callbackUrl,
  SENTRY_DSN: "",
  SENTRY_ENVIRONMENT: "oauth-e2e",
  SENTRY_ERROR_SAMPLE_RATE: "0",
  SENTRY_AUTH_TOKEN: "",
  SENTRY_ORG: "",
  SENTRY_PROJECT: "",
  SENTRY_RELEASE: "",
  SENTRY_SPOTLIGHT: "",
  SENTRY_TRACES_SAMPLE_RATE: "0",
  NEXT_PUBLIC_SENTRY_DSN: "",
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: "oauth-e2e",
  NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE: "0",
  NEXT_PUBLIC_SENTRY_SPOTLIGHT: "",
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0",
  NEXT_TELEMETRY_DISABLED: "1",
}

export default defineConfig({
  testDir: "./e2e/oauth",
  outputDir: "./test-results/oauth",
  globalTeardown: "./e2e/fixtures/oauth-global-teardown.ts",
  metadata: { oauthDatabasePath: databasePath },
  fullyParallel: false,
  failOnFlakyTests: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report/oauth" }]],
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on",
  },
  projects: [
    {
      name: "oauth-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: [
    {
      command: "bun --no-env-file run e2e:github-emulator",
      url: `${githubOrigin}/meta`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...oauthEnvironment,
        PORT: "4101",
        PORTLESS_URL: githubOrigin,
      },
    },
    {
      command: "bun --no-env-file e2e/fixtures/oauth-api.ts",
      url: `${apiOrigin}/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...oauthEnvironment,
        PORT: "3101",
      },
    },
    {
      command: "next dev --hostname 0.0.0.0 --port 3100 --turbopack",
      url: `${webOrigin}/auth/sign-in`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...oauthEnvironment,
        API_PUBLIC_URL: apiOrigin,
        NEXT_DIST_DIR: ".next-e2e-oauth",
        NEXT_PUBLIC_API_BASE_URL: apiOrigin,
      },
    },
  ],
})
