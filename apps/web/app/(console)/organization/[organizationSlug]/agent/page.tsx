import { BotIcon } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageShell } from "@/components/page-shell"
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
      <section className="grid min-h-72 place-items-center rounded-2xl border bg-card p-8 text-center">
        <div className="max-w-md">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BotIcon aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-heading text-lg font-medium">
            The Agent now works alongside every page
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep this route as a focused entry point, or navigate through the
            console while the same private thread stays open in the Agent pane.
          </p>
        </div>
      </section>
    </PageShell>
  )
}
