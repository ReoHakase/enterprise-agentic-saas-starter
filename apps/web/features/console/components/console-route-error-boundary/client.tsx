"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

import { ConsoleContentError } from "./view"

type ConsoleRouteErrorBoundaryProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export const ConsoleRouteErrorBoundary = ({
  error,
  reset,
}: ConsoleRouteErrorBoundaryProps) => {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return <ConsoleContentError reset={reset} />
}
