import { describe, expect, it, vi } from "vitest"

import {
  parseMailpitDevelopmentSession,
  waitForMailpitDevelopmentSession,
  type MailpitDevelopmentSession,
} from "./mailpit-session"

type Fetcher = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>

const session = {
  mode: "local",
  token: "x".repeat(64),
  url: "http://127.0.0.1:4285",
} satisfies MailpitDevelopmentSession

const hungFetcher: Fetcher = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener(
      "abort",
      () => reject(new Error("aborted")),
      { once: true }
    )
  })

describe("Mailpit development session", () => {
  it("accepts only an explicit loopback HTTP endpoint", () => {
    expect(parseMailpitDevelopmentSession(session)).toEqual(session)
    expect(() =>
      parseMailpitDevelopmentSession({
        ...session,
        url: "https://mailpit.enterprise-agentic-saas.localhost",
      })
    ).toThrow(/invalid/i)
    expect(() =>
      parseMailpitDevelopmentSession({
        ...session,
        url: "http://mailpit.example.com:4285",
      })
    ).toThrow(/invalid/i)
    expect(() =>
      parseMailpitDevelopmentSession({ ...session, token: "short" })
    ).toThrow(/invalid/i)
  })

  it("waits for the active local Mailpit endpoint", async () => {
    const fetcher = vi.fn<Fetcher>(
      async () => new Response(JSON.stringify({ version: "local" }))
    )

    await expect(
      waitForMailpitDevelopmentSession({
        fetcher,
        readSession: async () => session,
        timeoutMs: 1_000,
      })
    ).resolves.toEqual(session)
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:4285/api/v1/info"
    )
  })

  it("retries a stale session without exposing the fetch error", async () => {
    let attempts = 0
    const fetcher: Fetcher = async () => {
      attempts += 1
      if (attempts === 1) throw new Error("private network failure")
      return new Response(null, { status: 200 })
    }

    await expect(
      waitForMailpitDevelopmentSession({
        fetcher,
        readSession: async () => session,
        retryIntervalMs: 1,
        timeoutMs: 1_000,
      })
    ).resolves.toEqual(session)
    expect(attempts).toBe(2)
  })

  it("aborts a hung endpoint at the bounded deadline", async () => {
    await expect(
      waitForMailpitDevelopmentSession({
        fetcher: hungFetcher,
        readSession: async () => session,
        retryIntervalMs: 1,
        timeoutMs: 5,
      })
    ).rejects.toThrow(/Local Mailpit did not become ready/i)
  })
})
