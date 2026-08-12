import type { Metadata } from "next"

import { AuthRouteFrame } from "@/components/public-route-frame/public-route-frame"
import {
  createMcpOAuthAddAccountHref,
  createMcpOAuthRoutePath,
  McpOAuthConsentController,
  parseMcpOAuthScopes,
} from "@/features/mcp-oauth"
import { getConsoleContext } from "@/lib/server/console-context"

export const metadata: Metadata = {
  title: "Authorize MCP access",
  description: "Review and authorize MCP access to an organization.",
}

export default async function McpOAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const returnTo = createMcpOAuthRoutePath("/oauth/consent", query)
  const { me } = await getConsoleContext(returnTo)
  const scopes = parseMcpOAuthScopes(query.scope)
  const activeOrganization = me.organizations.find(
    ({ id }) => id === me.activeOrganizationId
  )

  return (
    <AuthRouteFrame size="oauth">
      <McpOAuthConsentController
        addAccountHref={createMcpOAuthAddAccountHref(returnTo)}
        currentUser={me.user}
        organization={activeOrganization}
        returnTo={returnTo}
        scopes={scopes}
      />
    </AuthRouteFrame>
  )
}
