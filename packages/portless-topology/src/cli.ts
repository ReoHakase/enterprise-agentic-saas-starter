#!/usr/bin/env bun

const REPOSITORY_LOGICAL_NAME = "enterprise-agentic-saas"
const LOCALHOST_SUFFIX = ".localhost"

type Environment = Record<string, string | undefined>

export type PortlessService = {
  hostname: string
  origin: string
  portlessName: string
}

const servicePrefixFromLogicalName = (logicalName: string) => {
  if (
    logicalName.length === 0 ||
    logicalName.includes("://") ||
    logicalName.endsWith(LOCALHOST_SUFFIX) ||
    /\s/u.test(logicalName)
  ) {
    throw new Error(
      `Invalid Portless logical name: ${logicalName || "(empty)"}`
    )
  }

  if (logicalName === REPOSITORY_LOGICAL_NAME) return ""

  const suffix = `.${REPOSITORY_LOGICAL_NAME}`
  if (!logicalName.endsWith(suffix)) {
    throw new Error(
      `Portless logical name must be ${REPOSITORY_LOGICAL_NAME} or a service-prefixed name.`
    )
  }

  const prefix = logicalName.slice(0, -REPOSITORY_LOGICAL_NAME.length)
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+$/u.test(prefix)) {
    throw new Error(`Invalid Portless service prefix: ${prefix}`)
  }
  return prefix
}

const parseRepositoryOrigin = (baseOrigin: string) => {
  let url: URL
  try {
    url = new URL(baseOrigin)
  } catch {
    throw new Error("Portless base namespace is not a valid URL.")
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith(`${REPOSITORY_LOGICAL_NAME}${LOCALHOST_SUFFIX}`)
  ) {
    throw new Error(
      "Portless base namespace must be a repository localhost origin."
    )
  }

  return url
}

export const resolvePortlessService = (
  baseOrigin: string,
  logicalName: string
): PortlessService => {
  const prefix = servicePrefixFromLogicalName(logicalName)
  const baseUrl = parseRepositoryOrigin(baseOrigin)
  const hostname = `${prefix}${baseUrl.hostname}`
  const port = baseUrl.port ? `:${baseUrl.port}` : ""

  return {
    hostname,
    origin: `${baseUrl.protocol}//${hostname}${port}`,
    portlessName: hostname.slice(0, -LOCALHOST_SUFFIX.length),
  }
}

export const createLocalTopologyEnvironment = (
  baseOrigin: string,
  source: Environment
): Environment => {
  const environment = { ...source }
  delete environment.EMULATE_BASE_URL
  delete environment.TURSO_AUTH_TOKEN

  const web = resolvePortlessService(baseOrigin, REPOSITORY_LOGICAL_NAME)
  const api = resolvePortlessService(
    baseOrigin,
    `api.${REPOSITORY_LOGICAL_NAME}`
  )
  const database = resolvePortlessService(
    baseOrigin,
    `db.${REPOSITORY_LOGICAL_NAME}`
  )
  const githubEmulator = resolvePortlessService(
    baseOrigin,
    `github.emulate.${REPOSITORY_LOGICAL_NAME}`
  )

  return {
    ...environment,
    API_PUBLIC_URL: api.origin,
    APP_BASE_URL: web.origin,
    AUTH_COOKIE_DOMAIN: web.hostname,
    BETTER_AUTH_URL: api.origin,
    CORS_ORIGIN: web.origin,
    GITHUB_OAUTH_CALLBACK_URL: `${api.origin}/auth/oauth2/callback/github`,
    GITHUB_OAUTH_EMULATOR_URL: githubEmulator.origin,
    NEXT_PUBLIC_API_BASE_URL: api.origin,
    TRUSTED_ORIGINS: web.origin,
    TURSO_DATABASE_URL: database.origin,
  }
}

const getRepositoryBaseOrigin = async () => {
  const child = Bun.spawn(["portless", "get", REPOSITORY_LOGICAL_NAME], {
    stderr: "inherit",
    stdout: "pipe",
  })
  const output = await new Response(child.stdout).text()
  const exitCode = await child.exited
  if (exitCode !== 0 || output.trim().length === 0) {
    throw new Error("Unable to resolve the Portless base namespace.")
  }
  const origin = output.trim()
  parseRepositoryOrigin(origin)
  return origin
}

const runChild = async (argv: string[], environment: Environment) => {
  const child = Bun.spawn(argv, {
    env: environment,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  })
  const forwardSignal = (signal: NodeJS.Signals) => child.kill(signal)
  const forwardSigint = () => forwardSignal("SIGINT")
  const forwardSigterm = () => forwardSignal("SIGTERM")
  process.once("SIGINT", forwardSigint)
  process.once("SIGTERM", forwardSigterm)

  try {
    return await child.exited
  } finally {
    process.off("SIGINT", forwardSigint)
    process.off("SIGTERM", forwardSigterm)
  }
}

const parseCommand = (arguments_: string[], offset: number) => {
  if (arguments_[offset] !== "--" || arguments_.length === offset + 1) {
    throw new Error("Specify a command after `--`.")
  }
  return arguments_.slice(offset + 1)
}

export const main = async (arguments_: string[]) => {
  const action = arguments_[0]
  const baseOrigin = await getRepositoryBaseOrigin()

  if (action === "resolve") {
    const logicalName = arguments_[1]
    if (arguments_.length !== 2 || !logicalName) {
      throw new Error("Usage: portless-topology resolve <logical-name>")
    }
    console.log(resolvePortlessService(baseOrigin, logicalName).origin)
    return 0
  }

  const environment = createLocalTopologyEnvironment(baseOrigin, process.env)
  if (action === "run") {
    const logicalName = arguments_[1]
    if (!logicalName) {
      throw new Error("Specify a Portless logical name.")
    }
    const command = parseCommand(arguments_, 2)
    const service = resolvePortlessService(baseOrigin, logicalName)
    return await runChild(
      ["portless", service.portlessName, ...command],
      environment
    )
  }

  if (action === "exec") {
    const command = parseCommand(arguments_, 1)
    return await runChild(command, environment)
  }

  throw new Error(
    "Usage: portless-topology <resolve|run|exec> [logical-name] [-- command...]"
  )
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Portless error")
    process.exitCode = 1
  }
}
