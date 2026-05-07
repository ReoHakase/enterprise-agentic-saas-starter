import { dehydrate, QueryClient } from "@tanstack/react-query"

import { QueryHydrationBoundary } from "@/components/query-hydration-boundary"
import { TodosDashboard } from "@/components/todos-dashboard"
import { createServerApiClient } from "@/lib/server/api-client"
import { getCookieHeader, verifySession } from "@/lib/server/auth"
import { listOrganizations, listTodos, todoQueryKeys } from "@/lib/todos"

export default async function Page() {
  const session = await verifySession()
  const cookie = await getCookieHeader()
  const apiClient = createServerApiClient(cookie)
  const queryClient = new QueryClient()

  const organizations = await queryClient.fetchQuery({
    queryKey: todoQueryKeys.organizations,
    queryFn: () => listOrganizations(apiClient),
  })
  const initialOrganizationId = organizations[0]?.id

  if (initialOrganizationId) {
    await queryClient.prefetchQuery({
      queryKey: todoQueryKeys.todos(initialOrganizationId),
      queryFn: () => listTodos(apiClient, initialOrganizationId),
    })
  }

  return (
    <QueryHydrationBoundary state={dehydrate(queryClient)}>
      <TodosDashboard
        initialOrganizationId={initialOrganizationId}
        userLabel={session.user.email}
      />
    </QueryHydrationBoundary>
  )
}
