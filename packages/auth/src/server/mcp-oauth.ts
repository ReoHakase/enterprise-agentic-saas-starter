import { oauthProvider } from "@better-auth/oauth-provider"
import { APIError } from "better-auth"

export const MCP_OAUTH_ORGANIZATION_CLAIM =
  "https://enterprise-agentic-saas.example/organization_id"

export const MCP_OAUTH_ACCESS_TOKEN_PREFIX = "mcp_at_"
export const MCP_OAUTH_REFRESH_TOKEN_PREFIX = "mcp_rt_"

export const MCP_PERMISSION_SCOPES = [
  "account:read",
  "organization:read",
  "members:read",
  "issues:read",
  "issues:create",
  "issues:update",
  "issues:delete",
  "files:read",
  "files:write",
] as const

export type McpPermissionScope = (typeof MCP_PERMISSION_SCOPES)[number]

export type McpOAuthAccessToken = {
  audience: string
  clientId: string
  expiresAt: Date
  issuedAt: Date
  organizationId: string
  scopes: string[]
  userId: string
}

const MCP_READ_SCOPES = [
  "account:read",
  "organization:read",
  "members:read",
  "issues:read",
  "files:read",
] as const satisfies readonly McpPermissionScope[]

const mcpPermissionScopes = new Set<string>(MCP_PERMISSION_SCOPES)

export const MCP_OAUTH_SCOPES = [
  "offline_access",
  ...MCP_PERMISSION_SCOPES,
] as const

type CreateMcpOAuthProviderOptions = {
  hasMembership: (input: {
    organizationId: string
    userId: string
  }) => Promise<boolean>
  resource: string
  webAppOrigin: string
}

const hasMcpPermissionScope = (scopes: readonly string[]) =>
  scopes.some((scope) => mcpPermissionScopes.has(scope))

export const hashMcpOAuthToken = async (token: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export const createMcpOAuthProvider = ({
  hasMembership,
  resource,
  webAppOrigin,
}: CreateMcpOAuthProviderOptions) =>
  oauthProvider({
    loginPage: new URL("/auth/sign-in", webAppOrigin).toString(),
    consentPage: new URL("/oauth/consent", webAppOrigin).toString(),
    scopes: [...MCP_OAUTH_SCOPES],
    validAudiences: [resource],
    grantTypes: ["authorization_code", "refresh_token"],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationDefaultScopes: ["offline_access", ...MCP_READ_SCOPES],
    clientRegistrationAllowedScopes: [...MCP_PERMISSION_SCOPES],
    disableJwtPlugin: true,
    storeClientSecret: "encrypted",
    storeTokens: { hash: hashMcpOAuthToken },
    prefix: {
      opaqueAccessToken: MCP_OAUTH_ACCESS_TOKEN_PREFIX,
      refreshToken: MCP_OAUTH_REFRESH_TOKEN_PREFIX,
      clientSecret: "mcp_cs_",
    },
    postLogin: {
      page: new URL("/oauth/organization", webAppOrigin).toString(),
      shouldRedirect: ({ scopes }) => hasMcpPermissionScope(scopes),
      consentReferenceId: async ({ session, scopes }) => {
        const organizationId =
          typeof session.activeOrganizationId === "string"
            ? session.activeOrganizationId
            : undefined
        if (
          hasMcpPermissionScope(scopes) &&
          (!organizationId ||
            !(await hasMembership({
              organizationId,
              userId: session.userId,
            })))
        ) {
          throw APIError.from("BAD_REQUEST", {
            code: "MCP_ORGANIZATION_REQUIRED",
            message: "An available organization must be selected",
          })
        }
        return organizationId ?? undefined
      },
    },
    async customAccessTokenClaims({ referenceId, resource: audience, user }) {
      if (
        audience !== resource ||
        !referenceId ||
        !user ||
        !(await hasMembership({
          organizationId: referenceId,
          userId: user.id,
        }))
      ) {
        throw APIError.from("FORBIDDEN", {
          code: "MCP_ORGANIZATION_ACCESS_DENIED",
          message: "Organization access is not available",
        })
      }
      return { [MCP_OAUTH_ORGANIZATION_CLAIM]: referenceId }
    },
  })
