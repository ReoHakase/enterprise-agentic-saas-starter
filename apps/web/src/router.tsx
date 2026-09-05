import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"

import { createWebQueryClient } from "@/lib/query-client"
import { parseFlatSearch, stringifyFlatSearch } from "@/lib/router-search"
import { routeTree } from "@/routeTree.gen"

export const getRouter = () => {
  const queryClient = createWebQueryClient()
  const router = createRouter({
    caseSensitive: true,
    context: { queryClient },
    defaultPreload: "intent",
    parseSearch: parseFlatSearch,
    routeTree,
    scrollRestoration: true,
    stringifySearch: stringifyFlatSearch,
  })

  setupRouterSsrQueryIntegration({ queryClient, router })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
