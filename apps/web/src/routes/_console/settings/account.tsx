import { createFileRoute } from "@tanstack/react-router"

import { PageShell } from "@/components/page-shell/page-shell"
import {
  ProfileForm,
  SecurityMethodsPanel,
  SessionsPanel,
} from "@/features/account"
import {
  AccountSettingsRouteSkeleton,
  ConsoleRouteErrorBoundary,
} from "@/features/console"
import { McpOAuthSessionsPanel } from "@/features/mcp-oauth"
import { consoleMeQueryOptions } from "@/lib/server/console.functions"

export const Route = createFileRoute("/_console/settings/account")({
  loader: ({ context, location }) =>
    context.queryClient.ensureQueryData(consoleMeQueryOptions(location.href)),
  head: () => ({
    meta: [
      { title: "Account settings · Enterprise SaaS" },
      {
        content: "Manage your profile, signed-in devices, and MCP access.",
        name: "description",
      },
    ],
  }),
  component: () => <AccountSettingsPage />,
  errorComponent: ConsoleRouteErrorBoundary,
  pendingComponent: AccountSettingsRouteSkeleton,
  pendingMs: 0,
})

const AccountSettingsPage = () => {
  const me = Route.useLoaderData()

  return (
    <PageShell
      title="Account settings"
      description="Manage your profile, signed-in devices, and MCP access from one place."
    >
      <div className="grid min-w-0 gap-6">
        <ProfileForm user={me.user} />
        <SecurityMethodsPanel />
        <SessionsPanel />
        <McpOAuthSessionsPanel />
      </div>
    </PageShell>
  )
}
