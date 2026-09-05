import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

import { shouldRetryConsoleQuery } from "@/features/console"
import { reportObservedError } from "@/lib/report-observed-error"

export const createWebQueryClient = () =>
  new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => reportObservedError(error),
    }),
    queryCache: new QueryCache({
      onError: (error) => reportObservedError(error),
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetryConsoleQuery,
        staleTime: 30_000,
      },
    },
  })
