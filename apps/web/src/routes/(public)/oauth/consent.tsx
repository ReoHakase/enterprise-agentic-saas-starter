import { createFileRoute } from "@tanstack/react-router"

import { AuthRouteFrame } from "@/components/public-route-frame/public-route-frame"
import {
  createMcpOAuthAddAccountHref,
  McpOAuthConsentController,
  parseMcpOAuthScopes,
  parseMcpOAuthSearchParams,
} from "@/features/mcp-oauth"
import { loadConsoleMe } from "@/lib/server/console.functions"

import { AuthRouteError, OAuthRouteLoading } from "../-route-boundaries"

const McpOAuthConsentPage = () => {
  const { me, returnTo, scopes } = Route.useLoaderData()
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

export const Route = createFileRoute("/(public)/oauth/consent")({
  loader: async ({ location }) => {
    const returnTo = `/oauth/consent${location.searchStr}`
    const query = parseMcpOAuthSearchParams(location.searchStr)
    const me = await loadConsoleMe({ data: { redirectTo: returnTo } })
    return { me, returnTo, scopes: parseMcpOAuthScopes(query.scope) }
  },
  head: () => ({
    meta: [
      { title: "Authorize MCP access · Enterprise SaaS" },
      {
        content: "Review and authorize MCP access to an organization.",
        name: "description",
      },
    ],
  }),
  component: McpOAuthConsentPage,
  errorComponent: AuthRouteError,
  pendingComponent: OAuthRouteLoading,
})
