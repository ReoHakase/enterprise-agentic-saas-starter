import {
  MCP_OAUTH_SCOPES,
  MCP_PERMISSION_SCOPES,
  type McpPermissionScope,
} from "@enterprise-agentic-saas/auth/client"

export type McpOAuthGrantedScope = McpPermissionScope | "offline_access"

export type McpOAuthScopeOperation =
  | "create"
  | "delete"
  | "read"
  | "update"
  | "write"

type McpOAuthScopeTarget =
  | "account"
  | "files"
  | "issues"
  | "members"
  | "organization"

export type McpOAuthScopeMatrixRow = {
  id: McpOAuthScopeTarget
  label: string
  scopes: Partial<Record<McpOAuthScopeOperation, McpPermissionScope>>
}

const mcpOAuthScopeDefinitions = {
  "account:read": {
    description: "Read your account profile",
    operation: "read",
    target: "account",
  },
  "organization:read": {
    description: "Read organization details",
    operation: "read",
    target: "organization",
  },
  "members:read": {
    description: "Read organization members",
    operation: "read",
    target: "members",
  },
  "issues:read": {
    description: "Read Issues",
    operation: "read",
    target: "issues",
  },
  "issues:create": {
    description: "Create Issues",
    operation: "create",
    target: "issues",
  },
  "issues:update": {
    description: "Update Issues",
    operation: "update",
    target: "issues",
  },
  "issues:delete": {
    description: "Delete Issues",
    operation: "delete",
    target: "issues",
  },
  "files:read": {
    description: "Read Issue files",
    operation: "read",
    target: "files",
  },
  "files:write": {
    description: "Upload and manage Issue files",
    operation: "write",
    target: "files",
  },
} as const satisfies Record<
  McpPermissionScope,
  {
    description: string
    operation: McpOAuthScopeOperation
    target: McpOAuthScopeTarget
  }
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

export const createMcpOAuthAddAccountHref = (returnTo: string) => {
  const query = new URLSearchParams({ redirectTo: returnTo })
  query.set("add_account", "1")
  return `/auth/sign-in?${query.toString()}`
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
  scope: McpOAuthGrantedScope
}

const mcpOAuthScopeTargets = [
  { id: "account", label: "Account" },
  { id: "organization", label: "Organization" },
  { id: "members", label: "Members" },
  { id: "issues", label: "Issues" },
  { id: "files", label: "Files" },
] as const satisfies readonly {
  id: McpOAuthScopeTarget
  label: string
}[]

export const mcpOAuthScopeMatrixRows: readonly McpOAuthScopeMatrixRow[] =
  mcpOAuthScopeTargets.map(({ id, label }) => {
    const scopes: McpOAuthScopeMatrixRow["scopes"] = {}
    for (const scope of MCP_PERMISSION_SCOPES) {
      const definition = mcpOAuthScopeDefinitions[scope]
      if (definition.target === id) scopes[definition.operation] = scope
    }
    return { id, label, scopes }
  })

export const mcpOAuthScopeOperations = [
  { id: "read", label: "Read" },
  { id: "create", label: "Create" },
  { id: "update", label: "Update" },
  { id: "delete", label: "Delete" },
  { id: "write", label: "Write" },
] as const satisfies readonly {
  id: McpOAuthScopeOperation
  label: string
}[]

const scopeOrder = new Map<string, number>(
  MCP_OAUTH_SCOPES.map((scope, index) => [scope, index])
)

export const sortMcpOAuthScopes = (
  scopes: readonly McpOAuthGrantedScope[]
): McpOAuthGrantedScope[] =>
  [...new Set(scopes)].toSorted(
    (left, right) =>
      (scopeOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (scopeOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
  )

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
      summaries.push({
        description: mcpOAuthScopeDefinitions[scope].description,
        scope,
      })
    } else {
      return null
    }
  }
  return summaries
}
