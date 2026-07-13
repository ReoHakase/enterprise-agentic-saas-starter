import { dehydrate, QueryClient } from "@tanstack/react-query"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PageShell } from "@/components/page-shell"
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary"
import { TodosDashboard } from "@/components/todos-dashboard"
import { createServerApiClient } from "@/lib/server/api-client"
import { getCookieHeader } from "@/lib/server/auth"
import { getConsoleContext } from "@/lib/server/console-context"
import { listTodos, todoQueryKeys } from "@/lib/todos"

export const metadata: Metadata = {
  title: "Issues",
  description: "Track organization work from intake through completion.",
}

export default async function TodosPage() {
  const [{ me }, cookie] = await Promise.all([
    getConsoleContext(),
    getCookieHeader(),
  ])
  const apiClient = createServerApiClient(cookie)
  const queryClient = new QueryClient()
  const activeOrganization = me.organizations.find(
    (organization) => organization.active
  )

  if (!activeOrganization) {
    redirect("/settings/organizations")
  }

  await queryClient.prefetchQuery({
    queryKey: todoQueryKeys.todos(activeOrganization.id),
    queryFn: () => listTodos(apiClient, activeOrganization.id),
  })

  return (
    <PageShell
      title="Issues"
      description={`Track work for ${activeOrganization.name}. Switch organizations from the sidebar.`}
    >
      <QueryHydrationBoundary state={dehydrate(queryClient)}>
        <TodosDashboard organizationId={activeOrganization.id} />
      </QueryHydrationBoundary>
    </PageShell>
  )
}
