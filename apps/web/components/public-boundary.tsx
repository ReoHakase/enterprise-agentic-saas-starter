"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@enterprise-agentic-saas/ui/components/card"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import {
  MailWarningIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useId, useRef } from "react"

import {
  ConsoleShellError,
  ConsoleShellSkeleton,
} from "@/components/console-boundary"
import {
  AuthRouteFrame,
  InvitationRouteFrame,
} from "@/components/public-route-frame"
import { useBoundaryRetry } from "@/hooks/use-boundary-retry"

export const AuthRouteLoading = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const creatingAccount = pathname === "/auth/sign-up"
  const addingAccount = searchParams.get("add_account") === "1"
  const reauthenticating = searchParams.get("reauth") === "1"
  const status =
    addingAccount || reauthenticating ? (
      <>
        {addingAccount ? <AuthStatusSkeleton /> : null}
        {reauthenticating ? <AuthStatusSkeleton /> : null}
      </>
    ) : undefined

  return (
    <AuthRouteFrame status={status}>
      <Card
        data-boundary-state="loading"
        aria-busy="true"
        aria-label="Loading authentication"
        aria-live="polite"
        role="status"
      >
        <div className="contents" aria-hidden="true">
          <CardHeader className="items-center text-center">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-10 w-full" />
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <AuthFieldSkeleton />
            <Skeleton className="h-10 w-full" />
            {!creatingAccount ? <Skeleton className="h-9 w-full" /> : null}
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="mx-auto h-4 w-48 max-w-full" />
          </CardContent>
        </div>
      </Card>
    </AuthRouteFrame>
  )
}

export const AuthRouteError = ({ reset }: { reset: () => void }) => {
  const searchParams = useSearchParams()
  const addingAccount = searchParams.get("add_account") === "1"
  const reauthenticating = searchParams.get("reauth") === "1"
  const { headingId, headingRef } = useBoundaryHeadingFocus()
  const retry = useBoundaryRetry(reset)
  const status =
    addingAccount || reauthenticating ? (
      <>
        {addingAccount ? <AuthContextStatus kind="add-account" /> : null}
        {reauthenticating ? <AuthContextStatus kind="reauth" /> : null}
      </>
    ) : undefined

  return (
    <AuthRouteFrame status={status}>
      <Card
        data-boundary-state="error"
        aria-labelledby={headingId}
        aria-live="assertive"
        role="alert"
      >
        <CardHeader className="items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <TriangleAlertIcon aria-hidden="true" />
          </span>
          <h1
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            Authentication could not be loaded
          </h1>
          <CardDescription>
            No account changes were made. Try loading the secure sign-in form
            again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={retry}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </AuthRouteFrame>
  )
}

export const InvitationRouteLoading = () => (
  <InvitationRouteFrame>
    <section
      data-slot="invitation-panel"
      data-boundary-state="loading"
      className="flex min-h-96 w-full max-w-lg flex-col gap-5 rounded-2xl border p-5 sm:p-6"
      aria-busy="true"
      aria-label="Loading organization invitation"
      aria-live="polite"
      role="status"
    >
      <div className="contents" aria-hidden="true">
        <Skeleton className="size-10 rounded-xl" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Skeleton className="h-9 w-full sm:w-20" />
          <Skeleton className="h-9 w-full sm:w-36" />
        </div>
      </div>
    </section>
  </InvitationRouteFrame>
)

export const InvitationRouteError = ({ reset }: { reset: () => void }) => {
  const { headingId, headingRef } = useBoundaryHeadingFocus()
  const retry = useBoundaryRetry(reset)

  return (
    <InvitationRouteFrame>
      <section
        data-slot="invitation-panel"
        data-boundary-state="error"
        className="flex min-h-96 w-full max-w-lg flex-col gap-5 rounded-2xl border p-5 sm:p-6"
        aria-labelledby={headingId}
        aria-live="assertive"
        role="alert"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
          <MailWarningIcon aria-hidden="true" />
        </span>
        <div>
          <h1
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            Invitation could not be loaded
          </h1>
          <p className="text-sm text-muted-foreground">
            Your membership was not changed. Try loading this invitation again.
          </p>
        </div>
        <Button className="mt-auto self-stretch sm:self-end" onClick={retry}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      </section>
    </InvitationRouteFrame>
  )
}

export const RootRouteLoading = () => {
  const pathname = usePathname()

  if (isConsolePath(pathname)) {
    return <ConsoleShellSkeleton />
  }

  if (pathname.startsWith("/auth/")) {
    return <AuthRouteLoading />
  }

  if (pathname.startsWith("/invitations/")) {
    return <InvitationRouteLoading />
  }

  return <StandaloneRouteLoading />
}

export const RootRouteError = ({ reset }: { reset: () => void }) => {
  const pathname = usePathname()

  if (isConsolePath(pathname)) {
    return <ConsoleShellError reset={reset} />
  }

  if (pathname.startsWith("/auth/")) {
    return <AuthRouteError reset={reset} />
  }

  if (pathname.startsWith("/invitations/")) {
    return <InvitationRouteError reset={reset} />
  }

  return <StandaloneRouteError reset={reset} />
}

export const StandaloneRouteError = ({ reset }: { reset: () => void }) => {
  const { headingId, headingRef } = useBoundaryHeadingFocus()
  const retry = useBoundaryRetry(reset)

  return (
    <main
      data-slot="standalone-error"
      data-boundary-state="error"
      className="flex min-h-svh items-center justify-center p-6"
      aria-labelledby={headingId}
      aria-live="assertive"
      role="alert"
    >
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <ShieldAlertIcon aria-hidden="true" />
          </span>
          <h1
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            The application could not be loaded
          </h1>
          <CardDescription>
            Reload the application to establish a fresh, secure session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={retry}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            Reload application
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

const StandaloneRouteLoading = () => (
  <main
    className="flex min-h-svh items-center justify-center p-6"
    aria-busy="true"
    aria-label="Loading application"
    aria-live="polite"
    role="status"
  >
    <div className="flex w-full max-w-md flex-col gap-5" aria-hidden="true">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  </main>
)

const AuthFieldSkeleton = () => (
  <div className="flex flex-col gap-2">
    <Skeleton className="h-4 w-20" />
    <Skeleton className="h-10 w-full" />
  </div>
)

const AuthStatusSkeleton = () => (
  <div
    data-slot="auth-context-status"
    className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
    aria-hidden="true"
  >
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
    <Skeleton className="h-5 w-24" />
  </div>
)

const AuthContextStatus = ({ kind }: { kind: "add-account" | "reauth" }) => (
  <div
    data-slot="auth-context-status"
    className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
    role={kind === "reauth" ? "status" : undefined}
  >
    <span className="min-w-0">
      {kind === "add-account"
        ? "Sign in with another account. Your current account stays on this device."
        : "Sign in again to confirm this security-sensitive change."}
    </span>
    <Badge variant="secondary">
      {kind === "add-account" ? "Add account" : "Security check"}
    </Badge>
  </div>
)

const useBoundaryHeadingFocus = () => {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  return { headingId, headingRef }
}

const isConsolePath = (pathname: string) =>
  pathname === "/dashboard" ||
  pathname.startsWith("/dashboard/") ||
  pathname === "/onboarding" ||
  pathname.startsWith("/settings/") ||
  pathname.startsWith("/organization/")
