import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import {
  ArrowRightIcon,
  Building2Icon,
  CheckCircle2Icon,
  CircleDotIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LinkButton } from "@/components/link-button"
import { PageShell } from "@/components/page-shell"
import { listIssues } from "@/features/issues/api"
import { OrganizationActivationGate } from "@/features/organizations/components/organization-activation-gate"
import { createServerApiClient } from "@/lib/server/api-client"
import { getCookieHeader } from "@/lib/server/auth"
import { getConsoleContext } from "@/lib/server/console-context"

export const metadata: Metadata = {
  title: "Overview",
  description: "Organization activity, access, and work at a glance.",
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>
}) {
  const { organizationSlug } = await params
  const [{ me }, cookie] = await Promise.all([
    getConsoleContext(),
    getCookieHeader(),
  ])
  const activeOrganization = me.organizations.find(
    (organization) => organization.slug === organizationSlug
  )

  if (!activeOrganization) {
    notFound()
  }

  if (!activeOrganization.active) {
    return (
      <PageShell
        title="Overview"
        description={`Everything your team needs to operate ${activeOrganization.name}.`}
      >
        <OrganizationActivationGate
          organizationId={activeOrganization.id}
          organizationName={activeOrganization.name}
        />
      </PageShell>
    )
  }

  const issues = await listIssues(
    createServerApiClient(cookie),
    activeOrganization.id
  )
  const closedIssues = issues.filter(
    (issue) => issue.status === "closed"
  ).length
  const openIssues = issues.length - closedIssues
  const enabledPermissions = Object.values(
    activeOrganization.permissions
  ).filter(Boolean).length

  return (
    <PageShell
      title="Overview"
      description={`Everything your team needs to operate ${activeOrganization.name}.`}
      actionHref={`/organization/${activeOrganization.slug}/issues`}
      actionLabel="View issues"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardDescription>Active organization</CardDescription>
            <CardTitle className="text-2xl">
              {activeOrganization.name}
            </CardTitle>
            <CardAction>
              <Badge variant="secondary">Ready</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="max-w-2xl text-sm text-muted-foreground">
              You are working inside an isolated tenant scope. Member,
              permission, and issue actions stay attached to this organization
              until you switch from the sidebar.
            </p>
          </CardContent>
          <CardFooter className="flex-wrap gap-2 border-t">
            <LinkButton
              variant="outline"
              href={`/organization/${activeOrganization.slug}/members`}
            >
              <UsersRoundIcon data-icon="inline-start" aria-hidden="true" />
              Manage members
            </LinkButton>
            <LinkButton variant="ghost" href="/settings/organizations">
              <Building2Icon data-icon="inline-start" aria-hidden="true" />
              Organization directory
            </LinkButton>
          </CardFooter>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Members"
            value={activeOrganization.memberCount}
            description="Active seats"
            icon={UsersRoundIcon}
          />
          <MetricCard
            title="Open issues"
            value={openIssues}
            description="Need attention"
            icon={CircleDotIcon}
          />
          <MetricCard
            title="Closed issues"
            value={closedIssues}
            description="Completed work"
            icon={CheckCircle2Icon}
          />
          <MetricCard
            title="Permissions"
            value={enabledPermissions}
            description={activeOrganization.role.replace("_", " ")}
            icon={ShieldCheckIcon}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Get productive</CardTitle>
              <CardDescription>
                The shortest path from workspace setup to tracked work.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <QuickAction
                number="01"
                title="Invite your team"
                description="Add members and assign the minimum role they need."
                href={`/organization/${activeOrganization.slug}/members`}
              />
              <QuickAction
                number="02"
                title="Create an issue"
                description="Capture work with status, priority, and organization context."
                href={`/organization/${activeOrganization.slug}/issues`}
              />
              <QuickAction
                number="03"
                title="Review account security"
                description="Add passkeys and remove sessions you no longer recognize."
                href="/settings/account"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access summary</CardTitle>
              <CardDescription>
                Effective capabilities for your current role.
              </CardDescription>
              <CardAction>
                <ShieldCheckIcon aria-hidden="true" />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {activeOrganization.permissions.canInviteMembers ? (
                <Badge variant="outline">Invite members</Badge>
              ) : null}
              {activeOrganization.permissions.canManageMembers ? (
                <Badge variant="outline">Manage members</Badge>
              ) : null}
              {activeOrganization.permissions.canManageAdmins ? (
                <Badge variant="outline">Manage admins</Badge>
              ) : null}
              {activeOrganization.permissions.canEditOrganization ? (
                <Badge variant="outline">Edit organization</Badge>
              ) : null}
              {activeOrganization.permissions.canTransferSuperAdmin ? (
                <Badge variant="outline">Transfer ownership</Badge>
              ) : null}
            </CardContent>
            <CardFooter className="border-t">
              <p className="text-sm text-muted-foreground">
                Sensitive actions still require server-side authorization.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}

const MetricCard = ({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: number
  description: string
  icon: typeof UsersRoundIcon
}) => (
  <Card size="sm">
    <CardHeader>
      <CardDescription>{title}</CardDescription>
      <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      <CardAction>
        <Icon aria-hidden="true" />
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-xs text-muted-foreground capitalize">{description}</p>
    </CardContent>
  </Card>
)

const QuickAction = ({
  number,
  title,
  description,
  href,
}: {
  number: string
  title: string
  description: string
  href: string
}) => (
  <Link
    href={href}
    className="group flex items-center gap-4 rounded-xl border p-4 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30"
  >
    <span className="text-xs font-medium text-muted-foreground">{number}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{title}</span>
      <span className="block text-sm text-muted-foreground">{description}</span>
    </span>
    <ArrowRightIcon aria-hidden="true" />
  </Link>
)
