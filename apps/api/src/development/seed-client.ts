import { readFile } from "node:fs/promises"

import {
  developmentFileFixtures,
  getDevelopmentFileFixtureUrl,
} from "@enterprise-agentic-saas/db/development-seed"

import { DEVELOPMENT_FILE_SEED_PATH } from "./file-seed-handler"

const RETRY_INTERVAL_MS = 500
const MAX_RETRY_INTERVAL_MS = 5_000
const DEFAULT_HTTP_RETRY_LIMIT = 3
const DEFAULT_TIMEOUT_MS = 120_000

const delay = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timeout)
      reject(signal?.reason)
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener("abort", onAbort, { once: true })
  })

class ReconcileHttpError extends Error {
  constructor(readonly status: number) {
    super("Development file reconcile request failed.")
  }
}

const reconcileFixtureOnce = async (
  endpoint: string,
  token: string,
  fixture: (typeof developmentFileFixtures)[number],
  signal?: AbortSignal
) => {
  // Fixtureは小さなdevelopment asset。通常upload pathはstreamのまま扱う。
  const bytes = await readFile(getDevelopmentFileFixtureUrl(fixture))
  const url = new URL(
    `${DEVELOPMENT_FILE_SEED_PATH}/${encodeURIComponent(fixture.id)}`,
    endpoint
  )
  const result = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
    signal,
  })
  if (result.status !== 200 && result.status !== 204) {
    await result.body?.cancel()
    throw new ReconcileHttpError(result.status)
  }
}

const isRetryableHttpStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500

const reconcileFixtureUntilReady = async ({
  deadline,
  endpoint,
  fixture,
  httpRetryLimit,
  retryIntervalMs,
  signal,
  token,
}: {
  deadline: number
  endpoint: string
  fixture: (typeof developmentFileFixtures)[number]
  httpRetryLimit: number
  retryIntervalMs: number
  signal: AbortSignal
  token: string
}) => {
  let failureCount = 0
  let httpFailureCount = 0
  let lastStatus = "unreachable"

  while (Date.now() < deadline && !signal.aborted) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one fixture is retried sequentially with bounded backoff.
      await reconcileFixtureOnce(endpoint, token, fixture, signal)
      return
    } catch (cause) {
      if (signal.aborted) break
      failureCount += 1
      if (cause instanceof ReconcileHttpError) {
        httpFailureCount += 1
        lastStatus = `HTTP ${cause.status}`
        if (
          !isRetryableHttpStatus(cause.status) ||
          httpFailureCount >= httpRetryLimit
        ) {
          break
        }
      } else {
        lastStatus = "unreachable"
      }

      const exponentialDelay = Math.min(
        MAX_RETRY_INTERVAL_MS,
        retryIntervalMs * 2 ** Math.min(failureCount - 1, 4)
      )
      try {
        // oxlint-disable-next-line no-await-in-loop -- retry delay intentionally serializes one fixture.
        await delay(
          Math.min(exponentialDelay, Math.max(0, deadline - Date.now())),
          signal
        )
      } catch {
        break
      }
    }
  }

  const attempts =
    httpFailureCount > 0
      ? ` after ${httpFailureCount} attempt${httpFailureCount === 1 ? "" : "s"}`
      : ""
  throw new Error(
    `Development file reconcile did not become ready (${lastStatus}${attempts}).`
  )
}

export const reconcileDevelopmentFiles = async ({
  endpoint,
  token,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  httpRetryLimit = DEFAULT_HTTP_RETRY_LIMIT,
  retryIntervalMs = RETRY_INTERVAL_MS,
}: {
  endpoint: string
  token: string
  signal?: AbortSignal
  timeoutMs?: number
  httpRetryLimit?: number
  retryIntervalMs?: number
}) => {
  const deadline = Date.now() + timeoutMs
  const timeoutController = new AbortController()
  const onAbort = () => timeoutController.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener("abort", onAbort, { once: true })
  const timeout = setTimeout(
    () =>
      timeoutController.abort(new Error("Development reconcile timed out.")),
    Math.max(0, timeoutMs)
  )

  try {
    for (const fixture of developmentFileFixtures) {
      // oxlint-disable-next-line no-await-in-loop -- fixture order and retry progress are deterministic.
      await reconcileFixtureUntilReady({
        deadline,
        endpoint,
        fixture,
        httpRetryLimit: Math.max(1, Math.trunc(httpRetryLimit)),
        retryIntervalMs: Math.max(0, retryIntervalMs),
        signal: timeoutController.signal,
        token,
      })
    }
    return developmentFileFixtures.length
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", onAbort)
  }
}
