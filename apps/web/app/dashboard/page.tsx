import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
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
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
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
            </CardHeader>
            <CardContent>
              <Link
                href={`/organization/${activeOrganization?.id}/members`}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Manage users and roles
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Todos</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/dashboard/todos"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open todo workspace
              </Link>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </ConsolePage>
  )
}
