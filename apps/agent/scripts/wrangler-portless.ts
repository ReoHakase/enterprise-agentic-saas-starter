const LOCAL_STORAGE_TOKEN = "local-agent-storage"
const REPOSITORY_HOST_SUFFIX = ".enterprise-agentic-saas.localhost"

type Environment = Record<string, string | undefined>

const requireValue = (environment: Environment, name: string): string => {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const resolvePort = (
  environment: Environment,
  name: string,
  fallback?: string
): string => {
  const value = environment[name]?.trim() || fallback
  if (!value) throw new Error(`${name} is required`)
  const parsed = /^\d+$/u.test(value) ? Number(value) : -1
  if (parsed < 0 || parsed > 65_535) {
    throw new Error(`${name} must be an integer from 0 to 65535`)
  }
  return value
}

const resolveStorageOrigin = (environment: Environment): string => {
  const value = requireValue(environment, "MASTRA_STORAGE_URL")
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("MASTRA_STORAGE_URL must be a local Agent storage origin")
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !url.hostname.startsWith("agent-storage.") ||
    !url.hostname.endsWith(REPOSITORY_HOST_SUFFIX)
  ) {
    throw new Error("MASTRA_STORAGE_URL must be a local Agent storage origin")
  }
  return url.origin
}

export const createWranglerArguments = (environment: Environment): string[] => {
  const port = resolvePort(environment, "PORT")
  const inspectorPort = resolvePort(environment, "WRANGLER_INSPECTOR_PORT", "0")
  const storageOrigin = resolveStorageOrigin(environment)
  const storageToken = requireValue(environment, "MASTRA_STORAGE_AUTH_TOKEN")
  if (storageToken !== LOCAL_STORAGE_TOKEN) {
    throw new Error(
      "MASTRA_STORAGE_AUTH_TOKEN must use the local Agent storage token"
    )
  }

  return [
    "dev",
    "--port",
    port,
    "--inspector-port",
    inspectorPort,
    "--env-file",
    ".dev.vars.example",
    "--env-file",
    ".env.local",
    "--var",
    `MASTRA_STORAGE_URL:${storageOrigin}`,
    "--var",
    `MASTRA_STORAGE_AUTH_TOKEN:${storageToken}`,
  ]
}

const run = async (environment: Environment): Promise<number> => {
  const child = Bun.spawn(
    ["wrangler", ...createWranglerArguments(environment)],
    {
      env: environment,
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    }
  )
  const forwardSignal = (signal: NodeJS.Signals) => child.kill(signal)
  const forwardSigint = () => forwardSignal("SIGINT")
  const forwardSigterm = () => forwardSignal("SIGTERM")
  process.on("SIGINT", forwardSigint)
  process.on("SIGTERM", forwardSigterm)

  try {
    return await child.exited
  } finally {
    process.off("SIGINT", forwardSigint)
    process.off("SIGTERM", forwardSigterm)
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await run(process.env)
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unable to start Wrangler"
    )
    process.exitCode = 1
  }
}
