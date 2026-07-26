"use client"

import {
  Card,
  CardContent,
  CardHeader,
} from "@enterprise-agentic-saas/ui/components/card"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import { usePathname, useSearchParams } from "next/navigation"

import {
  AuthRouteFrame,
  InvitationRouteFrame,
} from "@/components/public-route-frame/public-route-frame"
import { ConsoleShellSkeleton } from "@/features/console"

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

export const InvitationRouteLoading = () => (
  <InvitationRouteFrame>
    <section
      data-slot="invitation-panel"
      data-route-boundary="true"
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

const isConsolePath = (pathname: string) =>
  pathname === "/dashboard" ||
  pathname.startsWith("/dashboard/") ||
  pathname === "/onboarding" ||
  pathname.startsWith("/settings/") ||
  pathname.startsWith("/organization/")
