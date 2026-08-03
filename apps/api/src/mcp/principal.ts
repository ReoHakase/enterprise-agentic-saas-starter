import type { McpPermissionScope } from "@enterprise-agentic-saas/auth/mcp-oauth"

import type { OrganizationRole } from "../modules/authorization/roles"

export type McpPrincipal = {
  audience: string
  clientId: string
  organizationId: string
  role: OrganizationRole
  scopes: ReadonlySet<McpPermissionScope>
  type: "oauth-user"
  userId: string
}
