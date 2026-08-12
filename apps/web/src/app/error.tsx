"use client"

import { useEffect } from "react"

// Nextのerror boundaryはframeworkがserverからrenderする場合でもclient entrypointである。
// oxlint-disable-next-line react-doctor/react-router-no-client-module-in-server-render
import { RootRouteError } from "@/components/public-route-error-boundary.client/public-route-error-boundary.client"
import { reportObservedError } from "@/lib/report-observed-error"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportObservedError(error)
  }, [error])

  // Nextのerror boundaryはframeworkがserverからrenderする場合でもclient entrypointである。
  // oxlint-disable-next-line react-doctor/react-router-no-client-module-in-server-render
  return <RootRouteError reset={reset} />
}
