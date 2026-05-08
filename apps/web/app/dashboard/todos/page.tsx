import { dehydrate, QueryClient } from "@tanstack/react-query"
import { redirect } from "next/navigation"

import { ConsolePage } from "@/components/console/console-page"
import { PageShell } from "@/components/page-shell"
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary"
import { TodosDashboard } from "@/components/todos-dashboard"
import { createServerApiClient } from "@/lib/server/api-client"
import { getCookieHeader, verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"
import { listTodos, todoQueryKeys } from "@/lib/todos"

export default async function TodosPage() {
  await verifySession()
  const cookie = await getCookieHeader()
  const apiClient = createServerApiClient(cookie)
  const consoleApi = await createServerConsoleApi()
  const queryClient = new QueryClient()
  const me = await consoleApi.getMe()
  const activeOrganization =
    me.organizations.find((organization) => organization.active) ??
    me.organizations[0]

  if (!activeOrganization) {
    redirect("/onboarding")
  }

  await queryClient.prefetchQuery({
    queryKey: todoQueryKeys.todos(activeOrganization.id),
    queryFn: () => listTodos(apiClient, activeOrganization.id),
  })

  return (
    <ConsolePage>
      <PageShell
        title="Todos"
        description={`Tasks for ${activeOrganization.name}. Switch organization from the sidebar.`}
      >
        <QueryHydrationBoundary state={dehydrate(queryClient)}>
          <TodosDashboard organizationId={activeOrganization.id} />
        </QueryHydrationBoundary>
      </PageShell>
    </ConsolePage>
  )
}
