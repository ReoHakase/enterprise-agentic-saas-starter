import { describe, expect, it, vi } from "vitest"

import {
  assertDevelopmentSeedReady,
  DEVELOPMENT_STACK_NOT_READY_MESSAGE,
} from "./seed-preflight"
import type { DevelopmentSeedSession } from "./session"

type Fetcher = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>

const session = {
  endpoint: "http://127.0.0.1:8787",
  mode: "local",
  token: "x".repeat(64),
} satisfies DevelopmentSeedSession

const localOptions = {
  databaseUrl: "https://db.enterprise-agentic-saas.localhost",
  nodeEnv: "development",
  readSession: async () => session,
} as const

const hungFetcher: Fetcher = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener(
      "abort",
      () => reject(new Error("aborted")),
      { once: true }
    )
  })

describe("development seed preflight", () => {
  it("accepts a ready loopback Worker", async () => {
    const fetcher = vi.fn<Fetcher>(
      async () => new Response(JSON.stringify({ status: "ok" }))
    )

    await expect(
      assertDevelopmentSeedReady({ ...localOptions, fetcher })
    ).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledOnce()
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:8787/ready"
    )
  })

  it("fails before HTTP when no supervisor session exists", async () => {
    const fetcher = vi.fn<Fetcher>(
      async () => new Response(null, { status: 200 })
    )

    await expect(
      assertDevelopmentSeedReady({
        ...localOptions,
        fetcher,
        readSession: async () => {
          throw new Error("missing")
        },
      })
    ).rejects.toThrow(DEVELOPMENT_STACK_NOT_READY_MESSAGE)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("rejects a stale or unready supervisor session", async () => {
    await expect(
      assertDevelopmentSeedReady({
        ...localOptions,
        fetcher: async () => new Response(null, { status: 503 }),
      })
    ).rejects.toThrow(DEVELOPMENT_STACK_NOT_READY_MESSAGE)
  })

  it("aborts a hung readiness request at the short deadline", async () => {
    await expect(
      assertDevelopmentSeedReady({
        ...localOptions,
        fetcher: hungFetcher,
        timeoutMs: 5,
      })
    ).rejects.toThrow(DEVELOPMENT_STACK_NOT_READY_MESSAGE)
  })

  it("rejects production and remote database configurations", async () => {
    await expect(
      assertDevelopmentSeedReady({ ...localOptions, nodeEnv: "production" })
    ).rejects.toThrow(/disabled in production/i)
    await expect(
      assertDevelopmentSeedReady({
        ...localOptions,
        databaseUrl: "libsql://production.example.com",
      })
    ).rejects.toThrow(/local Turso URL/i)
  })
})
