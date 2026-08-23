import { Elysia } from "elysia"

import { env } from "../env"

const loadAuth = async () => {
  const authModule = await import("@enterprise-agentic-saas/auth")
  await authModule.auth.$context
  return authModule
}
const mcpOAuthResource = new URL("/mcp", env.API_PUBLIC_URL).toString()

export const authPlugin = new Elysia({ name: "auth" }).mount(async (request) =>
  (await loadAuth()).auth.handler(request)
)

export const mcpAuth = {
  getProtectedResourceMetadata: async () =>
    (await loadAuth()).getMcpProtectedResourceMetadata(),
  handleAuthorizationServerMetadata: async (request: Request) =>
    (await loadAuth()).handleMcpOAuthServerMetadata(request),
  resource: mcpOAuthResource,
  verifyAccessToken: async (presentedToken: string) =>
    (await loadAuth()).verifyMcpOAuthAccessToken(presentedToken),
}
