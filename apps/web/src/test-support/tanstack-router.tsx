import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { type ReactNode, useState } from "react"

export const TestRouterProvider = ({
  children,
  initialEntry = "/dashboard",
}: {
  children: ReactNode
  initialEntry?: string
}) => {
  const [router] = useState(() => {
    const rootRoute = createRootRoute()
    const testRoute = createRoute({
      component: () => children,
      getParentRoute: () => rootRoute,
      path: "$",
    })

    return createRouter({
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      routeTree: rootRoute.addChildren([testRoute]),
    })
  })

  return <RouterProvider router={router} />
}
