import { type PlaywrightTestConfig } from "@playwright/test"

import {
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
} from "./agent-e2e-environment"
import { createOAuthDatabasePath } from "./oauth-database"
import {
  createAgentStackEnvironment,
  createInheritedPlaywrightEnvironment,
  desktopChromium,
} from "./playwright-profile-environment"

type DeterministicE2EProfile = "all" | "agent" | "auth"

const parseDeterministicE2EProfile = (
  value: string | undefined
): DeterministicE2EProfile => {
  const normalized = value?.trim() || "all"
  if (normalized === "all" || normalized === "agent" || normalized === "auth") {
    return normalized
  }
  throw new Error(
    `Unsupported DETERMINISTIC_E2E_PROFILE: ${normalized}. Expected all, agent, or auth.`
  )
}

const createAgentProfile = (runId: number) => {
  const environment = createAgentE2EEnvironment(runId)
  const stackEnvironment = createAgentStackEnvironment({
    appName: "Enterprise Agentic SaaS Deterministic E2E",
    environment,
  })
  const projects = [
    {
      name: "e1-scripted-agent-auth-setup",
      testMatch: "agent-auth.setup.ts",
      workers: 1,
      use: {
        ...desktopChromium,
        baseURL: environment.webOrigin,
        video: "off",
      },
    },
    {
      name: "e1-mcp-oauth-chromium",
      dependencies: ["e1-scripted-agent-auth-setup"],
      testMatch: "mcp-oauth.spec.ts",
      workers: 1,
      use: {
        ...desktopChromium,
        baseURL: environment.webOrigin,
        screenshot: "only-on-failure",
        trace: "off",
        video: "off",
      },
    },
    {
      name: "e1-scripted-agent-chromium",
      dependencies: ["e1-scripted-agent-auth-setup"],
      testMatch: "scripted-agent-*.spec.ts",
      testIgnore: "scripted-agent-cancel.spec.ts",
      use: {
        ...desktopChromium,
        baseURL: environment.webOrigin,
        video: "off",
      },
    },
    {
      name: "e1-scripted-agent-cancel-chromium",
      dependencies: ["e1-scripted-agent-chromium"],
      testMatch: "scripted-agent-cancel.spec.ts",
      workers: 1,
      use: {
        ...desktopChromium,
        baseURL: environment.webOrigin,
        video: "off",
      },
    },
  ] satisfies NonNullable<PlaywrightTestConfig["projects"]>
  const webServers = [
    {
      command: "bun --no-env-file run e2e:emulate:github",
      url: `http://127.0.0.1:${environment.githubPort}/emulate/github/meta`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...stackEnvironment,
        NEXT_DIST_DIR: `.next-e2e-agent-${runId}`,
        PORT: String(environment.githubPort),
        PORTLESS_URL: environment.githubOrigin,
      },
    },
    {
      command: "bun --no-env-file e2e/fixtures/agent-stack.ts",
      url: `http://127.0.0.1:${environment.apiPort}/ready`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        ...stackEnvironment,
        AGENT_E2E_RUN_ID: String(environment.runId),
        AGENT_E2E_SCRIPTED: "1",
      },
    },
    {
      command: `next build && next start --hostname 0.0.0.0 --port ${environment.webPort}`,
      url: `http://127.0.0.1:${environment.webPort}/auth/sign-in`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...stackEnvironment,
        NODE_ENV: "production",
        API_PUBLIC_URL: environment.apiLoopbackOrigin,
        NEXT_DIST_DIR: ".next-e2e-deterministic-agent",
        NEXT_PUBLIC_API_BASE_URL: environment.apiOrigin,
      },
    },
  ] satisfies NonNullable<PlaywrightTestConfig["webServer"]>

  return {
    metadata: {
      agentE2ERunId: environment.runId,
      agentE2EApiOrigin: environment.apiLoopbackOrigin,
      mcpE2EApiPublicOrigin: environment.apiOrigin,
      agentE2EMode: "scripted",
    },
    projects,
    webServers,
  }
}

