import { isLocalDatabaseUrl } from "./file-seed-handler"
import {
  readDevelopmentSeedSession,
  type DevelopmentSeedSession,
} from "./session"

const DEFAULT_TIMEOUT_MS = 2_000

export const DEVELOPMENT_STACK_NOT_READY_MESSAGE =
  "Local development stack is not ready. Start `bun run dev`, wait for the API readiness log, then run `bun run seed` in another terminal."

type Fetcher = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>

export const assertDevelopmentSeedReady = async ({
  databaseUrl = process.env.TURSO_DATABASE_URL,
  fetcher = fetch,
  nodeEnv = process.env.NODE_ENV,
  readSession = readDevelopmentSeedSession,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  databaseUrl?: string
  fetcher?: Fetcher
  nodeEnv?: string
  readSession?: () => Promise<DevelopmentSeedSession>
  timeoutMs?: number
} = {}) => {
  if (nodeEnv === "production") {
    throw new Error("Development fixture seed is disabled in production.")
  }
  if (!isLocalDatabaseUrl(databaseUrl)) {
    throw new Error("Development fixture seed requires a local Turso URL.")
  }

  let session: DevelopmentSeedSession
  try {
    session = await readSession()
  } catch {
    throw new Error(DEVELOPMENT_STACK_NOT_READY_MESSAGE)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(0, timeoutMs))

  try {
    const response = await fetcher(new URL("/ready", session.endpoint), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error(DEVELOPMENT_STACK_NOT_READY_MESSAGE)
  } catch {
    throw new Error(DEVELOPMENT_STACK_NOT_READY_MESSAGE)
  } finally {
    clearTimeout(timeout)
  }

  console.log("Local development stack is ready for fixture provisioning.")
}

if (import.meta.main) await assertDevelopmentSeedReady()
