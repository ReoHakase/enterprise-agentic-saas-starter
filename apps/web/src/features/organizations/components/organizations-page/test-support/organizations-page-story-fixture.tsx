import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { AgentStoryScope } from "@/features/agent/test-support/fixtures"

import { fictionalOrganizations } from "../../../test-support/fixtures"
import { OrganizationsPage } from "../organizations-page"

export const OrganizationsPageStoryFixture = () => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false, staleTime: Infinity },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AgentStoryScope>
        <OrganizationsPage initialOrganizations={fictionalOrganizations} />
      </AgentStoryScope>
    </QueryClientProvider>
  )
}
