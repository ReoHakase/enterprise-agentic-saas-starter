import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@enterprise-agentic-saas/ui/components/card"
import { useLocation } from "@tanstack/react-router"
import {
  MailWarningIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useEffect, useId, useRef } from "react"

import {
  AuthRouteFrame,
  InvitationRouteFrame,
} from "@/components/public-route-frame/public-route-frame"
import { ConsoleShellError } from "@/features/console"
import { useBoundaryRetry } from "@/hooks/use-boundary-retry"

export const AuthRouteError = ({ reset }: { reset: () => void }) => {
  const searchParams = new URLSearchParams(
    useLocation({ select: (location) => location.searchStr })
  )
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

export const InvitationRouteError = ({ reset }: { reset: () => void }) => {
  const { headingId, headingRef } = useBoundaryHeadingFocus()
  const retry = useBoundaryRetry(reset)

  return (
    <InvitationRouteFrame>
      <section
        data-slot="invitation-panel"
        data-route-boundary="true"
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

export const RootRouteError = ({ reset }: { reset: () => void }) => {
  const pathname = useLocation({ select: (location) => location.pathname })

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

const StandaloneRouteError = ({ reset }: { reset: () => void }) => {
  const { headingId, headingRef } = useBoundaryHeadingFocus()
  const retry = useBoundaryRetry(reset)

  return (
    <main
      data-slot="standalone-error"
      data-boundary-state="error"
      className="flex min-h-svh items-center justify-center p-6"
    >
      <Card
        className="w-full max-w-lg"
        aria-labelledby={headingId}
        aria-live="assertive"
        role="alert"
      >
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
