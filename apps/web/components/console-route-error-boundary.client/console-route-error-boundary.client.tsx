"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef } from "react"

import { AppState } from "@/components/app-state/app-state"
import { getConsoleErrorPresentation } from "@/components/console-route-presentations/console-route-presentations"
import { ConsoleBoundaryShell } from "@/components/console-route-suspense/console-route-suspense"
import {
  PageHeader,
  PageHeaderCopy,
  PageHeaderDescription,
} from "@/components/page-shell/page-shell"
import { useBoundaryRetry } from "@/hooks/use-boundary-retry"

export const ConsoleShellError = ({ reset }: { reset: () => void }) => (
  <ConsoleBoundaryShell state="error">
    <ConsoleContentError reset={reset} />
  </ConsoleBoundaryShell>
)

export const ConsoleContentError = ({ reset }: { reset: () => void }) => {
  const pathname = usePathname()
  const presentation = getConsoleErrorPresentation(pathname)
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const retry = useBoundaryRetry(reset)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <section
      data-slot="page-shell"
      data-route-boundary="true"
      data-boundary-state="error"
      className="flex w-full max-w-full min-w-0 flex-col gap-6 xl:max-w-7xl"
      aria-labelledby={headingId}
      aria-live="assertive"
      role="alert"
    >
      <PageHeader>
        <PageHeaderCopy>
          <h1
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-normal outline-none"
          >
            {presentation.title}
          </h1>
          <PageHeaderDescription>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {presentation.description}
            </p>
          </PageHeaderDescription>
        </PageHeaderCopy>
        {presentation.showAction ? (
          <BoundaryRetryButton onRetry={retry} />
        ) : null}
      </PageHeader>
      <div data-slot="page-body">
        <AppState
          className="min-h-[min(32rem,60svh)] p-0"
          icon={TriangleAlertIcon}
          title="The workspace is temporarily unavailable"
          description="Try the request again. If the problem continues, wait a moment before retrying."
        >
          {presentation.showAction ? null : (
            <BoundaryRetryButton onRetry={retry} />
          )}
        </AppState>
      </div>
    </section>
  )
}

const BoundaryRetryButton = ({ onRetry }: { onRetry: () => void }) => (
  <Button onClick={onRetry}>
    <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
    Try again
  </Button>
)
