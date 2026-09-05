"use client"

import { useEffect } from "react"

import { reportObservedError } from "@/lib/report-observed-error"

import { ConsoleContentError, ConsoleShellError } from "./view"

type ConsoleRouteErrorBoundaryProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export const ConsoleRouteErrorBoundary = ({
  error,
  reset,
}: ConsoleRouteErrorBoundaryProps) => {
  useEffect(() => {
    reportObservedError(error)
  }, [error])

  return <ConsoleContentError reset={reset} />
}

export const ConsoleShellErrorBoundary = ({
  error,
  reset,
}: ConsoleRouteErrorBoundaryProps) => {
  useEffect(() => {
    reportObservedError(error)
  }, [error])

  return <ConsoleShellError reset={reset} />
}
