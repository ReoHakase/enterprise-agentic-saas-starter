import { createFileRoute } from "@tanstack/react-router"

import { PageShell } from "@/components/page-shell/page-shell"
import {
  ConsoleRouteErrorBoundary,
  MembersRouteSkeleton,
} from "@/features/console"
import { MembersPage } from "@/features/members"
import { OrganizationActivationGate } from "@/features/organizations"
import { loadOrganizationMembers } from "@/lib/server/console.functions"

export const Route = createFileRoute(
  "/_console/organization/$organizationSlug/members"
)({
  loader: ({ params }) =>
    loadOrganizationMembers({
      data: { organizationSlug: params.organizationSlug },
    }),
  component: () => <OrganizationMembersRoute />,
  errorComponent: ConsoleRouteErrorBoundary,
  pendingComponent: MembersRouteSkeleton,
  pendingMs: 0,
})

const OrganizationMembersRoute = () => {
  const members = Route.useLoaderData()

  if (members.inactive) {
    const { organization } = members
    return (
      <PageShell
        title="Members"
        description={`Manage users and permissions for ${organization.name}.`}
      >
        <OrganizationActivationGate
          organizationId={organization.id}
          organizationName={organization.name}
        />
      </PageShell>
    )
  }

  const { organization } = members
  return (
    <PageShell
      title="Members"
      description={`Manage users and permissions for ${organization.name}.`}
    >
      <MembersPage
        organization={organization}
        initialMembers={members.members}
        initialInvitations={members.invitations}
        initialInvitationsError={members.invitationsError}
      />
    </PageShell>
  )
}
