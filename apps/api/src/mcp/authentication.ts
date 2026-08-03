import {
  type McpOAuthAccessToken,
  type McpPermissionScope,
  MCP_OAUTH_SCOPES,
  MCP_PERMISSION_SCOPES,
} from "@enterprise-agentic-saas/auth/mcp-oauth"

import type { AuthorizationService } from "../modules/authorization/public"
import type { McpPrincipal } from "./principal"

const maximumBearerTokenLength = 4096
const oauthScopes = new Set<string>(MCP_OAUTH_SCOPES)
const permissionScopes = new Set<string>(MCP_PERMISSION_SCOPES)

const isMcpPermissionScope = (scope: string): scope is McpPermissionScope =>
  permissionScopes.has(scope)

export type VerifyMcpOAuthAccessToken = (
  token: string
) => Promise<McpOAuthAccessToken | null>

const bearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization")
  if (!authorization) return null

  const [scheme, token, ...remainder] = authorization.split(" ")
  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    remainder.length > 0 ||
    token.length > maximumBearerTokenLength ||
    /\s/.test(token)
  ) {
    return null
  }
  return token
}

export const authenticateMcpRequest = async (input: {
  authorization: AuthorizationService
  request: Request
  resource: string
  verifyAccessToken: VerifyMcpOAuthAccessToken
}): Promise<McpPrincipal | null> => {
  const token = bearerToken(input.request)
  if (!token) return null

  const credential = await input.verifyAccessToken(token)
  if (
    !credential ||
    credential.audience !== input.resource ||
    credential.expiresAt.getTime() <= Date.now() ||
    credential.issuedAt.getTime() > Date.now() + 60_000 ||
    credential.clientId.length === 0 ||
    credential.organizationId.length === 0 ||
    credential.userId.length === 0 ||
    credential.scopes.some((scope) => !oauthScopes.has(scope))
  ) {
    return null
  }

  const membership = await input.authorization.getMembership({
    organizationId: credential.organizationId,
    userId: credential.userId,
  })
  if (!membership) return null

  const scopes = new Set<McpPermissionScope>()
  for (const scope of credential.scopes) {
    if (isMcpPermissionScope(scope)) {
      scopes.add(scope)
    }
  }
  if (scopes.size === 0) return null

  return {
    audience: credential.audience,
    clientId: credential.clientId,
    organizationId: credential.organizationId,
    role: membership.role,
    scopes,
    type: "oauth-user",
    userId: credential.userId,
  }
}
