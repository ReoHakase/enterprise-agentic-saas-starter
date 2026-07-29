"use client"

import { useEffect } from "react"

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
        <StandaloneRouteError reset={reset} />
      </body>
    </html>
  )
}
