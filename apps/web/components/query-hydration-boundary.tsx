"use client"

import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query"
import { useState, type PropsWithChildren } from "react"

type QueryHydrationBoundaryProps = PropsWithChildren<{
  state: DehydratedState
}>

export const QueryHydrationBoundary = ({
  children,
  state,
}: QueryHydrationBoundaryProps) => {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={state}>{children}</HydrationBoundary>
    </QueryClientProvider>
  )
}
