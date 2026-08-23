import { beforeEach, describe, expect, it, vi } from "vitest"

const authModule = vi.hoisted(() => ({
  context: Promise.withResolvers<void>(),
  getMcpProtectedResourceMetadata: vi.fn<() => Promise<{ resource: string }>>(
    async () => ({ resource: "mcp" })
  ),
  handle: vi.fn<(request: Request) => Promise<Response>>(
    async () => new Response("auth-response")
  ),
  handleMcpOAuthServerMetadata: vi.fn<(request: Request) => Promise<Response>>(
    async () => new Response("authorization-metadata")
  ),
  loaded: vi.fn<() => void>(),
  verifyMcpOAuthAccessToken: vi.fn<(token: string) => Promise<null>>(
    async () => null
  ),
}))

vi.mock("@enterprise-agentic-saas/auth", () => {
  authModule.loaded()
  return {
    auth: {
      $context: authModule.context.promise,
      handler: authModule.handle,
    },
    getMcpProtectedResourceMetadata: authModule.getMcpProtectedResourceMetadata,
    handleMcpOAuthServerMetadata: authModule.handleMcpOAuthServerMetadata,
    verifyMcpOAuthAccessToken: authModule.verifyMcpOAuthAccessToken,
  }
})

import { authPlugin, mcpAuth } from "./auth"

describe("API Auth plugin", () => {
  beforeEach(() => {
    authModule.getMcpProtectedResourceMetadata.mockClear()
    authModule.handle.mockClear()
    authModule.handleMcpOAuthServerMetadata.mockClear()
    authModule.verifyMcpOAuthAccessToken.mockClear()
  })

  it("request境界でBetter Auth contextを完了してから処理を開始する", async () => {
    expect(authModule.loaded).not.toHaveBeenCalled()

    const verifyAccessTokenPromise = mcpAuth.verifyAccessToken("token")
    await vi.waitFor(() => expect(authModule.loaded).toHaveBeenCalledOnce())
    expect(authModule.verifyMcpOAuthAccessToken).not.toHaveBeenCalled()

    authModule.context.resolve()
    await expect(verifyAccessTokenPromise).resolves.toBeNull()
    expect(authModule.verifyMcpOAuthAccessToken).toHaveBeenCalledWith("token")

    const response = await authPlugin.handle(
      new Request("http://localhost/auth/get-session")
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("auth-response")
    expect(authModule.loaded).toHaveBeenCalledOnce()
    expect(authModule.handle).toHaveBeenCalledOnce()

    await expect(mcpAuth.getProtectedResourceMetadata()).resolves.toEqual({
      resource: "mcp",
    })
    await expect(
      mcpAuth.handleAuthorizationServerMetadata(
        new Request("http://localhost/.well-known/oauth-authorization-server")
      )
    ).resolves.toEqual(expect.any(Response))
    expect(authModule.getMcpProtectedResourceMetadata).toHaveBeenCalledOnce()
    expect(authModule.handleMcpOAuthServerMetadata).toHaveBeenCalledOnce()
    expect(authModule.loaded).toHaveBeenCalledOnce()
  })
})
