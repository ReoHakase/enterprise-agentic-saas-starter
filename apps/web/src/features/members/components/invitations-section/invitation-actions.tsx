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
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { MailPlusIcon, RefreshCwIcon } from "lucide-react"
import { createContext, useCallback, useContext, type MouseEvent } from "react"

import type { OrganizationInvitation } from "../../schema"

const cancelInvitationTrigger = (
  <Button variant="ghost" size="xs">
    Cancel
  </Button>
)

export type InvitationMutationState = {
  busyInvitationId?: string
  pending: boolean
}

export const InvitationMutationContext = createContext<InvitationMutationState>(
  {
    pending: false,
  }
)

export const InvitationActions = ({
  invitation,
  activeInvitationExists,
  canCancel,
  canResend,
  canResendAdmins,
  onCancel,
  onResend,
}: {
  invitation: OrganizationInvitation
  activeInvitationExists: boolean
  canCancel: boolean
  canResend: boolean
  canResendAdmins: boolean
  onCancel: (invitationId: string) => void
  onResend: (invitation: OrganizationInvitation) => void
}) => {
  const mutation = useContext(InvitationMutationContext)
  const blocked = mutation.pending
  const busy = mutation.busyInvitationId === invitation.id
  const resendable =
    (invitation.status === "pending" || invitation.status === "expired") &&
    !activeInvitationExists &&
    canResend &&
    (invitation.role !== "admin" || canResendAdmins)
  const cancelable = canCancel && invitation.status === "pending"
  const resend = useCallback(() => {
    if (!blocked && resendable) onResend(invitation)
  }, [blocked, invitation, onResend, resendable])
  const cancel = useCallback(() => {
    if (!blocked && cancelable) onCancel(invitation.id)
  }, [blocked, cancelable, invitation.id, onCancel])
  const preventBlockedTrigger = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!blocked) return
      event.preventDefault()
      event.stopPropagation()
    },
    [blocked]
  )

  if (!resendable && !cancelable) {
    return activeInvitationExists && canResend ? (
      <span className="text-xs text-muted-foreground">
        Active invitation exists
      </span>
    ) : null
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {resendable ? (
        <Button
          variant="outline"
          size="xs"
          aria-disabled={blocked || undefined}
          aria-busy={busy}
          onClick={resend}
        >
          {busy ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {invitation.status === "expired" ? "Renew & resend" : "Resend"}
        </Button>
      ) : null}
      {cancelable ? (
        <AlertDialog>
          <AlertDialogTrigger
            render={cancelInvitationTrigger}
            aria-disabled={blocked || undefined}
            onClick={preventBlockedTrigger}
          />
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
              <AlertDialogAction variant="destructive" onClick={cancel}>
                Cancel invitation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
