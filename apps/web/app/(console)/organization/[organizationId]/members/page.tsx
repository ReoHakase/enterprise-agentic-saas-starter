import { MembersPanel } from "@/components/console/forms"
import { PageShell } from "@/components/page-shell"
import { createServerConsoleApi } from "@/lib/server/console-api"

type MembersPageProps = {
  params: Promise<{ organizationId: string }>
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { organizationId } = await params
  const api = await createServerConsoleApi()
  const [organization, members, invitations] = await Promise.all([
    api.getOrganization(organizationId),
    api.listMembers(organizationId),
    api.listInvitations(organizationId).catch(() => []),
  ])

  return (
    <PageShell
      title="Members"
      description={`Manage users and permissions for ${organization.name}.`}
    >
      <MembersPanel
        organization={organization}
        members={members}
        invitations={invitations}
      />
    </PageShell>
  )
}