const createAuthProfile = () => {
  const webOrigin = "http://oauth-e2e.enterprise-agentic-saas.localhost:3100"
  const apiOrigin =
    "http://api.oauth-e2e.enterprise-agentic-saas.localhost:3101"
  const apiLoopbackOrigin = "http://127.0.0.1:3101"
  const githubOrigin = "http://127.0.0.1:4101"
  const cookieDomain = "oauth-e2e.enterprise-agentic-saas.localhost"
  const databasePath = createOAuthDatabasePath(process.pid)
  const callbackUrl = `${apiOrigin}/auth/callback/github`
  const stackEnvironment = {
    ...createInheritedPlaywrightEnvironment(),
    NODE_ENV: "development",
    APP_NAME: "Enterprise Agentic SaaS Deterministic OAuth E2E",
    APP_BASE_URL: webOrigin,
    API_PUBLIC_URL: apiOrigin,
    BETTER_AUTH_URL: apiOrigin,
    BETTER_AUTH_SECRET:
      "oauth-e2e-only-secret-with-at-least-thirty-two-characters",
    AUTH_COOKIE_DOMAIN: cookieDomain,
    TRUSTED_ORIGINS: webOrigin,
    CORS_ORIGIN: webOrigin,
    TURSO_DATABASE_URL: `file:${databasePath}`,
    TURSO_AUTH_TOKEN: "oauth-e2e-unused-token",
    EMAIL_PROVIDER: "noop",
    EMAIL_FROM: "noreply@example.test",
    MAILPIT_URL: "",
    GITHUB_CLIENT_ID: "unused-in-emulator",
    GITHUB_CLIENT_SECRET: "unused-in-emulator",
    GITHUB_OAUTH_EMULATOR_URL: `${githubOrigin}/emulate/github`,
    GITHUB_OAUTH_EMULATOR_CLIENT_ID: "enterprise-agentic-saas-local",
    GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: "enterprise-agentic-saas-local-secret",
    GITHUB_OAUTH_CALLBACK_URL: callbackUrl,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_BROWSER_TEST: "true",
  }
  const projects = [
    {
      name: "e1-oauth-chromium",
      fullyParallel: false,
      testMatch: "github-oauth.spec.ts",
      workers: 1,
      use: {
        ...desktopChromium,
        baseURL: webOrigin,
        video: "on",
      },
    },
  ] satisfies NonNullable<PlaywrightTestConfig["projects"]>
  const webServers = [
    {
      command: "bun --no-env-file run e2e:emulate:github",
      url: `${githubOrigin}/emulate/github/meta`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...stackEnvironment,
        NEXT_DIST_DIR: `.next-e2e-oauth-${process.pid}`,
        PORT: "4101",
        PORTLESS_URL: githubOrigin,
      },
    },
    {
      command: "bun --no-env-file e2e/fixtures/oauth-api.ts",
      url: `${apiLoopbackOrigin}/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...stackEnvironment,
        PORT: "3101",
      },
    },
    {
      command: "next build && next start --hostname 0.0.0.0 --port 3100",
      url: "http://127.0.0.1:3100/auth/sign-in",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...stackEnvironment,
        NODE_ENV: "production",
        API_PUBLIC_URL: apiLoopbackOrigin,
        NEXT_DIST_DIR: ".next-e2e-deterministic-oauth",
        NEXT_PUBLIC_API_BASE_URL: apiOrigin,
      },
    },
  ] satisfies NonNullable<PlaywrightTestConfig["webServer"]>

  return {
    databasePath,
    projects,
    webServers,
  }
}

export const createDeterministicPlaywrightProfile =
  (): PlaywrightTestConfig => {
    const deterministicE2EProfile = parseDeterministicE2EProfile(
      process.env.DETERMINISTIC_E2E_PROFILE
    )
    const reportDirectory =
      deterministicE2EProfile === "all"
        ? "deterministic"
        : `deterministic-${deterministicE2EProfile}`
    const runId = parseAgentE2ERunId(
      process.env.AGENT_E2E_RUN_ID ?? process.pid
    )
    process.env.AGENT_E2E_RUN_ID = String(runId)
    delete process.env.OPENROUTER_API_KEY

    const agentProfile =
      deterministicE2EProfile === "auth" ? undefined : createAgentProfile(runId)
    const authProfile =
      deterministicE2EProfile === "agent" ? undefined : createAuthProfile()

    return {
      testDir: "./e2e/deterministic",
      outputDir: `./test-results/${reportDirectory}`,
      globalTeardown: "./e2e/fixtures/deterministic-global-teardown.ts",
      metadata: {
        deterministicE2EProfile,
        ...agentProfile?.metadata,
        ...(authProfile ? { oauthDatabasePath: authProfile.databasePath } : {}),
      },
      fullyParallel: true,
      failOnFlakyTests: true,
      forbidOnly: Boolean(process.env.CI),
      retries: process.env.CI ? 2 : 0,
      workers:
        deterministicE2EProfile === "agent"
          ? 3
          : deterministicE2EProfile === "auth"
            ? 1
            : 2,
      timeout: 180_000,
      expect: { timeout: 30_000 },
      reporter: [
        ["list"],
        ["html", { outputFolder: `playwright-report/${reportDirectory}` }],
      ],
      use: {
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
      projects: [
        ...(agentProfile?.projects ?? []),
        ...(authProfile?.projects ?? []),
      ],
      webServer: [
        ...(agentProfile?.webServers ?? []),
        ...(authProfile?.webServers ?? []),
      ],
    }
  }
