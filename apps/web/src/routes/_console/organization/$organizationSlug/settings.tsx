import { createFileRoute } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"

import { AppState } from "@/components/app-state/app-state"
import { LinkButton } from "@/components/link-button/link-button"
import { PageShell } from "@/components/page-shell/page-shell"
import {
  ConsoleRouteErrorBoundary,
  OrganizationSettingsRouteSkeleton,
} from "@/features/console"
import {
  OrganizationActivationGate,
  OrganizationSettingsForm,
} from "@/features/organizations"
import { loadOrganizationSettings } from "@/lib/server/console.functions"

export const Route = createFileRoute(
  "/_console/organization/$organizationSlug/settings"
)({
  loader: ({ params }) =>
    loadOrganizationSettings({
      data: { organizationSlug: params.organizationSlug },
    }),
  component: () => <OrganizationSettingsRoute />,
  errorComponent: ConsoleRouteErrorBoundary,
  pendingComponent: OrganizationSettingsRouteSkeleton,
  pendingMs: 0,
})

const OrganizationSettingsRoute = () => {
  const settings = Route.useLoaderData()

  if (settings.inactive) {
    const { organization } = settings
    return (
      <PageShell
        title="Organization settings"
        description={`Manage identity and sensitive controls for ${organization.name}.`}
      >
        <OrganizationActivationGate
          organizationId={organization.id}
          organizationName={organization.name}
        />
      </PageShell>
    )
  }

  const { organization } = settings
  if (!organization.permissions.canEditOrganization) {
    return (
      <PageShell
        title="Organization settings"
        description={`Manage identity and sensitive controls for ${organization.name}.`}
      >
        <AppState
          className="min-h-96"
          icon={ShieldAlertIcon}
          title="You cannot edit this organization"
          description="Your current role can view members but cannot change organization identity or sensitive settings."
        >
          <LinkButton
            variant="outline"
            href={`/organization/${organization.slug}/members`}
          >
            View members
          </LinkButton>
        </AppState>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Organization settings"
      description={`Manage identity and sensitive controls for ${organization.name}.`}
    >
      <OrganizationSettingsForm organization={organization} />
    </PageShell>
  )
}
