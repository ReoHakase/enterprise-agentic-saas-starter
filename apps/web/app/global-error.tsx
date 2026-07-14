"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

import { StandaloneRouteError } from "@/components/public-boundary"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <StandaloneRouteError reset={reset} />
      </body>
    </html>
  )
}
