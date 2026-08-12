import { MCP_OAUTH_SCOPES } from "@enterprise-agentic-saas/auth/client"
import * as v from "valibot"

import { organizationSummarySchema } from "@/features/organizations/schema"

const mcpOAuthScopeSchema = v.picklist(MCP_OAUTH_SCOPES)

const mcpOAuthCredentialSchema = v.object({
  clientName: v.string(),
  createdAt: v.nullable(v.string()),
  credentialId: v.pipe(v.string(), v.minLength(1)),
  expiresAt: v.nullable(v.string()),
  organization: v.nullable(organizationSummarySchema),
  refreshable: v.boolean(),
  scopes: v.array(mcpOAuthScopeSchema),
})

const mcpOAuthCredentialListSchema = v.array(mcpOAuthCredentialSchema)

export type McpOAuthCredential = v.InferOutput<typeof mcpOAuthCredentialSchema>

export const parseMcpOAuthCredentials = (value: unknown) =>
  v.parse(mcpOAuthCredentialListSchema, value)
