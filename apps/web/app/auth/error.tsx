"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

import { AuthRouteError } from "@/components/public-route-error-boundary.client"

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return <AuthRouteError reset={reset} />
}
