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
import { createFileRoute } from "@tanstack/react-router"
import {
  Building2Icon,
  CheckCircle2Icon,
  CircleDotIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react"

import { LinkButton } from "@/components/link-button/link-button"
import { PageShell } from "@/components/page-shell/page-shell"
import {
  ConsoleRouteErrorBoundary,
  DashboardRouteSkeleton,
} from "@/features/console"
import { OrganizationActivationGate } from "@/features/organizations"
import { loadOrganizationDashboard } from "@/lib/server/console.functions"

import { MetricCard } from "./-dashboard-metric-card"
import { QuickAction } from "./-dashboard-quick-action"

export const Route = createFileRoute(
  "/_console/organization/$organizationSlug/dashboard"
)({
  loader: ({ params }) =>
    loadOrganizationDashboard({
      data: { organizationSlug: params.organizationSlug },
    }),
  head: () => ({
    meta: [
      { title: "Overview · Enterprise SaaS" },
      {
        content: "Organization activity, access, and work at a glance.",
        name: "description",
      },
    ],
  }),
  component: () => <OrganizationDashboardRoute />,
  errorComponent: ConsoleRouteErrorBoundary,
  pendingComponent: DashboardRouteSkeleton,
  pendingMs: 0,
})

const OrganizationDashboardRoute = () => {
  const dashboard = Route.useLoaderData()
  const { organization } = dashboard

  if (dashboard.inactive) {
    return (
      <PageShell
        title="Overview"
        description={`Everything your team needs to operate ${organization.name}.`}
      >
        <OrganizationActivationGate
          organizationId={organization.id}
          organizationName={organization.name}
        />
      </PageShell>
    )
  }

  const enabledPermissions = Object.values(organization.permissions).filter(
    Boolean
  ).length

  return (
    <PageShell
      title="Overview"
      description={`Everything your team needs to operate ${organization.name}.`}
      actionHref={`/organization/${organization.slug}/issues`}
      actionLabel="View issues"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardDescription>Active organization</CardDescription>
            <CardTitle className="text-2xl">{organization.name}</CardTitle>
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
              href={`/organization/${organization.slug}/members`}
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
            value={organization.memberCount}
            description="Active seats"
            icon={UsersRoundIcon}
          />
          <MetricCard
            title="Open issues"
            value={dashboard.openIssues}
            description="Need attention"
            icon={CircleDotIcon}
          />
          <MetricCard
            title="Closed issues"
            value={dashboard.closedIssues}
            description="Completed work"
            icon={CheckCircle2Icon}
          />
          <MetricCard
            title="Permissions"
            value={enabledPermissions}
            description={organization.role.replace("_", " ")}
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
                href={`/organization/${organization.slug}/members`}
              />
              <QuickAction
                number="02"
                title="Create an issue"
                description="Capture work with status, priority, and organization context."
                href={`/organization/${organization.slug}/issues`}
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
              {organization.permissions.canInviteMembers ? (
                <Badge variant="outline">Invite members</Badge>
              ) : null}
              {organization.permissions.canManageMembers ? (
                <Badge variant="outline">Manage members</Badge>
              ) : null}
              {organization.permissions.canManageAdmins ? (
                <Badge variant="outline">Manage admins</Badge>
              ) : null}
              {organization.permissions.canEditOrganization ? (
                <Badge variant="outline">Edit organization</Badge>
              ) : null}
              {organization.permissions.canTransferOwnership ? (
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
