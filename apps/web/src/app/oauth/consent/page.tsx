import type { Metadata } from "next"

import { AuthRouteFrame } from "@/components/public-route-frame/public-route-frame"
import {
  McpOAuthConsentController,
  parseMcpOAuthScopes,
} from "@/features/mcp-oauth"
import { verifySession } from "@/lib/server/auth"

export const metadata: Metadata = {
  title: "Authorize MCP access",
  description: "Review and authorize MCP access to an organization.",
}

export default async function McpOAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [, query] = await Promise.all([verifySession(), searchParams])
  const scopes = parseMcpOAuthScopes(query.scope)

  return (
    <AuthRouteFrame>
      <McpOAuthConsentController scopes={scopes} />
    </AuthRouteFrame>
  )
}
