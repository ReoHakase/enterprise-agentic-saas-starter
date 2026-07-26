"use client"

import { captureException } from "@sentry/nextjs"
import { useEffect } from "react"

import { StandaloneRouteError } from "@/components/public-route-error-boundary.client/public-route-error-boundary.client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <StandaloneRouteError reset={reset} />
      </body>
    </html>
  )
}
