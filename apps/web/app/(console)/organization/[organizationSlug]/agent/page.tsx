import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageShell } from "@/components/page-shell"
import { AgentDashboard } from "@/features/agent/components/agent-dashboard"
import { OrganizationActivationGate } from "@/features/organizations/components/organization-activation-gate"
import { getConsoleContext } from "@/lib/server/console-context"

export const metadata: Metadata = {
  title: "Agent",
  description: "Work with an organization-scoped Issue agent.",
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>
}) {
  const [{ organizationSlug }, { me }] = await Promise.all([
    params,
    getConsoleContext(),
  ])
  const organization = me.organizations.find(
    (candidate) => candidate.slug === organizationSlug
  )
  if (!organization) notFound()

  if (!organization.active) {
    return (
      <PageShell title="Agent" description={`Work with ${organization.name}.`}>
        <OrganizationActivationGate
          organizationId={organization.id}
          organizationName={organization.name}
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Agent"
      description={`Analyze screenshots and manage Issues for ${organization.name}.`}
    >
      <AgentDashboard
        organizationId={organization.id}
        organizationSlug={organization.slug}
      />
    </PageShell>
  )
}
