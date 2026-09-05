import "@fontsource-variable/geist-mono"
import "@fontsource-variable/inter"
import "@enterprise-agentic-saas/ui/globals.css"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { NotFound } from "@/components/not-found/not-found"
import { RootRouteLoading } from "@/components/public-route-suspense/public-route-suspense"
import { RootDocument } from "@/components/root-route/root-document"
import { RootError } from "@/components/root-route/root-error"
import { RouterTelemetry } from "@/components/root-route/router-telemetry"
import { createWebResponseHeaders } from "@/lib/web-response-headers"

type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    links: [{ href: "/favicon.ico", rel: "icon" }],
    meta: [
      { charSet: "utf-8" },
      {
        content:
          "A secure multi-tenant workspace for organizations, members, and issues.",
        name: "description",
      },
      { content: "Enterprise SaaS", name: "application-name" },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      { content: "light dark", name: "color-scheme" },
      { title: "Enterprise SaaS" },
    ],
  }),
  headers: () => createWebResponseHeaders(),
  component: () => <RootComponent />,
  errorComponent: (props) => <RootError {...props} />,
  notFoundComponent: NotFound,
  pendingComponent: RootRouteLoading,
  shellComponent: RootDocument,
})

const RootComponent = () => (
  <>
    <RouterTelemetry />
    <Outlet />
  </>
)
