import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import {
  ArrowRightIcon,
  Building2Icon,
  ListTodoIcon,
  ShieldIcon,
  UsersRoundIcon,
} from "lucide-react"
import Link from "next/link"

import { ConsolePage } from "@/components/console/console-page"
import { PageShell } from "@/components/page-shell"
import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export default async function DashboardPage() {
  await verifySession()
  const api = await createServerConsoleApi()
  const me = await api.getMe()
  const activeOrganization =
    me.organizations.find((organization) => organization.active) ??
    me.organizations[0]

  return (
    <ConsolePage>
      <PageShell
        title="Dashboard"
        description="Operate the current organization from one SaaS console."
      >
        <div className="grid gap-5">
          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <Card className="border-foreground/10 bg-card/85 shadow-xl shadow-primary/5">
              <CardHeader>
                <div className="flex size-11 items-center justify-center rounded-4xl bg-primary/10 text-primary">
                  <Building2Icon aria-hidden="true" />
                </div>
                <CardTitle className="text-2xl font-semibold tracking-normal">
                  {activeOrganization?.name ?? "No organization"}
                </CardTitle>
                <CardDescription>
                  {activeOrganization?.memberCount ?? 0} members in the active
                  workspace.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Button
                  nativeButton={false}
                  render={<Link href="/dashboard/todos" />}
                >
                  <ListTodoIcon data-icon="inline-start" />
                  Open todos
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
                {activeOrganization ? (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    render={
                      <Link
                        href={`/organization/${activeOrganization.id}/members`}
                      />
                    }
                  >
                    <UsersRoundIcon data-icon="inline-start" />
                    Manage members
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-foreground/10 bg-card/85">
              <CardHeader>
                <CardTitle>Access level</CardTitle>
                <CardDescription>Current organization role</CardDescription>
                <CardAction>
                  <ShieldIcon aria-hidden="true" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary" className="rounded-4xl px-3 py-1">
                  {activeOrganization ? activeOrganization.role : "No role"}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Organization</CardTitle>
                <CardDescription>Active tenant</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {activeOrganization?.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {activeOrganization?.memberCount ?? 0} members
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Members</CardTitle>
                <CardDescription>Roles and invitations</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/organization/${activeOrganization?.id}/members`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Manage users and roles
                  <ArrowRightIcon />
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Todos</CardTitle>
                <CardDescription>Operational tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/dashboard/todos"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open todo workspace
                  <ArrowRightIcon />
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card className="border-foreground/10 bg-card/80">
            <CardHeader>
              <CardTitle>Workspace flow</CardTitle>
              <CardDescription>
                Core checks for this SaaS template tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {["Authentication", "Permissions", "Audit-ready actions"].map(
                (item, index) => (
                  <div
                    key={item}
                    className="rounded-3xl border border-border/70 bg-background/70 p-4"
                  >
                    <p className="text-2xl font-semibold">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-3 text-sm font-medium">{item}</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </ConsolePage>
  )
}
