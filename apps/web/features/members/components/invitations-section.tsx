"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
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
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { MailPlusIcon, RefreshCwIcon } from "lucide-react"
import { useCallback } from "react"

import type { OrganizationInvitation } from "@/features/members/schema"
import { roleLabel } from "@/features/organizations/schema"

export const InvitationsSection = ({
  invitations,
  pending,
  error,
  canCancel,
  mutationPending,
  onCancel,
  onRetry,
}: {
  invitations: OrganizationInvitation[]
  pending: boolean
  error?: string
  canCancel: boolean
  mutationPending: boolean
  onCancel: (invitationId: string) => void
  onRetry?: () => void
}) => {
  if (pending) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner /> Loading invitations
      </div>
    )
  }

  if (error) {
    return (
      <Empty className="border" role="alert">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailPlusIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Invitations could not be loaded</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
          {onRetry ? (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              Try again
            </Button>
          ) : null}
        </EmptyHeader>
      </Empty>
    )
  }

  if (invitations.length === 0) {
    return null
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="invitation-list-heading"
    >
      <div>
        <h2 id="invitation-list-heading" className="font-medium">
          Invitations
        </h2>
        <p className="text-sm text-muted-foreground">
          Access requests that have not yet been accepted.
        </p>
      </div>
      <div className="divide-y rounded-2xl border">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{invitation.email}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {roleLabel(invitation.role)}
                </span>
                <Badge variant="outline" className="capitalize">
                  {invitation.status}
                </Badge>
              </div>
            </div>
            {canCancel && invitation.status === "pending" ? (
              <CancelInvitationButton
                invitation={invitation}
                disabled={mutationPending}
                onCancel={onCancel}
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

const CancelInvitationButton = ({
  invitation,
  disabled,
  onCancel,
}: {
  invitation: OrganizationInvitation
  disabled: boolean
  onCancel: (invitationId: string) => void
}) => {
  const cancelInvitation = useCallback(
    () => onCancel(invitation.id),
    [invitation.id, onCancel]
  )

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            size="sm"
            disabled={disabled}
          />
        }
      >
        Cancel
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <MailPlusIcon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>Cancel this invitation?</AlertDialogTitle>
          <AlertDialogDescription>
            {invitation.email} will no longer be able to join with this
            invitation.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep invitation</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={cancelInvitation}>
            Cancel invitation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
