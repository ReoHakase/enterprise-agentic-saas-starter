import { fileURLToPath } from "node:url"

export const apiRoot = fileURLToPath(new URL("../../", import.meta.url))

const forwardedEnvironmentKeys = [
  "NODE_ENV",
  "PORT",
  "APP_NAME",
  "APP_BASE_URL",
  "API_PUBLIC_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "AUTH_COOKIE_DOMAIN",
  "TRUSTED_ORIGINS",
  "CORS_ORIGIN",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_OAUTH_EMULATOR_URL",
  "GITHUB_OAUTH_EMULATOR_CLIENT_ID",
  "GITHUB_OAUTH_EMULATOR_CLIENT_SECRET",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "EMAIL_PROVIDER",
  "EMAIL_FROM",
  "MAILPIT_URL",
  "SENTRY_DSN",
  "SENTRY_ENVIRONMENT",
  "SENTRY_RELEASE",
  "SENTRY_SPOTLIGHT",
  "SENTRY_TRACES_SAMPLE_RATE",
] as const

export const createLocalWorkerEnvironment = ({
  overrides = {},
  source = process.env,
}: {
  overrides?: Record<string, string | undefined>
  source?: NodeJS.ProcessEnv
} = {}) => {
  const environment = new Map<string, string>()
  for (const key of forwardedEnvironmentKeys) {
    const value = source[key]
    if (value) environment.set(key, value)
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) environment.set(key, value)
    else environment.delete(key)
  }
  return environment
}

export const serializeLocalWorkerEnvironment = (
  environment: ReadonlyMap<string, string>
) =>
  [...environment]
    .map(([key, value]) => `${key}=${JSON.stringify(value)}\n`)
    .join("")

export const spawnLocalWorker = ({
  environment = process.env,
  environmentPath,
  logLevel,
  port,
}: {
  environment?: NodeJS.ProcessEnv
  environmentPath: string
  logLevel?: "debug" | "info" | "log" | "warn" | "error" | "none"
  port: number
}) =>
  Bun.spawn(
    [
      "wrangler",
      "dev",
      "--local",
      "--persist-to",
      ".wrangler/state",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--env-file",
      environmentPath,
      "--show-interactive-dev-session=false",
      ...(logLevel ? ["--log-level", logLevel] : []),
    ],
    {
      cwd: apiRoot,
      env: environment,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }
  )
