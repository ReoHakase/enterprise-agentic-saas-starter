import { rm } from "node:fs/promises"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"

import { assertRepositoryLocalTursoUrl } from "@enterprise-agentic-saas/db/local-development"

import {
  acquireDevelopmentLease,
  DevelopmentLockBusyError,
  type DevelopmentLease,
} from "./development-lock"
import {
  createLocalWorkerEnvironment,
  serializeLocalWorkerEnvironment,
  spawnLocalWorker,
} from "./local-worker"
import {
  checkDevelopmentFileSeedSession,
  reconcileDevelopmentFiles,
} from "./seed-client"
import {
  createDevelopmentRuntimeEnvPath,
  developmentLeaseDatabasePath,
  developmentSeedSessionPath,
  readDevelopmentSeedSession,
  removeStaleDevelopmentRuntimeEnvFiles,
  type DevelopmentSeedSession,
  writePrivateFile,
} from "./session"

const databaseRoot = fileURLToPath(
  new URL("../../../../packages/db/", import.meta.url)
)
const DATABASE_START_TIMEOUT_MS = 120_000
const WORKER_START_TIMEOUT_MS = 120_000
const ACTIVE_SESSION_PROBE_MS = 300
const STARTING_SESSION_WAIT_MS = 15_000
const POLL_INTERVAL_MS = 250
const PROCESS_STOP_TIMEOUT_MS = 5_000

type ManagedService = {
  stop: () => Promise<void>
}

type StartedWorker = {
  service: ManagedService
  session: DevelopmentSeedSession
}

export type DevelopmentSeedCommandServices = {
  acquireSeedLease: () => Promise<DevelopmentLease>
  acquireWorkerLease: () => Promise<DevelopmentLease>
  assertSafeConfiguration: () => void
  clearStaleSession: () => Promise<void>
  ensureDatabaseRunning: (
    signal?: AbortSignal
  ) => Promise<ManagedService | undefined>
  findActiveSession: (
    timeoutMs: number,
    signal?: AbortSignal
  ) => Promise<DevelopmentSeedSession | undefined>
  prepareDatabase: (signal?: AbortSignal) => Promise<void>
  reconcile: (
    session: DevelopmentSeedSession,
    signal?: AbortSignal
  ) => Promise<number>
  report: (message: string) => void
  seedDatabase: (signal?: AbortSignal) => Promise<void>
  startWorker: (signal?: AbortSignal) => Promise<StartedWorker>
}

const abortReason = (signal: AbortSignal) =>
  signal.reason ?? new Error("Development seed was interrupted.")

const delay = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal))
      return
    }
    const onAbort = () => {
      clearTimeout(timeout)
      reject(signal ? abortReason(signal) : undefined)
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener("abort", onAbort, { once: true })
  })

const cleanupAll = async (actions: Array<() => Promise<void>>) => {
  let firstFailure: unknown
  for (const action of actions) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- ownership cleanup order is intentional.
      await action()
    } catch (cause) {
      firstFailure ??= cause
    }
  }
  return firstFailure
}

export const runDevelopmentSeedCommand = async ({
  services,
  signal,
}: {
  services: DevelopmentSeedCommandServices
  signal?: AbortSignal
}) => {
  services.assertSafeConfiguration()
  if (signal?.aborted) throw abortReason(signal)

  let seedLease: DevelopmentLease | undefined
  let workerLease: DevelopmentLease | undefined
  let databaseService: ManagedService | undefined
  let workerService: ManagedService | undefined
  let result:
    | {
        fixtureCount: number
        reusedWorker: boolean
      }
    | undefined
  let commandFailure: unknown

  try {
    seedLease = await services.acquireSeedLease()
    let session = await services.findActiveSession(
      ACTIVE_SESSION_PROBE_MS,
      signal
    )

    if (!session) {
      try {
        workerLease = await services.acquireWorkerLease()
      } catch (cause) {
        if (!(cause instanceof DevelopmentLockBusyError)) throw cause
        session = await services.findActiveSession(
          STARTING_SESSION_WAIT_MS,
          signal
        )
        if (!session) {
          throw new Error(
            "The local API Worker is starting or unavailable. Wait for `bun run dev` to become ready, then retry.",
            { cause }
          )
        }
      }
    }

    if (session) {
      services.report("Reusing the running local API Worker.")
      await services.seedDatabase(signal)
    } else {
      await services.clearStaleSession()
      databaseService = await services.ensureDatabaseRunning(signal)
      await services.prepareDatabase(signal)
      await services.seedDatabase(signal)
      const worker = await services.startWorker(signal)
      workerService = worker.service
      session = worker.session
    }

    const fixtureCount = await services.reconcile(session, signal)
    services.report(
      `Development DB and R2 seed completed for ${fixtureCount} fixtures.`
    )
    result = { fixtureCount, reusedWorker: workerService === undefined }
  } catch (cause) {
    commandFailure = cause
  }

  const cleanupFailure = await cleanupAll([
    ...(workerService ? [workerService.stop] : []),
    ...(databaseService ? [databaseService.stop] : []),
    ...(workerLease ? [workerLease.release] : []),
    ...(seedLease ? [seedLease.release] : []),
  ])
  if (commandFailure) throw commandFailure
  if (cleanupFailure) throw new Error("Local development seed cleanup failed.")
  if (!result) throw new Error("Local development seed did not complete.")
  return result
}

