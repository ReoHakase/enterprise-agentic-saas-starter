import { createFileRoute } from "@tanstack/react-router"

import { AuthRouteFrame } from "@/components/public-route-frame/public-route-frame"
import {
  createMcpOAuthAddAccountHref,
  McpOAuthOrganizationController,
} from "@/features/mcp-oauth"
import { loadConsoleMe } from "@/lib/server/console.functions"

import { AuthRouteError, OAuthRouteLoading } from "../-route-boundaries"

const McpOAuthOrganizationPage = () => {
  const { me, returnTo } = Route.useLoaderData()

  return (
    <AuthRouteFrame size="oauth">
      <McpOAuthOrganizationController
        addAccountHref={createMcpOAuthAddAccountHref(returnTo)}
        currentUser={me.user}
        organizations={me.organizations}
        returnTo={returnTo}
      />
    </AuthRouteFrame>
  )
}

export const Route = createFileRoute("/(public)/oauth/organization")({
  loader: async ({ location }) => {
    const returnTo = `/oauth/organization${location.searchStr}`
    const me = await loadConsoleMe({ data: { redirectTo: returnTo } })
    return { me, returnTo }
  },
  head: () => ({
    meta: [
      { title: "Choose an organization · Enterprise SaaS" },
      {
        content: "Choose the organization available to an MCP client.",
        name: "description",
      },
    ],
  }),
  component: McpOAuthOrganizationPage,
  errorComponent: AuthRouteError,
  pendingComponent: OAuthRouteLoading,
})
