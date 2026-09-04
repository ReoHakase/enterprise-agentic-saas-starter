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

describe("MCP OAuth クライアント機能", () => {
  it("ログイン後に選択を再開し、プロバイダーのredirectへ進む", async () => {
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

  it("許可された空白区切りscopeだけを送信する", async () => {
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

  it("throwするError.messageへプロバイダーエラーを転記しない", async () => {
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