const spawnInherited = (command: string[], cwd: string) =>
  Bun.spawn(command, {
    cwd,
    env: { ...process.env, NODE_ENV: "development" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

const spawnSilent = (command: string[], cwd: string) =>
  Bun.spawn(command, {
    cwd,
    env: { ...process.env, NODE_ENV: "development" },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })

type SpawnedProcess =
  | ReturnType<typeof spawnInherited>
  | ReturnType<typeof spawnSilent>

const stopProcess = async (child: SpawnedProcess) => {
  if (child.exitCode !== null) return
  child.kill("SIGTERM")
  let timeout: ReturnType<typeof setTimeout> | undefined
  const stopped = await Promise.race([
    child.exited.then(() => true),
    new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(false), PROCESS_STOP_TIMEOUT_MS)
    }),
  ])
  if (timeout) clearTimeout(timeout)
  if (!stopped && child.exitCode === null) {
    child.kill("SIGKILL")
    await child.exited
  }
}

const runPackageScript = async ({
  cwd,
  failureMessage,
  script,
  signal,
}: {
  cwd: string
  failureMessage: string
  script: string
  signal?: AbortSignal
}) => {
  const child = spawnInherited(["bun", "run", script], cwd)
  const onAbort = () => child.kill("SIGTERM")
  if (signal?.aborted) onAbort()
  else signal?.addEventListener("abort", onAbort, { once: true })
  const exitCode = await child.exited
  signal?.removeEventListener("abort", onAbort)
  if (signal?.aborted) throw abortReason(signal)
  if (exitCode !== 0) throw new Error(failureMessage)
}

const checkDatabaseHealth = async ({
  databaseUrl,
  signal,
  timeoutMs = 1_000,
}: {
  databaseUrl: string
  signal?: AbortSignal
  timeoutMs?: number
}) => {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener("abort", onAbort, { once: true })
  const timeout = setTimeout(
    () => controller.abort(new Error("Local Turso health check timed out.")),
    Math.max(0, timeoutMs)
  )
  try {
    const result = await fetch(new URL("/health", databaseUrl), {
      signal: controller.signal,
    })
    await result.body?.cancel()
    return result.ok
  } catch {
    if (signal?.aborted) throw abortReason(signal)
    return false
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", onAbort)
  }
}

const waitForDatabase = async ({
  child,
  databaseUrl,
  signal,
}: {
  child: SpawnedProcess
  databaseUrl: string
  signal?: AbortSignal
}) => {
  const deadline = Date.now() + DATABASE_START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Temporary local Turso exited before becoming ready.")
    }
    // oxlint-disable-next-line no-await-in-loop -- readiness requires bounded polling.
    if (await checkDatabaseHealth({ databaseUrl, signal })) return
    // oxlint-disable-next-line no-await-in-loop -- readiness polling is intentionally sequential.
    await delay(POLL_INTERVAL_MS, signal)
  }
  throw new Error("Temporary local Turso did not become ready in time.")
}

const allocateLoopbackPort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        reject(new Error("Could not allocate a loopback Worker port."))
        return
      }
      server.close((cause) => {
        if (cause) reject(cause)
        else resolve(address.port)
      })
    })
  })

const findActiveDevelopmentSession = async (
  timeoutMs: number,
  signal?: AbortSignal
) => {
  const deadline = Date.now() + Math.max(0, timeoutMs)
  do {
    let session: DevelopmentSeedSession | undefined
    try {
      // oxlint-disable-next-line no-await-in-loop -- session may be published while dev starts.
      session = await readDevelopmentSeedSession()
    } catch {
      // Missing and stale sessions are both handled by the Worker lease boundary.
    }
    if (session) {
      const remaining = Math.max(1, deadline - Date.now())
      // oxlint-disable-next-line no-await-in-loop -- readiness follows session publication.
      const ready = await checkDevelopmentFileSeedSession({
        ...session,
        signal,
        timeoutMs: Math.min(750, remaining),
      })
      if (ready) return session
    }
    if (Date.now() >= deadline) return
    // oxlint-disable-next-line no-await-in-loop -- bounded polling avoids a second Worker owner.
    await delay(Math.min(POLL_INTERVAL_MS, deadline - Date.now()), signal)
  } while (Date.now() <= deadline)
}

