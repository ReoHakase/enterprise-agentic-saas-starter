import { ShieldAlertIcon } from "lucide-react"
import { notFound } from "next/navigation"

import { AppState } from "@/components/app-state"
import { LinkButton } from "@/components/link-button"
import { PageShell } from "@/components/page-shell"
import { OrganizationActivationGate } from "@/features/organizations/activation-gate.public"
import { OrganizationSettingsForm } from "@/features/organizations/settings-form.public"
import { createServerConsoleApi } from "@/lib/server/console-api"

type OrganizationSettingsPageProps = {
  params: Promise<{ organizationSlug: string }>
}

export default async function OrganizationSettingsPage({
  params,
}: OrganizationSettingsPageProps) {
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
        title="Organization settings"
        description={`Manage identity and sensitive controls for ${organizationSummary.name}.`}
      >
        <OrganizationActivationGate
          organizationId={organizationSummary.id}
          organizationName={organizationSummary.name}
        />
      </PageShell>
    )
  }

  const organization = await api.getOrganization(organizationSummary.id)

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
