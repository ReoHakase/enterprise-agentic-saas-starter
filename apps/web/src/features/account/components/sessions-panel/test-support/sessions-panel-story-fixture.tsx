import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { consoleKeys } from "@/features/console"

import { fictionalSessions } from "../../../test-support/fixtures"
import { SessionsPanel } from "../sessions-panel"

export const SessionsPanelStoryFixture = () => {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false, staleTime: Infinity },
      },
    })
    client.setQueryData(consoleKeys.sessions(), fictionalSessions)
    return client
  })

  return (
    <QueryClientProvider client={queryClient}>
      <SessionsPanel />
    </QueryClientProvider>
  )
}
