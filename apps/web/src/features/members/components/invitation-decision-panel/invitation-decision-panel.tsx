"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  CircleUserRoundIcon,
  MailCheckIcon,
  MailWarningIcon,
  RefreshCwIcon,
  UserPlusIcon,
} from "lucide-react"
import { useCallback, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { LinkButton } from "@/components/link-button/link-button"
import { LocalDate } from "@/components/local-date/local-date"
import { UserIdentity } from "@/components/user-identity/user-identity"
import { AccountSwitcherDialog } from "@/features/account"
import { createInvitationPath } from "@/features/auth"
import { consoleKeys } from "@/features/console"
import { roleLabel } from "@/features/organizations"
import { useIsHydrated } from "@/hooks/use-is-hydrated"
import { clientEnv } from "@/lib/env"

import {
  decideInvitation,
  isInvitationAuthenticationError,
  invitationFallbacks,
  type InvitationContext,
} from "../../api"

type InvitationUser = {
  id: string
  name: string
  email: string
  profileImage: string | null
}

type InvitationCurrentUserProps = {
  currentUserEmail: string
  currentUserId: string
  currentUserProfileImage: string | null
  currentUserName: string
}

type InvitationDecisionPanelProps =
  | {
      invitationId: string
      state: "signed_out"
    }
  | (InvitationCurrentUserProps & {
      invitationId: string
      state: "recipient_mismatch"
    })
  | (InvitationCurrentUserProps & {
      invitationId: string
      state: "load_error"
    })
  | (InvitationCurrentUserProps & {
      invitationId: string
      state: "unavailable"
    })
  | (InvitationCurrentUserProps & {
      invitation: InvitationContext
      invitationId: string
      state: "ready"
    })

const authHref = ({
  addAccount = false,
  invitationId,
  view,
}: {
  addAccount?: boolean
  invitationId: string
  view: "sign-in" | "sign-up"
}) => {
  const query = new URLSearchParams({
    redirectTo: createInvitationPath(invitationId),
  })
  if (addAccount) query.set("add_account", "1")
  return `/auth/${view}?${query.toString()}`
}

const panelClassName =
  "flex min-h-96 w-full max-w-lg flex-col gap-5 rounded-2xl border p-5 sm:p-6"

export const InvitationDecisionPanel = (
  props: InvitationDecisionPanelProps
) => {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const isHydrated = useIsHydrated()
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false)
  const authenticatedProps = props.state === "signed_out" ? undefined : props
  const currentUserEmail = authenticatedProps?.currentUserEmail
  const currentUserId = authenticatedProps?.currentUserId
  const currentUserProfileImage = authenticatedProps?.currentUserProfileImage
  const currentUserName = authenticatedProps?.currentUserName
  const currentUser = useMemo<InvitationUser | undefined>(
    () =>
      currentUserEmail && currentUserId && currentUserName
        ? {
            email: currentUserEmail,
            id: currentUserId,
            profileImage: currentUserProfileImage ?? null,
            name: currentUserName,
          }
        : undefined,
    [currentUserEmail, currentUserId, currentUserName, currentUserProfileImage]
  )
  const mutation = useMutation({
    mutationFn: (action: "accept" | "reject") =>
      decideInvitation({
        action,
        apiBaseUrl: clientEnv.VITE_API_BASE_URL,
        invitationId: props.invitationId,
      }),
    onSuccess: (_, action) => {
      // The destination route fetches fresh loader data. Do not let a refetch of
      // the outgoing invitation page race the route replacement.
      void queryClient.invalidateQueries({ queryKey: consoleKeys.all })
      toast.success(
        action === "accept" ? "Invitation accepted" : "Invitation rejected"
      )
      void navigate({
        replace: true,
        to: action === "accept" ? "/dashboard" : "/settings/organizations",
      })
    },
  })
  const { isPending, mutate } = mutation
  const rejectInvitation = useCallback(() => mutate("reject"), [mutate])
  const acceptInvitation = useCallback(() => mutate("accept"), [mutate])
  const openAccountSwitcher = useCallback(
    () => setAccountSwitcherOpen(true),
    []
  )
  const retryInvitation = useCallback(() => {
    void router.invalidate()
  }, [router])
  const sessionExpired =
    mutation.isError && isInvitationAuthenticationError(mutation.error)

  if (props.state === "signed_out" || sessionExpired) {
    return (
      <section data-slot="invitation-panel" className={panelClassName}>
        <InvitationIcon icon="invitation" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">
            {sessionExpired ? "Sign in to continue" : "You're invited"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sessionExpired
              ? "Your session expired. Sign in with the invited account to continue."
              : "Create an account with the email address that received this invitation, or sign in if you already have one."}
          </p>
        </div>
        <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <LinkButton
            variant="outline"
            href={authHref({
              invitationId: props.invitationId,
              view: "sign-in",
            })}
          >
            Sign in
          </LinkButton>
          <LinkButton
            href={authHref({
              invitationId: props.invitationId,
              view: "sign-up",
            })}
          >
            <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
            Create account
          </LinkButton>
        </div>
      </section>
    )
  }

  if (!currentUser) return null

  if (props.state === "recipient_mismatch") {
    const addAccountHref = authHref({
      addAccount: true,
      invitationId: props.invitationId,
      view: "sign-in",
    })

    return (
      <>
        <section data-slot="invitation-panel" className={panelClassName}>
          <InvitationIcon icon="account" />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">Use the invited account</h1>
            <p className="text-sm text-muted-foreground">
              This invitation belongs to a different email address. Switch to
              the account that received it, or add that account to this device.
            </p>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Currently active
            </p>
            <UserIdentity user={currentUser} />
          </div>
          <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <LinkButton variant="outline" href={addAccountHref}>
              <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
              Add account
            </LinkButton>
            <Button onClick={openAccountSwitcher}>Switch account</Button>
          </div>
        </section>
        <AccountSwitcherDialog
          addAccountHref={addAccountHref}
          currentUser={currentUser}
          open={accountSwitcherOpen}
          onOpenChange={setAccountSwitcherOpen}
          returnTo={createInvitationPath(props.invitationId)}
        />
      </>
    )
  }

  if (props.state === "unavailable") {
    return (
      <section data-slot="invitation-panel" className={panelClassName}>
        <InvitationIcon icon="warning" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Invitation unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This invitation may have expired, been canceled, or already been
            used. Ask an organization administrator to send a new invitation.
          </p>
        </div>
        <div className="mt-auto flex justify-end">
          <LinkButton variant="outline" href="/settings/organizations">
            View organizations
          </LinkButton>
        </div>
      </section>
    )
  }

  if (props.state === "load_error") {
    return (
      <section data-slot="invitation-panel" className={panelClassName}>
        <InvitationIcon icon="warning" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">
            Invitation could not be loaded
          </h1>
          <p className="text-sm text-muted-foreground">
            Try again. If the problem continues, ask the inviter to resend the
            link.
          </p>
        </div>
        <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <LinkButton variant="outline" href="/settings/organizations">
            View organizations
          </LinkButton>
          <Button onClick={retryInvitation}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            Try again
          </Button>
        </div>
      </section>
    )
  }

  const mutationError = mutation.isError
    ? invitationFallbacks[mutation.variables ?? "accept"]
    : undefined

  return (
    <section
      data-slot="invitation-panel"
      data-route-boundary="true"
      data-boundary-state="ready"
      className={panelClassName}
    >
      <InvitationIcon icon="invitation" />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">
            Join {props.invitation.organizationName}
          </h1>
          <Badge variant="secondary">{roleLabel(props.invitation.role)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {props.invitation.inviterEmail} invited {currentUser.email} to this
          organization.
        </p>
      </div>
      <dl className="grid gap-3 rounded-xl border bg-muted/40 p-4 text-sm sm:grid-cols-2">
        <InvitationDetail label="Account" value={currentUser.email} />
        <InvitationDetail
          dateTimeValue={props.invitation.expiresAt}
          label="Expires"
        />
      </dl>
      {mutationError ? (
        <p className="text-sm text-destructive" role="alert">
          {mutationError}
        </p>
      ) : null}
      <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={!isHydrated || isPending}
          onClick={rejectInvitation}
        >
          Reject
        </Button>
        <Button disabled={!isHydrated || isPending} onClick={acceptInvitation}>
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          Accept invitation
        </Button>
      </div>
    </section>
  )
}

const InvitationIcon = ({
  icon,
}: {
  icon: "account" | "invitation" | "warning"
}) => {
  const Icon =
    icon === "account"
      ? CircleUserRoundIcon
      : icon === "warning"
        ? MailWarningIcon
        : MailCheckIcon
  return (
    <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Icon aria-hidden="true" />
    </span>
  )
}

const InvitationDetail = ({
  dateTimeValue,
  label,
  value,
}: {
  dateTimeValue?: string
  label: string
  value?: ReactNode
}) => (
  <div className="min-w-0">
    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd
      className="truncate font-medium"
      title={typeof value === "string" ? value : undefined}
    >
      {dateTimeValue ? <LocalDate includeTime value={dateTimeValue} /> : value}
    </dd>
  </div>
)
