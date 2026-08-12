"use client"

import { useEffect } from "react"

// Next error boundaries are client entrypoints even though the framework renders them from the server.
// oxlint-disable-next-line react-doctor/react-router-no-client-module-in-server-render
import { AuthRouteError } from "@/components/public-route-error-boundary.client/public-route-error-boundary.client"
import { reportObservedError } from "@/lib/report-observed-error"

export default function AuthPathError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportObservedError(error)
  }, [error])

  // Next error boundaries are client entrypoints even though the framework renders them from the server.
  // oxlint-disable-next-line react-doctor/react-router-no-client-module-in-server-render
  return <AuthRouteError reset={reset} />
}
