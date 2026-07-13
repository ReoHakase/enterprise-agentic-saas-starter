"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import * as Sentry from "@sentry/nextjs"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect } from "react"

import { AppState } from "@/components/app-state"

export default function ConsoleError({
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
    <AppState
      className="min-h-[60svh]"
      icon={TriangleAlertIcon}
      title="This page could not be loaded"
      description="Your data was not changed. Try the request again; the current account and organization remain selected."
      actions={
        <Button onClick={reset}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      }
    />
  )
}