const createDevelopmentSeedCommandServices =
  (): DevelopmentSeedCommandServices => {
    const databaseUrl = process.env.TURSO_DATABASE_URL ?? ""

    return {
      assertSafeConfiguration: () => {
        if (process.env.NODE_ENV === "production") {
          throw new Error("Development seed is disabled in production.")
        }
        assertRepositoryLocalTursoUrl(databaseUrl)
      },
      acquireSeedLease: () =>
        acquireDevelopmentLease({
          databasePath: developmentLeaseDatabasePath,
          label: "Development seed command",
          name: "file-seed-command",
        }),
      acquireWorkerLease: () =>
        acquireDevelopmentLease({
          databasePath: developmentLeaseDatabasePath,
          label: "Local API Worker",
          name: "local-api-worker",
        }),
      findActiveSession: findActiveDevelopmentSession,
      clearStaleSession: async () => {
        await Promise.all([
          rm(developmentSeedSessionPath, { force: true }),
          removeStaleDevelopmentRuntimeEnvFiles(),
        ])
      },
      ensureDatabaseRunning: async (signal) => {
        if (await checkDatabaseHealth({ databaseUrl, signal })) return
        console.log("Starting temporary local Turso for development seed.")
        const child = spawnSilent(["bun", "run", "db:turso"], databaseRoot)
        try {
          await waitForDatabase({ child, databaseUrl, signal })
        } catch (cause) {
          await stopProcess(child)
          throw cause
        }
        return { stop: () => stopProcess(child) }
      },
      prepareDatabase: (signal) =>
        runPackageScript({
          cwd: databaseRoot,
          failureMessage: "Local database migration failed.",
          script: "db:prepare",
          signal,
        }),
      seedDatabase: (signal) =>
        runPackageScript({
          cwd: databaseRoot,
          failureMessage: "Local database seed failed.",
          script: "db:seed",
          signal,
        }),
      startWorker: async (signal) => {
        const port = await allocateLoopbackPort()
        const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
        const endpoint = `http://127.0.0.1:${port.toString()}`
        const environmentPath = createDevelopmentRuntimeEnvPath()
        const environment = createLocalWorkerEnvironment({
          overrides: {
            DEV_FILE_SEED_TOKEN: token,
            EMAIL_PROVIDER: "noop",
            MAILPIT_URL: undefined,
            NODE_ENV: "development",
            PORT: String(port),
            OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
          },
        })
        await writePrivateFile(
          environmentPath,
          serializeLocalWorkerEnvironment(environment)
        )
        console.log("Starting temporary local Wrangler for R2 reconcile.")
        let child: ReturnType<typeof spawnLocalWorker>
        try {
          child = spawnLocalWorker({
            environmentPath,
            logLevel: "error",
            port,
          })
        } catch (cause) {
          await rm(environmentPath, { force: true })
          throw new Error("Temporary local Wrangler could not start.", {
            cause,
          })
        }
        const session = { endpoint, mode: "local", token } as const
        try {
          const deadline = Date.now() + WORKER_START_TIMEOUT_MS
          while (Date.now() < deadline) {
            if (child.exitCode !== null) {
              throw new Error(
                "Temporary local Wrangler exited before becoming ready."
              )
            }
            // oxlint-disable-next-line no-await-in-loop -- startup readiness is bounded and sequential.
            const ready = await checkDevelopmentFileSeedSession({
              ...session,
              signal,
              timeoutMs: 750,
            })
            if (ready) {
              return {
                session,
                service: {
                  stop: async () => {
                    try {
                      await stopProcess(child)
                    } finally {
                      await rm(environmentPath, { force: true })
                    }
                  },
                },
              }
            }
            // oxlint-disable-next-line no-await-in-loop -- startup polling is intentionally sequential.
            await delay(POLL_INTERVAL_MS, signal)
          }
          throw new Error(
            "Temporary local Wrangler did not become ready in time."
          )
        } catch (cause) {
          await stopProcess(child)
          await rm(environmentPath, { force: true })
          throw cause
        }
      },
      reconcile: (session, signal) =>
        reconcileDevelopmentFiles({ ...session, signal }),
      report: console.log,
    }
  }

const main = async () => {
  const controller = new AbortController()
  let receivedSignal: "SIGINT" | "SIGTERM" | undefined
  const interrupt = () => {
    receivedSignal = "SIGINT"
    controller.abort(new Error("Development seed interrupted by SIGINT."))
  }
  const terminate = () => {
    receivedSignal = "SIGTERM"
    controller.abort(new Error("Development seed interrupted by SIGTERM."))
  }
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", terminate)

  try {
    await runDevelopmentSeedCommand({
      services: createDevelopmentSeedCommandServices(),
      signal: controller.signal,
    })
  } catch (cause) {
    if (receivedSignal) {
      process.exitCode = receivedSignal === "SIGINT" ? 130 : 143
    } else {
      console.error(
        cause instanceof Error ? cause.message : "Development seed failed."
      )
      process.exitCode = 1
    }
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", terminate)
  }
}

if (import.meta.main) await main()
