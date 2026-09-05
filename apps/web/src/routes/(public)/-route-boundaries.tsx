import type { ErrorComponentProps } from "@tanstack/react-router"
import { useEffect } from "react"

import {
  AuthRouteError as AuthRouteErrorView,
  InvitationRouteError as InvitationRouteErrorView,
} from "@/components/public-route-error-boundary/public-route-error-boundary"
import { AuthRouteLoading } from "@/components/public-route-suspense/public-route-suspense"
import { reportObservedError } from "@/lib/report-observed-error"

export const AuthRouteError = ({ error, reset }: ErrorComponentProps) => {
  useEffect(() => {
    reportObservedError(error)
  }, [error])

  return <AuthRouteErrorView reset={reset} />
}

export const InvitationRouteError = ({ error, reset }: ErrorComponentProps) => {
  useEffect(() => {
    reportObservedError(error)
  }, [error])

  return <InvitationRouteErrorView reset={reset} />
}

export const OAuthRouteLoading = () => <AuthRouteLoading frameSize="oauth" />
