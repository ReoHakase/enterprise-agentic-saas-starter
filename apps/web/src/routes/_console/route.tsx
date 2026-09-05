import { Outlet, createFileRoute } from "@tanstack/react-router"

import {
  ConsoleShell,
  ConsoleShellErrorBoundary,
  ConsoleShellSkeleton,
} from "@/features/console"
import { consoleMeQueryOptions } from "@/lib/server/console.functions"

export const Route = createFileRoute("/_console")({
  component: () => <ConsoleLayout />,
  errorComponent: ConsoleShellErrorBoundary,
  loader: ({ context, location }) =>
    context.queryClient.ensureQueryData(consoleMeQueryOptions(location.href)),
  pendingComponent: ConsoleShellSkeleton,
  pendingMs: 0,
})

const ConsoleLayout = () => {
  const me = Route.useLoaderData()

  return (
    <ConsoleShell me={me}>
      <Outlet />
    </ConsoleShell>
  )
}
