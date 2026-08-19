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
import { KeyRoundIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { LocalDate } from "@/components/local-date/local-date"
import {
  consoleKeys,
  getConsoleApiErrorText,
  showConsoleApiErrorToast,
} from "@/features/console"
import {
  OrganizationIdentity,
  OrganizationRoleBadge,
} from "@/features/organizations"
import { getBrowserConsoleApi } from "@/lib/browser/console-api"

import { mcpOAuthSessionsQueryOptions } from "../../queries"
import { parseMcpOAuthScopes } from "../../query"
import type { McpOAuthCredential } from "../../schema"
import { McpOAuthScopeMatrix } from "../mcp-oauth-scope-matrix/mcp-oauth-scope-matrix"

export const McpOAuthSessionsPanel = () => {
  const queryClient = useQueryClient()
  const {
    data: sessions,
    error: sessionsError,
    isError: sessionsErrorState,
    isPending: sessionsPending,
    refetch: refetchSessions,
  } = useQuery(mcpOAuthSessionsQueryOptions())
  const [revokeTarget, setRevokeTarget] = useState<
    McpOAuthCredential | undefined
  >()
  const { isPending: revokePending, mutate: revoke } = useMutation({
    mutationFn: (target: McpOAuthCredential) =>
      getBrowserConsoleApi().revokeMcpOAuthSession(target.credentialId),
    onSuccess: async () => {
      setRevokeTarget(undefined)
      await queryClient.invalidateQueries({
        queryKey: consoleKeys.mcpOAuthSessions(),
      })
      toast.success("MCP access revoked")
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "MCP access was not revoked.")
    },
  })
  const retrySessions = useCallback(() => {
    void refetchSessions()
  }, [refetchSessions])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setRevokeTarget(undefined)
  }, [])
  const confirmRevocation = useCallback(() => {
    if (revokeTarget) revoke(revokeTarget)
  }, [revoke, revokeTarget])

  return (
    <section
      className="flex w-full max-w-full min-w-0 flex-col gap-5 overflow-hidden rounded-2xl border p-4 sm:p-5"
      aria-labelledby="mcp-oauth-sessions-heading"
    >
      <div>
        <h2 id="mcp-oauth-sessions-heading" className="font-medium">
          MCP OAuth access
        </h2>
        <p className="text-sm text-muted-foreground">
          Review the organizations and permissions granted to MCP clients. You
          can revoke any active credential family here.
        </p>
      </div>

      {sessionsPending ? <McpOAuthSessionsSkeleton /> : null}
      {sessionsErrorState ? (
        <Empty className="border" role="alert">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlertIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>MCP access could not be loaded</EmptyTitle>
            <EmptyDescription>
              {getConsoleApiErrorText(sessionsError, "Try the request again.")}
            </EmptyDescription>
            <Button variant="outline" onClick={retrySessions}>
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              Try again
            </Button>
          </EmptyHeader>
        </Empty>
      ) : null}
      {sessions?.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRoundIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No MCP access grants</EmptyTitle>
            <EmptyDescription>
              Authorized MCP clients will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {sessions?.map((session) => (
        <McpOAuthCredentialCard
          key={session.credentialId}
          credential={session}
          pending={revokePending}
          onRevoke={setRevokeTarget}
        />
      ))}

      <AlertDialog open={revokeTarget !== undefined} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke MCP access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget
                ? `The client ${revokeTarget.clientName} will need to authorize again.`
                : "This client will need to authorize again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokePending || !revokeTarget}
              onClick={confirmRevocation}
            >
              {revokePending ? <Spinner data-icon="inline-start" /> : null}
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

const McpOAuthCredentialCard = ({
  credential,
  onRevoke,
  pending,
}: {
  credential: McpOAuthCredential
  onRevoke: (credential: McpOAuthCredential) => void
  pending: boolean
}) => {
  const scopeSummaries = useMemo(
    () => parseMcpOAuthScopes(credential.scopes.join(" ")) ?? [],
    [credential.scopes]
  )
  const requestRevoke = useCallback(
    () => onRevoke(credential),
    [credential, onRevoke]
  )

  return (
    <article className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium wrap-break-word">
              {credential.clientName}
            </h3>
            {credential.refreshable ? (
              <Badge variant="secondary">Refresh access</Badge>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {credential.organization ? (
              <>
                <OrganizationIdentity organization={credential.organization} />
                <OrganizationRoleBadge role={credential.organization.role} />
              </>
            ) : (
              <span className="text-muted-foreground">
                Organization membership no longer available
              </span>
            )}
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={requestRevoke}
        >
          Revoke
        </Button>
      </div>

      <McpOAuthScopeMatrix
        readOnly
        requestedScopes={scopeSummaries}
        selectedScopes={credential.scopes}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {credential.createdAt ? (
          <span>
            Authorized <LocalDate includeTime value={credential.createdAt} />
          </span>
        ) : null}
        {credential.expiresAt ? (
          <span>
            Expires <LocalDate includeTime value={credential.expiresAt} />
          </span>
        ) : null}
      </div>
    </article>
  )
}

const McpOAuthSessionsSkeleton = () => (
  <div role="status" aria-label="Loading MCP access" className="space-y-2">
    <Skeleton className="h-48 w-full rounded-xl" />
    <Skeleton className="h-48 w-full rounded-xl" />
  </div>
)
