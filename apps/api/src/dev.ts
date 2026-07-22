import { rm } from "node:fs/promises"

import { assertRepositoryLocalTursoUrl } from "@enterprise-agentic-saas/db/local-development"
import { waitForMailpitDevelopmentSession } from "@enterprise-agentic-saas/email/development"

import { acquireDevelopmentLease } from "./development/development-lock"
import {
  createLocalWorkerEnvironment,
  resolveDevelopmentAgentAssetUploadFlag,
  serializeLocalWorkerEnvironment,
  spawnLocalWorker,
} from "./development/local-worker"
import {
  createDevelopmentRuntimeEnvPath,
  developmentLeaseDatabasePath,
  removeDevelopmentSeedSessionIfOwned,
  removeStaleDevelopmentRuntimeEnvFiles,
  writeDevelopmentSeedSession,
  writePrivateFile,
} from "./development/session"
import { waitForDevelopmentDatabase } from "./development/wait-for-database"

const main = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local Wrangler supervisor cannot run in production.")
  }
  assertRepositoryLocalTursoUrl(process.env.TURSO_DATABASE_URL ?? "")

  const port = Number(process.env.PORT)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Portless did not provide a valid local API port.")
  }

  const lease = await acquireDevelopmentLease({
    databasePath: developmentLeaseDatabasePath,
    label: "Local API Worker",
    name: "local-api-worker",
  })
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const runtimeEnvironmentPath = createDevelopmentRuntimeEnvPath()
  let ownsRuntimeFiles = false

  const cleanup = async () => {
    await removeDevelopmentSeedSessionIfOwned(token)
    await rm(runtimeEnvironmentPath, { force: true })
  }

  try {
    await removeStaleDevelopmentRuntimeEnvFiles()
    await waitForDevelopmentDatabase()

    const endpoint = `http://127.0.0.1:${port.toString()}`
    const environment = createLocalWorkerEnvironment({
      overrides: {
        NODE_ENV: "development",
        PORT: String(port),
        DEV_FILE_SEED_TOKEN: token,
        AGENT_ASSET_UPLOAD_ENABLED: resolveDevelopmentAgentAssetUploadFlag(
          process.env
        ),
      },
    })
    const emailProvider = process.env.EMAIL_PROVIDER?.trim() || "mailpit"
    if (emailProvider === "mailpit" && !environment.has("MAILPIT_URL")) {
      const mailpit = await waitForMailpitDevelopmentSession()
      environment.set("MAILPIT_URL", mailpit.url)
    }

    await writePrivateFile(
      runtimeEnvironmentPath,
      serializeLocalWorkerEnvironment(environment)
    )
    ownsRuntimeFiles = true
    await writeDevelopmentSeedSession({ endpoint, mode: "local", token })

    const worker = spawnLocalWorker({
      environmentPath: runtimeEnvironmentPath,
      port,
    })
    const forwardSignal = () => worker.kill()
    process.once("SIGINT", forwardSignal)
    process.once("SIGTERM", forwardSignal)
    const exitCode = await worker.exited
    process.off("SIGINT", forwardSignal)
    process.off("SIGTERM", forwardSignal)
    process.exitCode = exitCode
  } finally {
    if (ownsRuntimeFiles) await cleanup()
    await lease.release()
  }
}

await main()
