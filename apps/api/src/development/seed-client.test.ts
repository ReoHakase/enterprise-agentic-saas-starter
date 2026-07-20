import { developmentFileFixtures } from "@enterprise-agentic-saas/db/development-seed"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  checkDevelopmentFileSeedSession,
  reconcileDevelopmentFiles,
} from "./seed-client"

type FetchCall = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>

describe("development file seed client", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("checks readiness through the authenticated development boundary", async () => {
    const fetcher = vi.fn<FetchCall>(
      async () => new Response(null, { status: 204 })
    )

    await expect(
      checkDevelopmentFileSeedSession({
        endpoint: "http://127.0.0.1:8787",
        fetcher,
        token: "x".repeat(64),
      })
    ).resolves.toBe(true)
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:8787/__development/files/reconcile"
    )
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET" })
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("authorization")
    ).toBe(`Bearer ${"x".repeat(64)}`)
  })

  it("does not accept an unowned or unreachable development session", async () => {
    await expect(
      checkDevelopmentFileSeedSession({
        endpoint: "http://127.0.0.1:8787",
        fetcher: async () => new Response(null, { status: 401 }),
        token: "x".repeat(64),
      })
    ).resolves.toBe(false)
    await expect(
      checkDevelopmentFileSeedSession({
        endpoint: "http://127.0.0.1:8787",
        fetcher: async () => {
          throw new Error("unreachable")
        },
        token: "x".repeat(64),
      })
    ).resolves.toBe(false)
  })

  it("reconciles every committed fixture through the loopback endpoint", async () => {
    const fetchMock = vi.fn<FetchCall>(
      async (_url: Request | URL | string, _init?: RequestInit) =>
        new Response(null, { status: 204 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      reconcileDevelopmentFiles({
        endpoint: "http://127.0.0.1:8787",
        token: "x".repeat(64),
        timeoutMs: 1_000,
      })
    ).resolves.toBe(developmentFileFixtures.length)
    expect(fetchMock).toHaveBeenCalledTimes(developmentFileFixtures.length)
    expect(
      fetchMock.mock.calls.every(([url, init]) => {
        const requestUrl = url instanceof URL ? url : new URL(String(url))
        const headers = new Headers(init?.headers)
        return (
          requestUrl.hostname === "127.0.0.1" &&
          headers.get("authorization") === `Bearer ${"x".repeat(64)}`
        )
      })
    ).toBe(true)
  })

  it("aborts a hung request at the configured deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchCall>(
        (_url: Request | URL | string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true }
            )
          })
      )
    )

    await expect(
      reconcileDevelopmentFiles({
        endpoint: "http://127.0.0.1:8787",
        token: "x".repeat(64),
        timeoutMs: 20,
      })
    ).rejects.toThrow(/did not become ready \(unreachable\)/i)
  })

  it("retries only the failing fixture and stops persistent 503s", async () => {
    const failedFixture = developmentFileFixtures[2]
    if (!failedFixture) throw new Error("A third fixture is required")
    const fetchMock = vi.fn<FetchCall>(
      async (url: Request | URL | string) =>
        new Response(null, {
          status: String(url).endsWith(encodeURIComponent(failedFixture.id))
            ? 503
            : 204,
        })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      reconcileDevelopmentFiles({
        endpoint: "http://127.0.0.1:8787",
        token: "x".repeat(64),
        timeoutMs: 1_000,
        httpRetryLimit: 3,
        retryIntervalMs: 1,
      })
    ).rejects.toThrow(/HTTP 503 after 3 attempts/i)

    const callsByFixture = new Map<string, number>()
    for (const [url] of fetchMock.mock.calls) {
      const id = decodeURIComponent(
        new URL(String(url)).pathname.split("/").at(-1) ?? ""
      )
      callsByFixture.set(id, (callsByFixture.get(id) ?? 0) + 1)
    }
    expect(callsByFixture.get(developmentFileFixtures[0]?.id ?? "")).toBe(1)
    expect(callsByFixture.get(developmentFileFixtures[1]?.id ?? "")).toBe(1)
    expect(callsByFixture.get(failedFixture.id)).toBe(3)
    expect(callsByFixture.has(developmentFileFixtures[3]?.id ?? "")).toBe(false)
  })

  it("continues from a fixture after a transient 503", async () => {
    const retriedFixture = developmentFileFixtures[2]
    if (!retriedFixture) throw new Error("A third fixture is required")
    let failuresRemaining = 1
    const fetchMock = vi.fn<FetchCall>(async (url: Request | URL | string) => {
      if (
        String(url).endsWith(encodeURIComponent(retriedFixture.id)) &&
        failuresRemaining > 0
      ) {
        failuresRemaining -= 1
        return new Response(null, { status: 503 })
      }
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      reconcileDevelopmentFiles({
        endpoint: "http://127.0.0.1:8787",
        token: "x".repeat(64),
        timeoutMs: 1_000,
        retryIntervalMs: 1,
      })
    ).resolves.toBe(developmentFileFixtures.length)
    expect(fetchMock).toHaveBeenCalledTimes(developmentFileFixtures.length + 1)
  })

  it("does not retry terminal HTTP responses", async () => {
    const fetchMock = vi.fn<FetchCall>(
      async () => new Response(null, { status: 409 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      reconcileDevelopmentFiles({
        endpoint: "http://127.0.0.1:8787",
        token: "x".repeat(64),
        timeoutMs: 1_000,
        retryIntervalMs: 1,
      })
    ).rejects.toThrow(/HTTP 409 after 1 attempt/i)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
