import { createFileRoute, redirect } from "@tanstack/react-router"

import { IssuesRouteSkeleton } from "@/features/console"
import { consoleMeQueryOptions } from "@/lib/server/console.functions"

export const Route = createFileRoute("/_console/dashboard/todos")({
  loader: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(
      consoleMeQueryOptions(location.href)
    )
    const organization = me.organizations.find((candidate) => candidate.active)

    throw redirect({
      href: organization
        ? `/organization/${organization.slug}/issues`
        : "/settings/organizations",
    })
  },
  pendingComponent: IssuesRouteSkeleton,
  pendingMs: 0,
})
