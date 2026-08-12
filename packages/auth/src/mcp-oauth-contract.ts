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

export const MCP_OAUTH_SCOPES = [
  "offline_access",
  ...MCP_PERMISSION_SCOPES,
] as const
