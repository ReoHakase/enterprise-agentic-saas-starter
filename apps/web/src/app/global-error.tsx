"use client"

import { useEffect } from "react"

// Nextのerror boundaryはframeworkがserverからrenderする場合でもclient entrypointである。
// oxlint-disable-next-line react-doctor/react-router-no-client-module-in-server-render
import { StandaloneRouteError } from "@/components/public-route-error-boundary.client/public-route-error-boundary.client"
import { reportObservedError } from "@/lib/report-observed-error"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportObservedError(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        {/* oxlint-disable-next-line react-doctor/react-router-no-client-module-in-server-render */}
        <StandaloneRouteError reset={reset} />
      </body>
    </html>
  )
}
