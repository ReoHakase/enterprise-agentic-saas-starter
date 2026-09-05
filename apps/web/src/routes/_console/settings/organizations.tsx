import { createFileRoute } from "@tanstack/react-router"

import {
  ConsoleRouteErrorBoundary,
  OrganizationsRouteSkeleton,
} from "@/features/console"
import { OrganizationsPage } from "@/features/organizations"
import { consoleMeQueryOptions } from "@/lib/server/console.functions"

export const Route = createFileRoute("/_console/settings/organizations")({
  loader: ({ context, location }) =>
    context.queryClient.ensureQueryData(consoleMeQueryOptions(location.href)),
  component: () => <OrganizationSettingsListPage />,
  errorComponent: ConsoleRouteErrorBoundary,
  pendingComponent: OrganizationsRouteSkeleton,
  pendingMs: 0,
})

const OrganizationSettingsListPage = () => {
  const me = Route.useLoaderData()

  return <OrganizationsPage initialOrganizations={me.organizations} />
}
