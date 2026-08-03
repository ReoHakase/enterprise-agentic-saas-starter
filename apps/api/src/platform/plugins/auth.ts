import {
  auth,
  getMcpProtectedResourceMetadata,
  handleMcpOAuthServerMetadata,
  mcpOAuthResource,
  verifyMcpOAuthAccessToken,
} from "@enterprise-agentic-saas/auth"
import { Elysia } from "elysia"

export const authPlugin = new Elysia({ name: "auth" }).mount(auth.handler)

export const mcpAuth = {
  getProtectedResourceMetadata: getMcpProtectedResourceMetadata,
  handleAuthorizationServerMetadata: handleMcpOAuthServerMetadata,
  resource: mcpOAuthResource,
  verifyAccessToken: verifyMcpOAuthAccessToken,
}
