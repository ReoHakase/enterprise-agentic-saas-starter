"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

import { ConsoleContentError } from "@/components/console-boundary"

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

  return <ConsoleContentError reset={reset} />
}
