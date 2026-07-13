import { env } from "./env"

const TIMEOUT_MS = 120_000
const RETRY_INTERVAL_MS = 500

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const main = async () => {
  if (env.TURSO_DATABASE_URL.startsWith("file:")) {
    return
  }

  const healthUrl = new URL("/health", env.TURSO_DATABASE_URL)
  const deadline = Date.now() + TIMEOUT_MS
  let lastCause: unknown

  while (Date.now() < deadline) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- readiness retries must remain sequential.
      const response = await fetch(healthUrl)
      if (response.ok) {
        console.log(`Database is ready: ${healthUrl.origin}`)
        return
      }
      lastCause = new Error(`health check returned HTTP ${response.status}`)
    } catch (cause) {
      lastCause = cause
    }

    // oxlint-disable-next-line no-await-in-loop -- delay separates sequential retry attempts.
    await sleep(RETRY_INTERVAL_MS)
  }

  throw new Error(`Database did not become ready within ${TIMEOUT_MS} ms.`, {
    cause: lastCause,
  })
}

await main()
