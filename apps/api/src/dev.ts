import { rm } from "node:fs/promises"

import { waitForMailpitDevelopmentSession } from "@enterprise-agentic-saas/email/development"

import { isLocalDatabaseUrl } from "./development/file-seed-handler"
import {
  developmentRuntimeEnvPath,
  developmentSeedSessionPath,
  writePrivateFile,
} from "./development/session"
import { waitForDevelopmentDatabase } from "./development/wait-for-database"

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

const dotenvLine = (key: string, value: string) =>
  `${key}=${JSON.stringify(value)}\n`

const cleanup = () =>
  Promise.all([
    rm(developmentRuntimeEnvPath, { force: true }),
    rm(developmentSeedSessionPath, { force: true }),
  ])

let ownsRuntimeFiles = false

const main = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local Wrangler supervisor cannot run in production.")
  }
  if (!isLocalDatabaseUrl(process.env.TURSO_DATABASE_URL)) {
    throw new Error("Local Wrangler supervisor requires a local Turso URL.")
  }

  const port = Number(process.env.PORT)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Portless did not provide a valid local API port.")
  }

  await waitForDevelopmentDatabase()

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const endpoint = `http://127.0.0.1:${port.toString()}`
  const environment = new Map<string, string>()
  for (const key of forwardedEnvironmentKeys) {
    const value = process.env[key]
    if (value) environment.set(key, value)
  }
  const emailProvider = process.env.EMAIL_PROVIDER?.trim() || "mailpit"
  if (emailProvider === "mailpit" && !environment.has("MAILPIT_URL")) {
    const mailpit = await waitForMailpitDevelopmentSession()
    environment.set("MAILPIT_URL", mailpit.url)
  }
  environment.set("NODE_ENV", "development")
  environment.set("DEV_FILE_SEED_TOKEN", token)

  await writePrivateFile(
    developmentRuntimeEnvPath,
    [...environment].map(([key, value]) => dotenvLine(key, value)).join("")
  )
  ownsRuntimeFiles = true
  await writePrivateFile(
    developmentSeedSessionPath,
    `${JSON.stringify({ endpoint, mode: "local", token })}\n`
  )

  const worker = Bun.spawn(
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
      developmentRuntimeEnvPath,
      "--show-interactive-dev-session=false",
    ],
    {
      cwd: new URL("../", import.meta.url).pathname,
      env: process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }
  )

  const forwardSignal = () => worker.kill()
  process.once("SIGINT", forwardSignal)
  process.once("SIGTERM", forwardSignal)
  const exitCode = await worker.exited
  process.off("SIGINT", forwardSignal)
  process.off("SIGTERM", forwardSignal)
  await cleanup()
  process.exitCode = exitCode
}

try {
  await main()
} finally {
  if (ownsRuntimeFiles) await cleanup()
}
