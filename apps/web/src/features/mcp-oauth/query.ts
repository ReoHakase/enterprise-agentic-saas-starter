import {
  MCP_PERMISSION_SCOPES,
  type McpPermissionScope,
} from "@enterprise-agentic-saas/auth/client"

const scopeLabels = {
  "account:read": "Read your account profile",
  "organization:read": "Read organization details",
  "members:read": "Read organization members",
  "issues:read": "Read Issues",
  "issues:create": "Create Issues",
  "issues:update": "Update Issues",
  "issues:delete": "Delete Issues",
  "files:read": "Read Issue files",
  "files:write": "Upload and manage Issue files",
} as const

const mcpPermissionScopeLabels = scopeLabels satisfies Record<
  McpPermissionScope,
  string
>
const mcpPermissionScopes = new Set<string>(MCP_PERMISSION_SCOPES)

const isMcpPermissionScope = (scope: string): scope is McpPermissionScope =>
  mcpPermissionScopes.has(scope)

export type McpOAuthSearchParams = Record<string, string | string[] | undefined>

const serializeMcpOAuthSearchParams = (query: McpOAuthSearchParams) => {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      searchParams.append(key, value)
    } else if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, item)
    }
  }
  return searchParams
}

export const createMcpOAuthRoutePath = (
  pathname: "/oauth/consent" | "/oauth/organization",
  query: McpOAuthSearchParams
) => {
  const search = serializeMcpOAuthSearchParams(query).toString()
  return search ? `${pathname}?${search}` : pathname
}

export const resolveMcpOAuthLoginRedirect = (query: McpOAuthSearchParams) => {
  if (
    query.response_type !== "code" ||
    typeof query.client_id !== "string" ||
    typeof query.redirect_uri !== "string" ||
    typeof query.exp !== "string" ||
    typeof query.sig !== "string"
  ) {
    return null
  }

  return createMcpOAuthRoutePath("/oauth/organization", query)
}

export type McpOAuthScopeSummary = {
  description: string
  scope: McpPermissionScope | "offline_access"
}

export const parseMcpOAuthScopes = (
  value: string | string[] | undefined
): McpOAuthScopeSummary[] | null => {
  if (typeof value !== "string") return null

  const scopes = [...new Set(value.split(" ").filter(Boolean))]
  if (scopes.length === 0) return null

  const summaries: McpOAuthScopeSummary[] = []
  for (const scope of scopes) {
    if (scope === "offline_access") {
      summaries.push({
        description: "Keep access after the client is closed",
        scope,
      })
    } else if (isMcpPermissionScope(scope)) {
      summaries.push({ description: mcpPermissionScopeLabels[scope], scope })
    } else {
      return null
    }
  }
  return summaries
}
