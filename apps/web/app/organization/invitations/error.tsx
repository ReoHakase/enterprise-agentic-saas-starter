"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

import { InvitationRouteError } from "@/components/public-boundary"

export default function InvitationError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return <InvitationRouteError reset={reset} />
}
