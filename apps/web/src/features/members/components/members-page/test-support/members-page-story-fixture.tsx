import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { useState } from "react"

import {
  fictionalInvitations,
  fictionalMemberOrganization,
  fictionalMembers,
} from "../../../test-support/fixtures"
import { MembersPage } from "../members-page"

export const MembersPageStoryFixture = () => {
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
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <MembersPage
          organization={fictionalMemberOrganization}
          initialMembers={fictionalMembers}
          initialInvitations={fictionalInvitations}
        />
      </QueryClientProvider>
    </NuqsAdapter>
  )
}
