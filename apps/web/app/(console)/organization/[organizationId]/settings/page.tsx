import { ShieldAlertIcon } from "lucide-react"

import { AppState } from "@/components/app-state"
import { LinkButton } from "@/components/link-button"
import { PageShell } from "@/components/page-shell"
import { OrganizationSettingsForm } from "@/features/organizations/components/organization-settings-form"
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
            href={`/organization/${organizationId}/members`}
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
