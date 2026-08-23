import { devices } from "@playwright/test"

type AgentStackTopology = {
  apiOrigin: string
  cookieDomain: string
  githubOrigin: string
  webOrigin: string
}

const inheritedEnvironmentNames = [
  "PATH",
  "HOME",
  "TMPDIR",
  "USER",
  "SHELL",
  "LANG",
  "LC_ALL",
  "CI",
  "TERM",
] as const

export const createInheritedPlaywrightEnvironment = (
  environment: Readonly<Record<string, string | undefined>> = process.env
): Record<string, string> =>
  Object.fromEntries(
    inheritedEnvironmentNames.flatMap((name) => {
      const value = environment[name]
      return value === undefined ? [] : [[name, value]]
    })
  )

export const createAgentStackEnvironment = ({
  appName,
  environment,
  processEnvironment = process.env,
}: {
  appName: string
  environment: AgentStackTopology
  processEnvironment?: Readonly<Record<string, string | undefined>>
}): Record<string, string> => ({
  ...createInheritedPlaywrightEnvironment(processEnvironment),
  AGENT_E2E_OBSERVABILITY:
    processEnvironment.AGENT_E2E_OBSERVABILITY === "1" ? "1" : "0",
  NODE_ENV: "development",
  APP_NAME: appName,
  APP_BASE_URL: environment.webOrigin,
  API_PUBLIC_URL: environment.apiOrigin,
  BETTER_AUTH_URL: environment.apiOrigin,
  AUTH_COOKIE_DOMAIN: environment.cookieDomain,
  TRUSTED_ORIGINS: environment.webOrigin,
  CORS_ORIGIN: environment.webOrigin,
  GITHUB_OAUTH_EMULATOR_URL: `${environment.githubOrigin}/emulate/github`,
  GITHUB_OAUTH_EMULATOR_CLIENT_ID: "enterprise-agentic-saas-local",
  GITHUB_OAUTH_EMULATOR_CLIENT_SECRET: "enterprise-agentic-saas-local-secret",
  GITHUB_OAUTH_CALLBACK_URL: `${environment.apiOrigin}/auth/callback/github`,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_BROWSER_TEST: "true",
})

export const desktopChromium = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 720 },
}
