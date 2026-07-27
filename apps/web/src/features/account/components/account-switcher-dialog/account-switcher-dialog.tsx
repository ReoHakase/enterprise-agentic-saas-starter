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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@enterprise-agentic-saas/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { CircleUserRoundIcon, LogOutIcon, PlusIcon } from "lucide-react"
import { useCallback } from "react"

import { LinkButton } from "@/components/link-button/link-button"
import { UserProfileImage } from "@/components/user-identity/user-identity"
import type { OrganizationSwitchRisks } from "@/features/agent"

import { useDeviceAccountsController } from "../../hooks/use-device-accounts-controller"
import type { DeviceAccount, Me } from "../../schema"

type AccountSwitcherDialogProps = {
  addAccountHref?: string
  currentUser: Me["user"]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPrepareAgentSwitch?: () => OrganizationSwitchRisks
  onAbortAgentSwitch?: () => void
  onCancelAgentSwitch?: () => void
  onCompleteAgentSwitch?: () => Promise<void>
  returnTo?: string
}

export const AccountSwitcherDialog = ({
  addAccountHref = "/auth/sign-in?add_account=1",
  currentUser,
  open,
  onOpenChange,
  onPrepareAgentSwitch,
  onAbortAgentSwitch,
  onCancelAgentSwitch,
  onCompleteAgentSwitch,
  returnTo = "/dashboard",
}: AccountSwitcherDialogProps) => {
  const controller = useDeviceAccountsController({
    currentUser,
    enabled: open,
    onPrepareIdentityChange: onPrepareAgentSwitch,
    onAbortIdentityChange: onAbortAgentSwitch,
    onCancelIdentityChange: onCancelAgentSwitch,
    onCompleteIdentityChange: async () => {
      await onCompleteAgentSwitch?.()
      onOpenChange(false)
    },
    returnTo,
  })
  const {
    accounts,
    accountsQuery,
    actionMutation,
    confirmRemove,
    confirmRiskAction,
    handleRemoveDialogOpenChange,
    handleRiskDialogOpenChange,
    pendingToken,
    removeTarget,
    requestRemove,
    requestSwitch,
    retryAccounts,
    riskAction,
  } = controller
  const switchTarget =
    riskAction?.kind === "switch" ? riskAction.account : undefined

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Switch account</DialogTitle>
            <DialogDescription>
              Move between signed-in accounts on this device without mixing
              organization data.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {accountsQuery.isPending ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Spinner />
                Loading accounts
              </div>
            ) : null}

            {accountsQuery.isError ? (
              <Empty role="alert">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleUserRoundIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Accounts could not be loaded</EmptyTitle>
                  <EmptyDescription>
                    Try the request again. Your signed-in accounts were not
                    changed.
                  </EmptyDescription>
                  <Button variant="outline" onClick={retryAccounts}>
                    Try again
                  </Button>
                </EmptyHeader>
              </Empty>
            ) : null}

            {!accountsQuery.isPending &&
            !accountsQuery.isError &&
            accounts.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleUserRoundIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No additional accounts</EmptyTitle>
                  <EmptyDescription>
                    Add another account to switch without signing out.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}

            {!accountsQuery.isPending && !accountsQuery.isError
              ? accounts.map((account) => (
                  <DeviceAccountRow
                    key={account.session.token}
                    account={account}
                    current={account.user.id === currentUser.id}
                    pending={pendingToken === account.session.token}
                    mutationsPending={actionMutation.isPending}
                    onSwitch={requestSwitch}
                    onRequestRevoke={requestRemove}
                  />
                ))
              : null}
          </div>

          <DialogFooter>
            <LinkButton href={addAccountHref} variant="outline">
              <PlusIcon data-icon="inline-start" />
              Add account
            </LinkButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountSwitchDialogs
        confirmAccountSwitch={confirmRiskAction}
        handleRevokeDialogOpenChange={handleRemoveDialogOpenChange}
        handleSwitchDialogOpenChange={handleRiskDialogOpenChange}
        revokeAccount={confirmRemove}
        revokePending={actionMutation.isPending}
        revokeTarget={removeTarget}
        switchTarget={switchTarget}
      />
    </>
  )
}

const AccountSwitchDialogs = ({
  confirmAccountSwitch,
  handleRevokeDialogOpenChange,
  handleSwitchDialogOpenChange,
  revokeAccount,
  revokePending,
  revokeTarget,
  switchTarget,
}: {
  confirmAccountSwitch: () => void
  handleRevokeDialogOpenChange: (open: boolean) => void
  handleSwitchDialogOpenChange: (open: boolean) => void
  revokeAccount: () => void
  revokePending: boolean
  revokeTarget?: DeviceAccount
  switchTarget?: DeviceAccount
}) => (
  <>
    <AlertDialog
      open={revokeTarget !== undefined}
      onOpenChange={handleRevokeDialogOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove account from this device?</AlertDialogTitle>
          <AlertDialogDescription>
            {revokeTarget?.user.email} will be signed out on this device. The
            account and its organization data will not be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revokePending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={revokePending}
            onClick={revokeAccount}
          >
            {revokePending ? <Spinner data-icon="inline-start" /> : null}
            Remove account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog
      open={switchTarget !== undefined}
      onOpenChange={handleSwitchDialogOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Discard local Agent work and switch account?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The old session Agent context will be revoked before account
            switching. Unsent messages, uploads, approvals, and Issue form
            drafts are cleared only after the account switch succeeds. Images
            already uploaded keep their normal short retention period.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay here</AlertDialogCancel>
          <Button onClick={confirmAccountSwitch}>
            Discard local draft and switch
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
)

const DeviceAccountRow = ({
  account,
  current,
  pending,
  mutationsPending,
  onSwitch,
  onRequestRevoke,
}: {
  account: DeviceAccount
  current: boolean
  pending: boolean
  mutationsPending: boolean
  onSwitch: (account: DeviceAccount) => void
  onRequestRevoke: (account: DeviceAccount) => void
}) => {
  const switchAccount = useCallback(
    () => onSwitch(account),
    [account, onSwitch]
  )
  const requestRevocation = useCallback(
    () => onRequestRevoke(account),
    [account, onRequestRevoke]
  )

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border p-3">
      <UserProfileImage user={account.user} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{account.user.name}</p>
          {current ? <Badge variant="secondary">Current</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {account.user.email}
        </p>
      </div>
      {current ? null : (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={mutationsPending}
            onClick={switchAccount}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Switch
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={mutationsPending}
            aria-label={`Remove ${account.user.email} from this device`}
            onClick={requestRevocation}
          >
            <LogOutIcon aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}
