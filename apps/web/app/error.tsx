"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

import { RootRouteError } from "@/components/public-route-error-boundary.client"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return <RootRouteError reset={reset} />
}
