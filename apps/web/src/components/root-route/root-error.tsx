import type { ErrorComponentProps } from "@tanstack/react-router"
import { useEffect } from "react"

import { RootRouteError } from "@/components/public-route-error-boundary/public-route-error-boundary"
import { reportObservedError } from "@/lib/report-observed-error"

export const RootError = ({ error, reset }: ErrorComponentProps) => {
  useEffect(() => {
    reportObservedError(error)
  }, [error])

  return <RootRouteError reset={reset} />
}
