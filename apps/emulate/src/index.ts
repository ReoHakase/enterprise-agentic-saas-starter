import {
  LOCAL_GITHUB_OAUTH_CLIENT_ID,
  LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
} from "@enterprise-agentic-saas/auth/github-oauth"

import { EmulateEnvironmentError, parseEmulateConfig } from "./config/index"
import { GITHUB_OAUTH_CALLBACK_PATH } from "./protocol/github-oauth"
import { startEmulator } from "./server/emulator"
import { EmulateServiceError, parseEmulateService } from "./services/registry"
import { createGracefulShutdown } from "./state/lifecycle"

const PORTLESS_FLAG = "--portless"

export const resolveApiOrigin = async () => {
  const resolver = Bun.spawn(
    ["portless-topology", "resolve", "api.enterprise-agentic-saas"],
    {
      stdout: "pipe",
      stderr: "inherit",
    }
  )
  const output = await new Response(resolver.stdout).text()
  const exitCode = await resolver.exited

  if (exitCode !== 0 || output.trim().length === 0) {
    throw new Error("APIのPortless URLを解決できませんでした。")
  }

  return output.trim()
}

type RunTopology = (input: {
  command: string[]
  environment: NodeJS.ProcessEnv
  logicalName: string
}) => Promise<number>

const runTopology: RunTopology = async ({
  command,
  environment,
  logicalName,
}) => {
  const child = Bun.spawn(
    ["portless-topology", "run", logicalName, "--", ...command],
    {
      env: environment,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }
  )

  const forwardSigint = () => child.kill("SIGINT")
  const forwardSigterm = () => child.kill("SIGTERM")
  process.once("SIGINT", forwardSigint)
  process.once("SIGTERM", forwardSigterm)
  try {
    return await child.exited
  } finally {
    process.off("SIGINT", forwardSigint)
    process.off("SIGTERM", forwardSigterm)
  }
}

export const runPortless = async (
  serviceInput: string | undefined,
  dependencies: {
    environment?: NodeJS.ProcessEnv
    resolveApiOrigin?: () => Promise<string>
    runTopology?: RunTopology
  } = {}
) => {
  const service = parseEmulateService(serviceInput)
  const environment = { ...(dependencies.environment ?? process.env) }

  if (service === "github" && !environment.GITHUB_OAUTH_CALLBACK_URL?.trim()) {
    const apiOrigin = await (
      dependencies.resolveApiOrigin ?? resolveApiOrigin
    )()
    environment.GITHUB_OAUTH_CALLBACK_URL = `${apiOrigin.replace(/\/$/u, "")}${GITHUB_OAUTH_CALLBACK_PATH}`
  }

  return await (dependencies.runTopology ?? runTopology)({
    command: ["bun", "run", "src/index.ts", service],
    environment,
    logicalName: `${service}.emulate.enterprise-agentic-saas`,
  })
}

const runHttp = async (serviceInput: string | undefined) => {
  const config = parseEmulateConfig(serviceInput, process.env, {
    clientId: LOCAL_GITHUB_OAUTH_CLIENT_ID,
    clientSecret: LOCAL_GITHUB_OAUTH_CLIENT_SECRET,
  })
  const emulator = await startEmulator(config)
  const shutdown = createGracefulShutdown(emulator, (code) =>
    process.exit(code)
  )

  process.once("SIGINT", () => void shutdown())
  process.once("SIGTERM", () => void shutdown())

  console.info(`${config.service} emulator: ${emulator.url}`)
}

const main = async () => {
  if (process.argv[2] === PORTLESS_FLAG) {
    process.exitCode = await runPortless(process.argv[3])
    return
  }
  await runHttp(process.argv[2])
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    if (
      error instanceof EmulateEnvironmentError ||
      error instanceof EmulateServiceError
    ) {
      console.error(error.message)
    } else {
      console.error("emulatorを起動できませんでした。")
    }

    process.exitCode = 1
  })
}
