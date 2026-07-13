"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import * as Sentry from "@sentry/nextjs"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect } from "react"

import { AppState } from "@/components/app-state"

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

  return (
    <AppState
      icon={TriangleAlertIcon}
      title="This page could not be loaded"
      description="Your data was not changed. Try the request again, or return to the dashboard if the problem continues."
      actions={
        <Button onClick={reset}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      }
    />
  )
}
