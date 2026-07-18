import { developmentFileFixtures } from "@enterprise-agentic-saas/db/development-seed"
import { afterEach, describe, expect, it, vi } from "vitest"

import { reconcileDevelopmentFiles } from "./seed-client"

type FetchCall = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>

describe("development file seed client", () => {
  afterEach(() => vi.unstubAllGlobals())

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
})
