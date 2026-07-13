"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import * as Sentry from "@sentry/nextjs"
import { RefreshCwIcon, ShieldAlertIcon } from "lucide-react"
import { useEffect } from "react"

import { AppState } from "@/components/app-state"

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
        <AppState
          icon={ShieldAlertIcon}
          title="The application needs to recover"
          description="A protected application boundary failed. Reload the workspace to establish a fresh session."
          actions={
            <Button onClick={reset}>
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              Reload workspace
            </Button>
          }
        />
      </body>
    </html>
  )
}
