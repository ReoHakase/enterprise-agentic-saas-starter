import { fileURLToPath } from "node:url"

const apiRoot = fileURLToPath(new URL("../../", import.meta.url))

const forwardedEnvironmentKeys = [
  "NODE_ENV",
  "PORT",
  "APP_NAME",
  "APP_BASE_URL",
  "API_PUBLIC_URL",
  "AGENT_ASSET_UPLOAD_ENABLED",
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
  "DEV_SESSION_ID",
  "DEV_WORKTREE_ID",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
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

export const resolveDevelopmentAgentAssetUploadFlag = (
  environment: Readonly<Record<string, string | undefined>> = process.env
) => environment.AGENT_ASSET_UPLOAD_ENABLED?.trim() || "1"

export const resolveWranglerInspectorPort = (
  environment: Readonly<Record<string, string | undefined>> = process.env
) => {
  const rawPort = environment.WRANGLER_INSPECTOR_PORT?.trim() || "0"
  if (!/^\d+$/.test(rawPort)) {
    throw new Error(
      "WRANGLER_INSPECTOR_PORT must be an integer from 0 to 65535"
    )
  }
  const port = Number(rawPort)
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error(
      "WRANGLER_INSPECTOR_PORT must be an integer from 0 to 65535"
    )
  }
  return String(port)
}

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
      "--inspector-port",
      resolveWranglerInspectorPort(environment),
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
