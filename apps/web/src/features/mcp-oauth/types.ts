import type { ApiClient, Treaty } from "@enterprise-agentic-saas/api/client"

type McpOAuthCredentials = Treaty.Data<
  ApiClient["me"]["mcp-oauth"]["sessions"]["get"]
>

export type McpOAuthCredential = McpOAuthCredentials[number]
