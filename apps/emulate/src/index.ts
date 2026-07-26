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

const resolveApiOrigin = async () => {
  const portless = Bun.spawn(
    ["portless", "get", "api.enterprise-agentic-saas"],
    {
      stdout: "pipe",
      stderr: "inherit",
    }
  )
  const output = await new Response(portless.stdout).text()
  const exitCode = await portless.exited

  if (exitCode !== 0 || output.trim().length === 0) {
    throw new Error("APIのPortless URLを解決できませんでした。")
  }

  return output.trim()
}

const runPortless = async (serviceInput: string | undefined) => {
  const service = parseEmulateService(serviceInput)
  const environment = { ...process.env }

  if (service === "github" && !environment.GITHUB_OAUTH_CALLBACK_URL?.trim()) {
    const apiOrigin = await resolveApiOrigin()
    environment.GITHUB_OAUTH_CALLBACK_URL = `${apiOrigin.replace(/\/$/u, "")}${GITHUB_OAUTH_CALLBACK_PATH}`
  }

  const child = Bun.spawn(
    [
      "portless",
      "run",
      "--name",
      `${service}.emulate.enterprise-agentic-saas`,
      "bun",
      "run",
      "src/index.ts",
      service,
    ],
    {
      env: environment,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }
  )

  process.once("SIGINT", () => child.kill("SIGINT"))
  process.once("SIGTERM", () => child.kill("SIGTERM"))
  process.exitCode = await child.exited
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

const main = () =>
  process.argv[2] === PORTLESS_FLAG
    ? runPortless(process.argv[3])
    : runHttp(process.argv[2])

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
