import { readFile } from "node:fs/promises"

import {
  developmentFileFixtures,
  getDevelopmentFileFixtureUrl,
} from "@enterprise-agentic-saas/db/development-seed"

import { DEVELOPMENT_FILE_SEED_PATH } from "./file-seed-handler"

const RETRY_INTERVAL_MS = 500
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

const reconcileOnce = async (
  endpoint: string,
  token: string,
  signal?: AbortSignal
) => {
  for (const fixture of developmentFileFixtures) {
    // Fixtureは小さなdevelopment asset。通常upload pathはstreamのまま扱う。
    // oxlint-disable-next-line no-await-in-loop -- reconcile order is intentionally deterministic.
    const bytes = await readFile(getDevelopmentFileFixtureUrl(fixture))
    const url = new URL(
      `${DEVELOPMENT_FILE_SEED_PATH}/${encodeURIComponent(fixture.id)}`,
      endpoint
    )
    // oxlint-disable-next-line no-await-in-loop -- local Worker state is reconciled serially.
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
      throw new Error(
        `Development file reconcile returned HTTP ${result.status}`
      )
    }
  }
}

export const reconcileDevelopmentFiles = async ({
  endpoint,
  token,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  endpoint: string
  token: string
  signal?: AbortSignal
  timeoutMs?: number
}) => {
  const deadline = Date.now() + timeoutMs
  let lastStatus = "unreachable"
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
    while (Date.now() < deadline && !timeoutController.signal.aborted) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- startup readiness is a sequential retry loop.
        await reconcileOnce(endpoint, token, timeoutController.signal)
        return developmentFileFixtures.length
      } catch (cause) {
        if (signal?.aborted) throw cause
        if (timeoutController.signal.aborted) break
        lastStatus =
          cause instanceof Error && /HTTP \d+$/u.test(cause.message)
            ? cause.message.slice(cause.message.lastIndexOf("HTTP"))
            : "unreachable"
        try {
          // oxlint-disable-next-line no-await-in-loop -- retry delay protects startup dependencies.
          await delay(
            Math.min(RETRY_INTERVAL_MS, Math.max(0, deadline - Date.now())),
            timeoutController.signal
          )
        } catch (delayCause) {
          if (signal?.aborted) throw delayCause
          break
        }
      }
    }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", onAbort)
  }

  throw new Error(
    `Development file reconcile did not become ready (${lastStatus}).`
  )
}
