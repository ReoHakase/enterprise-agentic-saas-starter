import { afterEach, describe, expect, it, vi } from "vitest"

import { continueMcpOAuth, decideMcpOAuthConsent } from "./client"

type OAuthResult = Promise<{
  data: { redirect: true; url: string } | null
  error: { message: string } | null
}>

type ContinueOAuth = (input: { postLogin: boolean }) => OAuthResult
type ConsentOAuth = (input: { accept: boolean; scope?: string }) => OAuthResult

afterEach(() => {
  vi.restoreAllMocks()
})

describe("MCP OAuth client capabilities", () => {
  it("continues post-login selection and follows the provider redirect", async () => {
    const assign = vi
      .spyOn(window.location, "assign")
      .mockImplementation(() => undefined)
    const continueFlow = vi.fn<ContinueOAuth>(async () => ({
      data: { redirect: true, url: "https://client.example.test/callback" },
      error: null,
    }))

    await continueMcpOAuth({ oauth2: { continue: continueFlow } })

    expect(continueFlow).toHaveBeenCalledWith({ postLogin: true })
    expect(assign).toHaveBeenCalledWith("https://client.example.test/callback")
  })

  it("sends only the accepted space-separated scopes", async () => {
    vi.spyOn(window.location, "assign").mockImplementation(() => undefined)
    const consent = vi.fn<ConsentOAuth>(async () => ({
      data: { redirect: true, url: "https://client.example.test/callback" },
      error: null,
    }))

    await decideMcpOAuthConsent(
      { oauth2: { consent } },
      { accept: true, scopes: ["issues:read", "files:read"] }
    )

    expect(consent).toHaveBeenCalledWith({
      accept: true,
      scope: "issues:read files:read",
    })
  })

  it("does not project provider errors into the thrown message", async () => {
    const consent = vi.fn<ConsentOAuth>(async () => ({
      data: null,
      error: { message: "raw provider detail" },
    }))

    await expect(
      decideMcpOAuthConsent(
        { oauth2: { consent } },
        { accept: false, scopes: [] }
      )
    ).rejects.toThrow("MCP OAuth request failed")
  })
})
