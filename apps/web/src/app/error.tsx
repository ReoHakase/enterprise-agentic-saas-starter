"use client"

import { captureException } from "@sentry/nextjs"
import { useEffect } from "react"

import { RootRouteError } from "@/components/public-route-error-boundary.client/public-route-error-boundary.client"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    captureException(error)
  }, [error])

  return <RootRouteError reset={reset} />
}
