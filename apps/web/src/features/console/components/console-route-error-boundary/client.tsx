"use client"

import { captureException } from "@sentry/nextjs"
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
    captureException(error)
  }, [error])

  return <ConsoleContentError reset={reset} />
}
