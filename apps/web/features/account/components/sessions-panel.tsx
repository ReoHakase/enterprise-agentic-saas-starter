"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LaptopIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import type { UserSession } from "@/features/account/schema"
import { consoleKeys, sessionsQueryOptions } from "@/features/console/queries"
import { browserConsoleApi } from "@/lib/browser/console-api"

export const SessionsPanel = () => {
  const queryClient = useQueryClient()
  const sessionsQuery = useQuery(sessionsQueryOptions())
  const [revokeTarget, setRevokeTarget] = useState<
    UserSession | "others" | undefined
  >()
  const revokeMutation = useMutation<unknown, Error, UserSession | "others">({
    mutationFn: (target: UserSession | "others") =>
      target === "others"
        ? browserConsoleApi.revokeOtherSessions()
        : browserConsoleApi.revokeSession(target.id),
    onSuccess: async (_, target) => {
      setRevokeTarget(undefined)
      await queryClient.invalidateQueries({ queryKey: consoleKeys.sessions() })
      toast.success(
        target === "others" ? "Other sessions revoked" : "Session revoked"
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "The session was not revoked."
      )
    },
  })
  const { isPending: revokePending, mutate: revoke } = revokeMutation
  const { refetch: refetchSessions } = sessionsQuery
  const requestOtherSessionRevocation = useCallback(
    () => setRevokeTarget("others"),
    []
  )
  const retrySessions = useCallback(() => {
    void refetchSessions()
  }, [refetchSessions])
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setRevokeTarget(undefined)
    }
  }, [])
  const confirmRevocation = useCallback(() => {
    if (revokeTarget) {
      revoke(revokeTarget)
    }
  }, [revoke, revokeTarget])

  return (
    <section
      className="flex flex-col gap-5 rounded-2xl border p-4 sm:p-5"
      aria-labelledby="sessions-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="sessions-heading" className="font-medium">
            Signed-in devices
          </h2>
          <p className="text-sm text-muted-foreground">
            Revoke sessions you no longer recognize. Your current session stays
            available.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={
            sessionsQuery.isPending ||
            revokePending ||
            !sessionsQuery.data?.some((session) => !session.current)
          }
          onClick={requestOtherSessionRevocation}
        >
          Revoke other sessions
        </Button>
      </div>

      {sessionsQuery.isPending ? <SessionsSkeleton /> : null}
      {sessionsQuery.isError ? (
        <Empty className="border" role="alert">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlertIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Sessions could not be loaded</EmptyTitle>
            <EmptyDescription>
              {sessionsQuery.error instanceof Error
                ? sessionsQuery.error.message
                : "Try the request again."}
            </EmptyDescription>
            <Button variant="outline" onClick={retrySessions}>
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              Try again
            </Button>
          </EmptyHeader>
        </Empty>
      ) : null}
      {sessionsQuery.data?.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LaptopIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No active sessions</EmptyTitle>
            <EmptyDescription>
              Active browser sessions will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {sessionsQuery.data && sessionsQuery.data.length > 0 ? (
        <div className="divide-y rounded-xl border">
          {sessionsQuery.data.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              pending={revokePending}
              onRevoke={setRevokeTarget}
            />
          ))}
        </div>
      ) : null}

      <AlertDialog
        open={revokeTarget !== undefined}
        onOpenChange={handleDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revokeTarget === "others"
                ? "Revoke every other session?"
                : "Revoke this session?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget === "others"
                ? "Every other device will need to sign in again."
                : "This device will need to sign in again. This cannot be undone from the current page."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokePending || revokeTarget === undefined}
              onClick={confirmRevocation}
            >
              {revokePending ? <Spinner data-icon="inline-start" /> : null}
              Revoke session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

const SessionRow = ({
  session,
  pending,
  onRevoke,
}: {
  session: UserSession
  pending: boolean
  onRevoke: (session: UserSession) => void
}) => {
  const device = describeUserAgent(session.userAgent)
  const requestRevocation = useCallback(
    () => onRevoke(session),
    [onRevoke, session]
  )
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <LaptopIcon aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{device.friendly}</p>
          {session.current ? <Badge variant="secondary">Current</Badge> : null}
        </div>
        <p
          className="truncate text-xs text-muted-foreground"
          title={device.raw}
        >
          Updated {new Date(session.updatedAt).toLocaleString()} · Expires{" "}
          {new Date(session.expiresAt).toLocaleString()}
        </p>
      </div>
      {!session.current ? (
        <Button
          className="self-start sm:self-auto"
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={requestRevocation}
        >
          Revoke
        </Button>
      ) : null}
    </div>
  )
}

const SessionsSkeleton = () => (
  <div className="flex flex-col gap-2" aria-label="Loading sessions">
    <Skeleton className="h-20 w-full rounded-xl" />
    <Skeleton className="h-20 w-full rounded-xl" />
  </div>
)

const describeUserAgent = (userAgent: string | null) => {
  if (!userAgent) {
    return { friendly: "Unknown device", raw: "No user agent recorded" }
  }
  const device = /iPhone/i.test(userAgent)
    ? "iPhone"
    : /iPad/i.test(userAgent)
      ? "iPad"
      : /Macintosh|Mac OS X/i.test(userAgent)
        ? "Mac"
        : /Windows NT/i.test(userAgent)
          ? "Windows PC"
          : /Android/i.test(userAgent)
            ? "Android device"
            : /Linux/i.test(userAgent)
              ? "Linux device"
              : "Unknown device"
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Chrome\//i.test(userAgent)
      ? "Chrome"
      : /Firefox\//i.test(userAgent)
        ? "Firefox"
        : /Safari/i.test(userAgent)
          ? "Safari"
          : "Unknown browser"
  return { friendly: `${device} (${browser})`, raw: userAgent }
}
