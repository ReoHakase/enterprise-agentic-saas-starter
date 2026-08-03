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

type McpPermissionScope = keyof typeof scopeLabels

const isMcpPermissionScope = (scope: string): scope is McpPermissionScope =>
  Object.hasOwn(scopeLabels, scope)

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
      summaries.push({ description: scopeLabels[scope], scope })
    } else {
      return null
    }
  }
  return summaries
}
