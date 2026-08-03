import type { Metadata } from "next"

import { AuthRouteFrame } from "@/components/public-route-frame/public-route-frame"
import { McpOAuthOrganizationController } from "@/features/mcp-oauth"
import { getConsoleContext } from "@/lib/server/console-context"

export const metadata: Metadata = {
  title: "Choose an organization",
  description: "Choose the organization available to an MCP client.",
}

export default async function McpOAuthOrganizationPage() {
  const { me } = await getConsoleContext()

  return (
    <AuthRouteFrame>
      <McpOAuthOrganizationController organizations={me.organizations} />
    </AuthRouteFrame>
  )
}
