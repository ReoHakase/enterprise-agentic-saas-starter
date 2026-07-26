import type { QueryClient } from "@tanstack/react-query"

export const clearAuthenticatedQueryCache = async (
  queryClient: QueryClient
) => {
  await queryClient.cancelQueries()
  queryClient.clear()
}
