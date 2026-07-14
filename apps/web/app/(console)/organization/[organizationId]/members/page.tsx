import { PageShell } from "@/components/page-shell"
import { MembersPage as MembersPageContent } from "@/features/members/components/members-page"
import { createServerConsoleApi } from "@/lib/server/console-api"

type MembersPageProps = {
  params: Promise<{ organizationId: string }>
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { organizationId } = await params
  const api = await createServerConsoleApi()
  const [organization, members] = await Promise.all([
    api.getOrganization(organizationId),
    api.listMembers(organizationId),
  ])

  return (
    <PageShell
      title="Members"
      description={`Manage users and permissions for ${organization.name}.`}
    >
      <MembersPageContent
        organization={organization}
        initialMembers={members}
      />
    </PageShell>
  )
}
