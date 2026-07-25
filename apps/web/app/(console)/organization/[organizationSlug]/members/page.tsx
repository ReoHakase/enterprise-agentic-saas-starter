import { notFound } from "next/navigation"

import { PageShell } from "@/components/page-shell/page-shell"
import { getConsoleApiErrorText } from "@/features/console"
import { MembersPage as MembersPageContent } from "@/features/members"
import type { OrganizationInvitation } from "@/features/members"
import { OrganizationActivationGate } from "@/features/organizations"
import { createServerConsoleApi } from "@/lib/server/console-api"

type MembersPageProps = {
  params: Promise<{ organizationSlug: string }>
}

const noInvitations: OrganizationInvitation[] = []

export default async function MembersPage({ params }: MembersPageProps) {
  const { organizationSlug } = await params
  const api = await createServerConsoleApi()
  const organizations = await api.listOrganizations()
  const organizationSummary = organizations.find(
    (organization) => organization.slug === organizationSlug
  )

  if (!organizationSummary) {
    notFound()
  }

  if (!organizationSummary.active) {
    return (
      <PageShell
        title="Members"
        description={`Manage users and permissions for ${organizationSummary.name}.`}
      >
        <OrganizationActivationGate
          organizationId={organizationSummary.id}
          organizationName={organizationSummary.name}
        />
      </PageShell>
    )
  }

  const invitationsResult = organizationSummary.permissions.canInviteMembers
    ? api
        .listInvitations(organizationSummary.id)
        .then((data) => ({ data, error: undefined }))
        .catch((error: unknown) => ({
          data: undefined,
          error: getConsoleApiErrorText(
            error,
            "Invitations could not be loaded."
          ),
        }))
    : Promise.resolve({ data: noInvitations, error: undefined })
  const [organization, members, invitations] = await Promise.all([
    api.getOrganization(organizationSummary.id),
    api.listMembers(organizationSummary.id),
    invitationsResult,
  ])

  return (
    <PageShell
      title="Members"
      description={`Manage users and permissions for ${organization.name}.`}
    >
      <MembersPageContent
        organization={organization}
        initialMembers={members}
        initialInvitations={invitations.data}
        initialInvitationsError={invitations.error}
      />
    </PageShell>
  )
}
