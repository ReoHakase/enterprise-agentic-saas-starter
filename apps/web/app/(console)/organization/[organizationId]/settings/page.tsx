import { redirect } from "next/navigation"

import { OrganizationSettingsForm } from "@/components/console/forms"
import { PageShell } from "@/components/page-shell"
import { createServerConsoleApi } from "@/lib/server/console-api"

type OrganizationSettingsPageProps = {
  params: Promise<{ organizationId: string }>
}

export default async function OrganizationSettingsPage({
  params,
}: OrganizationSettingsPageProps) {
  const { organizationId } = await params
  const api = await createServerConsoleApi()
  const organization = await api.getOrganization(organizationId)

  if (!organization.permissions.canEditOrganization) {
    redirect(`/organization/${organizationId}/members`)
  }

  return (
    <PageShell
      title="Organization settings"
      description="Update organization identity. Deletion is intentionally outside v1."
    >
      <OrganizationSettingsForm organization={organization} />
    </PageShell>
  )
}
